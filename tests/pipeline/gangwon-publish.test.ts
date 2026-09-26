import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { preparationManifest, publishRelease, readGangwonRegister, validateReleaseDirectory } from "../../scripts/pipeline/gangwon/release";
import type { SourceRegister } from "../../scripts/pipeline/gangwon/source-register";

const register: SourceRegister = { schemaVersion: 1, profileId: "gangwon", sources: [] };
const roots: string[] = [];
async function workspace() {
  const root = await mkdtemp(path.join(os.tmpdir(), "gangwon-publish-test-"));
  roots.push(root);
  await mkdir(path.join(root, "public"));
  return root;
}
const active = (root: string) => path.join(root, "public/data");
const lock = (root: string) => path.join(root, "data/interim/gangwon/release.lock");
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

describe("강원 공개본 원자적 교체", () => {
  it("준비 상태 공개 후 목록 검사에 통과하고 잠금을 정리한다", async () => {
    const root = await workspace();
    await publishRelease(root, register, preparationManifest(), {});
    const manifest = await validateReleaseDirectory(active(root), register);
    expect(manifest.releaseStatus).toBe("preparing");
    expect(await readdir(active(root))).toEqual(["manifest.json"]);
    await expect(readFile(lock(root))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("동시에 잡힌 잠금은 공개본을 변경하지 않고 즉시 거부한다", async () => {
    const root = await workspace();
    await publishRelease(root, register, preparationManifest(), {});
    const before = await readFile(path.join(active(root), "manifest.json"), "utf8");
    await writeFile(lock(root), "other build");
    await expect(publishRelease(root, register, preparationManifest(), {})).rejects.toThrow("빌드가 실행 중");
    expect(await readFile(path.join(active(root), "manifest.json"), "utf8")).toBe(before);
    expect(await readFile(lock(root), "utf8")).toBe("other build");
  });

  it("스테이지 검증 실패 뒤 기존 공개본과 잠금을 정상 상태로 둔다", async () => {
    const root = await workspace();
    await publishRelease(root, register, preparationManifest(), {});
    const before = await readFile(path.join(active(root), "manifest.json"), "utf8");
    const malformed = preparationManifest();
    malformed.issues = {};
    await expect(publishRelease(root, register, malformed, {})).rejects.toThrow();
    expect(await readFile(path.join(active(root), "manifest.json"), "utf8")).toBe(before);
    await expect(readFile(lock(root))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("이미 공개된 강원 limited본을 준비 상태로 낮추지 않는다", async () => {
    const root = await workspace();
    await mkdir(active(root), { recursive: true });
    const existing = JSON.stringify({ profileId: "gangwon", releaseStatus: "limited", dataVersion: "approved" });
    await writeFile(path.join(active(root), "manifest.json"), existing);
    await expect(publishRelease(root, register, preparationManifest(), {})).rejects.toThrow("준비 상태로 덮어쓸 수 없습니다");
    expect(await readFile(path.join(active(root), "manifest.json"), "utf8")).toBe(existing);
    await expect(readFile(lock(root))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("공개 출처 설명이 등록부의 기관·제목·URL·기준일과 다르면 거부한다", async () => {
    const root = await workspace();
    const actualRegister = await readGangwonRegister(process.cwd());
    const source = actualRegister.sources.find(item => item.sourceId === "moe-school-level-2022")!;
    const manifest = preparationManifest();
    manifest.sources = [{ sourceId: source.sourceId, providerName: source.providerName,
      name: "등록부와 다른 제목", url: source.landingUrl, referenceDate: source.referenceDate! }];
    await mkdir(active(root), { recursive: true });
    await writeFile(path.join(active(root), "manifest.json"), JSON.stringify(manifest));
    await expect(validateReleaseDirectory(active(root), actualRegister)).rejects.toThrow("출처 등록부와 공개 설명이 다릅니다");
  });
});

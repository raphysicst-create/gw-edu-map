import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { previewRollback, rollbackRelease, runRollback } from "../../scripts/pipeline/gangwon/rollback";
import { preparationManifest, publishRelease, readGangwonRegister, validateReleaseDirectory } from "../../scripts/pipeline/gangwon/release";
import type { ReleaseManifest } from "../../src/lib/data/release";
import type { SourceRegister } from "../../scripts/pipeline/gangwon/source-register";

vi.mock("node:fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, rename: vi.fn(actual.rename) };
});

const SOURCE_ROOT = process.cwd();
const BACKUP_ID = "11111111-1111-4111-8111-111111111111";
const CURRENT_VERSION = "rollback-current-2022";
const TARGET_VERSION = "rollback-previous-2022";
const roots: string[] = [];
let register: SourceRegister;
let released: ReleaseManifest;

const active = (root: string) => path.join(root, "public/data");
const backups = (root: string) => path.join(root, "data/interim/gangwon/previous-releases");
const backup = (root: string) => path.join(backups(root), BACKUP_ID);
const lock = (root: string) => path.join(root, "data/interim/gangwon/release.lock");
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const manifestAt = async (directory: string): Promise<ReleaseManifest> => JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));

beforeAll(async () => {
  register = await readGangwonRegister(SOURCE_ROOT);
  released = await manifestAt(path.join(SOURCE_ROOT, "public/data"));
  expect(released.releaseStatus).toBe("limited");
});

afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    if (path.dirname(root) !== os.tmpdir() || !path.basename(root).startsWith("gangwon-rollback-test-")) throw new Error("Unsafe rollback test cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});

async function writeRelease(directory: string, version: string): Promise<ReleaseManifest> {
  const manifest = structuredClone(released);
  manifest.dataVersion = version;
  for (const [logical, file] of Object.entries(manifest.files)) {
    const data = JSON.parse(await readFile(path.join(SOURCE_ROOT, "public/data", released.files[logical].path), "utf8"));
    data.dataVersion = version;
    const bytes = Buffer.from(JSON.stringify(data) + "\n");
    file.path = `releases/${version}/${logical}`;
    file.sha256 = digest(bytes);
    const destination = path.join(directory, file.path);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
  }
  await writeFile(path.join(directory, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}

async function workspace(targetVersion = TARGET_VERSION) {
  const root = await mkdtemp(path.join(os.tmpdir(), "gangwon-rollback-test-"));
  roots.push(root);
  await mkdir(path.join(root, "public"));
  await mkdir(backups(root), { recursive: true });
  await cp(path.join(SOURCE_ROOT, "data/sources/gangwon"), path.join(root, "data/sources/gangwon"), { recursive: true });
  await mkdir(active(root));
  await mkdir(backup(root));
  await writeRelease(active(root), CURRENT_VERSION);
  await writeRelease(backup(root), targetVersion);
  return root;
}

async function snapshot(directory: string): Promise<string[]> {
  const result: string[] = [];
  async function visit(current: string, relative: string) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const next = path.join(current, entry.name);
      const name = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) await visit(next, name);
      else result.push(`${name}:${digest(await readFile(next))}`);
    }
  }
  await visit(directory, "");
  return result.sort();
}

describe("강원 수동 공개본 복구", () => {
  it("--preview reads a valid older limited backup without writing files or a lock", async () => {
    const root = await workspace();
    const before = await snapshot(root);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await runRollback(root, ["--preview", BACKUP_ID]);
    expect(JSON.parse(String(log.mock.calls.at(-1)?.[0]))).toMatchObject({
      mode: "preview", backupId: BACKUP_ID, currentVersion: CURRENT_VERSION,
      targetVersion: TARGET_VERSION, targetStatus: "limited", fileCount: Object.keys(released.files).length,
    });
    expect(await snapshot(root)).toEqual(before);
    await expect(lstat(lock(root))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("restores a valid backup, preserves its source bytes and separately backs up the displaced active release", async () => {
    const root = await workspace();
    const originalBackup = await snapshot(backup(root));
    const originalActive = await snapshot(active(root));
    const result = await rollbackRelease(root, register, BACKUP_ID, CURRENT_VERSION);
    expect(result).toMatchObject({ currentVersion: CURRENT_VERSION, targetVersion: TARGET_VERSION });
    expect(result.displacedBackupId).not.toBe(BACKUP_ID);
    expect(await snapshot(active(root))).toEqual(originalBackup);
    expect(await snapshot(backup(root))).toEqual(originalBackup);
    expect(await snapshot(path.join(backups(root), result.displacedBackupId))).toEqual(originalActive);
    expect((await validateReleaseDirectory(active(root), register)).dataVersion).toBe(TARGET_VERSION);
    await expect(lstat(lock(root))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects a changed backup file checksum before touching the active release", async () => {
    const root = await workspace();
    const before = await snapshot(active(root));
    const target = await manifestAt(backup(root));
    const file = target.files["schools.json"];
    await writeFile(path.join(backup(root), file.path), "tampered\n");
    await expect(previewRollback(root, register, BACKUP_ID)).rejects.toThrow("체크섬");
    expect(await snapshot(active(root))).toEqual(before);
  });

  it("rejects another profile, a preparing backup, and sources not approved by the register", async () => {
    const root = await workspace();
    const before = await snapshot(active(root));
    const target = await manifestAt(backup(root));
    await writeFile(path.join(backup(root), "manifest.json"), JSON.stringify({ ...target, profileId: "jeonbuk" }));
    await expect(previewRollback(root, register, BACKUP_ID)).rejects.toThrow();

    await writeFile(path.join(backup(root), "manifest.json"), JSON.stringify(target));
    const forbidden: SourceRegister = structuredClone(register);
    const used = target.sources[0].sourceId;
    forbidden.sources.find(source => source.sourceId === used)!.reviewStatus = "validated";
    await expect(previewRollback(root, forbidden, BACKUP_ID)).rejects.toThrow("공개 가능한 출처가 아닙니다");

    await rm(backup(root), { recursive: true });
    await mkdir(backup(root));
    await writeFile(path.join(backup(root), "manifest.json"), JSON.stringify(preparationManifest()));
    await expect(previewRollback(root, register, BACKUP_ID)).rejects.toThrow("준비 상태");
    expect(await snapshot(active(root))).toEqual(before);
  });

  it("rejects stale --current and an already active version, then cleans its acquired lock", async () => {
    const root = await workspace();
    const before = await snapshot(active(root));
    await expect(runRollback(root, ["--apply", BACKUP_ID, "--current", "stale-version"])).rejects.toThrow("현재 공개 버전이 바뀌었습니다");
    expect(await snapshot(active(root))).toEqual(before);
    await expect(lstat(lock(root))).rejects.toMatchObject({ code: "ENOENT" });

    await rm(backup(root), { recursive: true });
    await mkdir(backup(root));
    await writeRelease(backup(root), CURRENT_VERSION);
    await expect(rollbackRelease(root, register, BACKUP_ID, CURRENT_VERSION)).rejects.toThrow("이미 같은 데이터 버전");
    expect(await snapshot(active(root))).toEqual(before);
    await expect(lstat(lock(root))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects an existing publish lock without changing either release", async () => {
    const root = await workspace();
    const before = await snapshot(root);
    await writeFile(lock(root), "another publisher");
    await expect(rollbackRelease(root, register, BACKUP_ID, CURRENT_VERSION)).rejects.toThrow("빌드가 실행 중");
    await expect(publishRelease(root, register, preparationManifest(), {})).rejects.toThrow("빌드가 실행 중");
    expect(await readFile(lock(root), "utf8")).toBe("another publisher");
    expect((await snapshot(root)).filter(entry => !entry.startsWith("data/interim/gangwon/release.lock:"))).toEqual(before);
  });

  it("rejects traversal IDs and a symlink or junction backup path", async () => {
    const root = await workspace();
    await expect(previewRollback(root, register, "../other")).rejects.toThrow("백업 ID");
    await expect(previewRollback(root, register, "../../public/data")).rejects.toThrow("백업 ID");
    const outside = path.join(root, "outside");
    await mkdir(outside);
    await rm(backup(root), { recursive: true });
    await symlink(outside, backup(root), process.platform === "win32" ? "junction" : "dir");
    await expect(previewRollback(root, register, BACKUP_ID)).rejects.toThrow("일반 작업 폴더가 아닌 복구 경로");
  });

  it("rejects a symlink or junction at the active release path", async () => {
    const root = await workspace();
    const relocated = path.join(root, "relocated-active");
    await rename(active(root), relocated);
    await symlink(relocated, active(root), process.platform === "win32" ? "junction" : "dir");
    await expect(previewRollback(root, register, BACKUP_ID)).rejects.toThrow("일반 작업 폴더가 아닌 복구 경로");
    expect((await manifestAt(relocated)).dataVersion).toBe(CURRENT_VERSION);
  });

  it("restores the displaced active directory when staging promotion rename fails", async () => {
    const root = await workspace();
    const before = await snapshot(active(root));
    const sourceBefore = await snapshot(backup(root));
    const originalRename = vi.mocked(rename).getMockImplementation()!;
    vi.mocked(rename).mockImplementation(async (from, to) => {
      if (String(from).includes(`${path.sep}staging${path.sep}`) && String(to) === active(root)) throw new Error("injected promotion failure");
      return originalRename(from, to);
    });
    try {
      await expect(rollbackRelease(root, register, BACKUP_ID, CURRENT_VERSION)).rejects.toThrow("injected promotion failure");
    } finally {
      vi.mocked(rename).mockImplementation(originalRename);
    }
    expect(await snapshot(active(root))).toEqual(before);
    expect(await snapshot(backup(root))).toEqual(sourceBefore);
    await expect(lstat(lock(root))).rejects.toMatchObject({ code: "ENOENT" });
  });
});

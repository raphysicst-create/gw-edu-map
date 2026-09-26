import { describe, expect, it } from "vitest";
import { copyFile, mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { compileGangwonRelease, LIMITED_RELEASE_SOURCE_IDS } from "../../scripts/pipeline/gangwon/compile";
import { publishRelease, readGangwonRegister, validateReleaseDirectory } from "../../scripts/pipeline/gangwon/release";
import type { SourceRegister } from "../../scripts/pipeline/gangwon/source-register";

const integration = process.env.GANGWON_RELEASE_INTEGRATION === "1" ? describe : describe.skip;

integration("공식 원문 세 건으로 만든 강원 2022 제한 공개 후보", () => {
  it("실제 원문은 합성 심사 승인 상태에서만 컴파일하고 임시 공개폴더의 전체 계약을 통과한다", async () => {
    const root = process.cwd();
    const register = await readGangwonRegister(root);
    const unreviewed: SourceRegister = { ...register, sources: register.sources.map(source => source.sourceId === "moe-school-level-2022" ? { ...source, reviewStatus: "acquired" } : source) };
    await expect(compileGangwonRelease(root, unreviewed)).rejects.toThrow("공개 가능한 출처가 아닙니다");

    // This in-memory override exercises the compiler; it does not alter the
    // persistent source register or grant real publication approval.
    const reviewed: SourceRegister = { ...register, sources: register.sources.map(source => source.sourceId === "moe-school-level-2022" ? { ...source, reviewStatus: "publishable" } : source) };
    const { manifest, documents } = await compileGangwonRelease(root, reviewed);
    expect(manifest.releaseStatus).toBe("limited");
    expect(manifest.latestYear).toBe(2022);
    expect(manifest.sources.map(source => source.sourceId)).toEqual(LIMITED_RELEASE_SOURCE_IDS);
    expect(Object.values(manifest.issues).every(issue => issue.status === "unavailable")).toBe(true);
    expect(manifest.indicators.students_change_5y.status).toBe("unavailable");
    expect(manifest.indicators.classrooms_per_school.status).toBe("unavailable");
    expect(Object.values(manifest.indicators).filter(indicator => indicator.status === "available").length).toBeGreaterThanOrEqual(10);
    const schools = documents["schools.json"].data as { schools: { id: string; kediCode: string; lat: number | null; lng: number | null }[] };
    expect(schools.schools).toHaveLength(657);
    expect(new Set(schools.schools.map(school => school.kediCode)).size).toBe(657);
    expect(schools.schools.every(school => school.id === `kedi-${school.kediCode}` && school.lat === null && school.lng === null)).toBe(true);
    expect(Object.keys(documents).filter(name => name.startsWith("emd/"))).toHaveLength(18);

    const temp = await mkdtemp(path.join(os.tmpdir(), "gangwon-compile-test-"));
    try {
      await mkdir(path.join(temp, "public"));
      for (const id of LIMITED_RELEASE_SOURCE_IDS) {
        const source = reviewed.sources.find(entry => entry.sourceId === id)!;
        const destination = path.join(temp, source.localPath!);
        await mkdir(path.dirname(destination), { recursive: true });
        await copyFile(path.join(root, source.localPath!), destination);
      }
      await publishRelease(temp, reviewed, manifest, documents);
      const validated = await validateReleaseDirectory(path.join(temp, "public/data"), reviewed);
      expect(validated.dataVersion).toBe(manifest.dataVersion);
      expect(Object.keys(validated.files).length).toBe(Object.keys(documents).length);
      const activeManifest = JSON.parse(await readFile(path.join(temp, "public/data/manifest.json"), "utf8"));
      expect(activeManifest.profileId).toBe("gangwon");
      expect(activeManifest.schemaVersion).toBe(2);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  }, 240_000);
});

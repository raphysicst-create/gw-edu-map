import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { preparationManifest, publishRelease, readGangwonRegister, validateReleaseDirectory } from "./release";
import { compileGangwonRelease, LIMITED_RELEASE_SOURCE_IDS } from "./compile";

export async function runGangwonBuild(root = process.cwd(), mode = "build"): Promise<void> {
  const register = await readGangwonRegister(root);
  if (mode === "validate" || mode === "preflight") {
    const manifest = await validateReleaseDirectory(path.join(root, "public/data"), register);
    if (mode === "preflight" && manifest.releaseStatus === "preparing") throw new Error("학교 모집단과 공개 조건 확인이 끝나지 않아 공개 배포를 보류합니다.");
    console.log(`강원 산출물: ${manifest.releaseStatus}, ${Object.keys(manifest.files).length}개 공개 파일`);
    return;
  }
  if (LIMITED_RELEASE_SOURCE_IDS.every(id => register.sources.some(source => source.sourceId === id && source.reviewStatus === "publishable"))) {
    const { manifest, documents } = await compileGangwonRelease(root, register);
    await publishRelease(root, register, manifest, documents);
    console.log(`강원 ${manifest.latestYear}년 제한 공개 산출물을 생성했습니다. 좌표·미검증 자료는 결측 또는 미제공 상태입니다.`);
    return;
  }
  // Source intake is deliberately separate from publication. Until school
  // completeness review is recorded, no raw statistics become public values.
  let previous: { profileId?: string; releaseStatus?: string } | undefined;
  try { previous = JSON.parse(await readFile(path.join(root, "public/data/manifest.json"), "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  if (previous?.profileId === "gangwon" && previous.releaseStatus !== "preparing") throw new Error("학교 원자료 심사와 새 데이터 구성이 완료되지 않아 기존 강원 공개본을 유지합니다.");
  await publishRelease(root, register, preparationManifest(), {});
  console.log("강원 준비 상태를 생성했습니다. 지표 18개·교육문제 10개의 미제공 사유를 기록했습니다.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runGangwonBuild(process.cwd(), process.argv[2] ?? "build").catch(error => { console.error(error.message); process.exitCode = 1; });
}

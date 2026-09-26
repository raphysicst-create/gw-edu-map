import { mkdir, open, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { INDICATORS } from "../../../src/lib/indicators/registry";
import { ACTIVE_PROFILE } from "../../../src/lib/profiles";
import { assertDatasetIdentity, assertReleaseManifest, type Availability, type DatasetIdentity, type ReleaseManifest } from "../../../src/lib/data/release";
import { assertPublishable, assertSourceBytes, assertSourceRegister, sha256, sourcePath, type SourceRegister } from "./source-register";
import { assertBundle, loadBundle } from "../../../src/lib/data/load";
import { assertIssueData } from "../../../src/lib/issues/validate";

const UNAVAILABLE_REASONS: Record<string, string> = {
  students_total: "운영상태와 모집단을 확인한 학교별 학생수·공식 합계 대조가 필요합니다.",
  schools_total: "본교·분교·운영상태를 확인한 완전한 학교 명단이 필요합니다.",
  classes_total: "학급 종류와 대상 학교 범위를 확인한 완전한 통계가 필요합니다.",
  students_per_class: "같은 모집단의 학생수와 학급수가 필요합니다.",
  teachers_total: "교원 범주와 대상 학교 범위를 확인한 완전한 통계가 필요합니다.",
  students_per_teacher: "같은 모집단의 학생수와 교원수가 필요합니다.",
  site_area_per_student: "학교별 교지면적과 학생수의 완전성 확인이 필요합니다.",
  classrooms_per_school: "교실 유형과 본분교의 시설 포함 범위 확인이 필요합니다.",
  small_schools: "운영 중인 본교의 학생수 확인이 필요합니다. 탐색 기준은 60명 이하입니다.",
  small_school_share: "학생수 미상 학교가 없는 전체 본교 모집단이 필요합니다.",
  zero_entrant_schools: "본교별 입학생수의 명시적 0과 결측 구분이 필요합니다.",
  rural_school_share: "완전한 본교 명단과 공식 소재지의 면지역 구분이 필요합니다.",
  special_classes: "일반학교 특수학급과 특수학교의 동일 시점 자료가 필요합니다.",
  special_students: "일반학교 특수학급 학생과 특수학교 학생의 동일 시점 자료가 필요합니다.",
  students_change_5y: "모집단이 비교 가능한 실제 과거 연도 자료가 필요합니다.",
  closed_schools: "전체 폐교재산 명단이 필요합니다. 미활용 부분목록으로 대체하지 않습니다.",
  closed_schools_unused: "취득한 미활용 명단의 가공·재배포 조건을 확인하고 있습니다.",
  closed_schools_recent: "전체 등재 폐교와 폐교연도 자료가 필요합니다.",
};
const unavailable = (reason: string): Availability => ({ status: "unavailable", reason, sourceIds: [] });

export function preparationManifest(): ReleaseManifest {
  const content = JSON.stringify(UNAVAILABLE_REASONS);
  return {
    profileId: "gangwon", schemaVersion: 2, dataVersion: `preparing-${sha256(Buffer.from(content)).slice(0, 12)}`,
    releaseStatus: "preparing", latestYear: null, builtAt: new Date().toISOString(), sources: [], files: {},
    indicators: Object.fromEntries(INDICATORS.map(d => [d.id, { ...unavailable(UNAVAILABLE_REASONS[d.id]), years: [] }])),
    issues: Object.fromEntries(ACTIVE_PROFILE.policy.issues.map(issue => [issue.id, unavailable(issue.dataNeeded ?? "공식 원자료 확인이 필요합니다.")])),
    features: {
      schools: unavailable("공식 학교별 자료의 중복·누락과 모집단을 확인하고 있습니다."),
      regions: unavailable("정부 경계 원본은 확보했습니다. 학교 자료와 함께 공개하기 위한 통합 작업 중입니다."),
      neighbors: unavailable("학교·시군 핵심 자료와 함께 공개할 예정입니다."),
      emd: unavailable("행정동 경계의 공개 산출물을 준비하고 있습니다."),
      closedSchools: unavailable(UNAVAILABLE_REASONS.closed_schools),
      educationIssues: unavailable("주제별 공식 통계·정책·기관 명단을 확인하고 있습니다."),
    },
  };
}

export async function readGangwonRegister(root: string): Promise<SourceRegister> {
  const base = path.join(root, "data/sources/gangwon");
  const files = (await readdir(base)).filter(name => name === "source-register.json" || name.endsWith("-sources.json")).sort();
  const parts = await Promise.all(files.map(async name => JSON.parse(await readFile(path.join(base, name), "utf8")) as SourceRegister));
  const register: SourceRegister = { schemaVersion: 1, profileId: "gangwon", sources: parts.flatMap(part => { assertSourceRegister(part); return part.sources; }) };
  assertSourceRegister(register);
  return register;
}

/** All public files carry the same release identity, including text-like charset. */
export function identify<T extends object>(identity: DatasetIdentity, data: T): T & DatasetIdentity {
  return { ...data, profileId: identity.profileId, schemaVersion: identity.schemaVersion, dataVersion: identity.dataVersion };
}

function inside(root: string, relative: string): string {
  const resolved = path.resolve(root, relative);
  const rest = path.relative(path.resolve(root), resolved);
  if (!rest || rest.startsWith("..") || path.isAbsolute(rest)) throw new Error(`작업 폴더 밖 경로: ${relative}`);
  return resolved;
}

export async function validateReleaseDirectory(directory: string, register: SourceRegister): Promise<ReleaseManifest> {
  const manifest: unknown = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
  assertReleaseManifest(manifest);
  for (const declared of manifest.sources) {
    assertPublishable(register, [declared.sourceId]);
    const source = register.sources.find(item => item.sourceId === declared.sourceId)!;
    if (declared.providerName !== source.providerName || declared.name !== source.title || declared.url !== source.landingUrl || declared.referenceDate !== source.referenceDate) throw new Error(`출처 등록부와 공개 설명이 다릅니다: ${source.sourceId}`);
  }
  const allowed = new Set(["manifest.json", ...Object.values(manifest.files).map(file => file.path)]);
  const visit = async (relative: string) => {
    for (const entry of await readdir(path.join(directory, relative), { withFileTypes: true })) {
      const name = path.posix.join(relative, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`심볼릭 링크는 공개할 수 없습니다: ${name}`);
      if (entry.isDirectory()) await visit(name);
      else if (!allowed.has(name)) throw new Error(`목록에 없는 공개 파일: ${name}`);
    }
  };
  await visit("");
  for (const [logical, file] of Object.entries(manifest.files)) {
    assertPublishable(register, file.sourceIds);
    const bytes = await readFile(inside(directory, file.path));
    if (sha256(bytes) !== file.sha256) throw new Error(`공개 파일 체크섬 불일치: ${logical}`);
    assertDatasetIdentity(JSON.parse(bytes.toString("utf8")), manifest);
  }
  if (manifest.releaseStatus !== "preparing") {
    const bundle = await loadBundle(async url => {
      if (!url.startsWith("/data/")) throw new Error("공개 폴더 밖 파일 요청");
      return new Response(await readFile(inside(directory, url.slice("/data/".length)), "utf8"), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    assertBundle(bundle);
    if (manifest.features.educationIssues.status === "available") {
      const facts = JSON.parse(await readFile(inside(directory, manifest.files["education-issues.json"].path), "utf8"));
      assertIssueData(facts, bundle.schools, manifest);
    }
  }
  return manifest;
}

/** Stage completely, validate, then swap. A failed promotion restores the previous directory. */
export async function publishRelease(root: string, register: SourceRegister, manifest: ReleaseManifest, documents: Record<string, { data: object; sourceIds: string[] }>): Promise<void> {
  await withReleaseLock(root, () => stageAndPublish(root, register, manifest, documents));
}

/** Publication and manual restoration must never swap the active directory concurrently. */
export async function withReleaseLock<T>(root: string, action: () => Promise<T>): Promise<T> {
  const lockPath = inside(root, "data/interim/gangwon/release.lock");
  await mkdir(path.dirname(lockPath), { recursive: true });
  const lock = await open(lockPath, "wx").catch(error => {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("다른 강원 데이터 빌드가 실행 중입니다. 완료 후 다시 실행해 주세요.");
    throw error;
  });
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    return await action();
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}

async function stageAndPublish(root: string, register: SourceRegister, manifest: ReleaseManifest, documents: Record<string, { data: object; sourceIds: string[] }>): Promise<void> {
  let previous: { profileId?: string; releaseStatus?: string } | undefined;
  try { previous = JSON.parse(await readFile(inside(root, "public/data/manifest.json"), "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  if (previous?.profileId === "gangwon" && previous.releaseStatus !== "preparing" && manifest.releaseStatus === "preparing") throw new Error("기존 강원 공개본을 준비 상태로 덮어쓸 수 없습니다.");
  const usedIds = [...new Set(Object.values(documents).flatMap(document => document.sourceIds))];
  if (usedIds.length) assertPublishable(register, usedIds);
  for (const id of usedIds) {
    const source = register.sources.find(s => s.sourceId === id)!;
    assertSourceBytes(source, await readFile(sourcePath(root, source.localPath!)));
  }
  const token = randomUUID();
  const stage = inside(root, `data/interim/gangwon/staging/${token}`);
  const active = inside(root, "public/data");
  const backup = inside(root, `data/interim/gangwon/previous-releases/${token}`);
  await mkdir(stage, { recursive: true });
  for (const [logical, document] of Object.entries(documents)) {
    if (!/^[a-z0-9/_-]+\.(json|geojson)$/.test(logical)) throw new Error(`잘못된 공개 파일명: ${logical}`);
    const relative = `releases/${manifest.dataVersion}/${logical}`;
    const bytes = Buffer.from(JSON.stringify(identify(manifest, document.data)) + "\n");
    manifest.files[logical] = { path: relative, sha256: sha256(bytes), sourceIds: document.sourceIds };
    const target = inside(stage, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }
  assertReleaseManifest(manifest);
  await writeFile(path.join(stage, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  await validateReleaseDirectory(stage, register);
  await mkdir(path.dirname(backup), { recursive: true });
  let moved = false;
  try { await rename(active, backup); moved = true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  try { await rename(stage, active); }
  catch (error) { if (moved) await rename(backup, active); throw error; }
}

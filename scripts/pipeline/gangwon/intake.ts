/** Source intake only. Never writes to public/data or promotes a source. */
import { readFile, writeFile, mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertSourceBytes, assertSourceRegister, sourcePath, type SourceRegister } from "./source-register";
import { PARSER_VERSION, REGION_NAMES, parseSchoolOverview, parseUnusedClosed } from "./parse";
import { readGangwonRegister } from "./release";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const outputDir = path.join(root, "data/interim/gangwon");
const register: SourceRegister = await readGangwonRegister(root);
assertSourceRegister(register);
const mode = process.argv[2];
if (!["fetch", "audit", "preflight"].includes(mode)) throw new Error("사용법: intake.ts fetch|audit|preflight");

if (mode === "fetch") {
  for (const source of register.sources.filter((entry) => entry.localPath)) {
    const destination = sourcePath(root, source.localPath!);
    let existing: Buffer | undefined;
    try { existing = await readFile(destination); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    if (existing) {
      assertSourceBytes(source, existing);
      console.log(`[확인] ${source.sourceId}: 기존 원본 체크섬 일치`);
      continue;
    }
    const headers: Record<string, string> = { ...source.requestHeaders };
    if (source.downloadMethod === "POST" || source.requiresSession) {
      const landing = await fetch(source.landingUrl, { signal: AbortSignal.timeout(30_000) });
      if (!landing.ok) throw new Error(`${source.sourceId}: 공식 다운로드 세션 생성 실패 (HTTP ${landing.status})`);
      const cookies = landing.headers.getSetCookie().map(cookie => cookie.split(";", 1)[0]).join("; ");
      if (cookies) headers.Cookie = cookies;
    }
    if (source.downloadMethod === "POST") headers["Content-Type"] = "application/x-www-form-urlencoded";
    const response = await fetch(source.downloadUrl!, { method: source.downloadMethod ?? "GET", headers, body: source.downloadMethod === "POST" ? new URLSearchParams(source.downloadBody) : undefined, signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error(`${source.sourceId}: HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    assertSourceBytes(source, bytes);
    await mkdir(path.dirname(destination), { recursive: true });
    const temporary = `${destination}.part`;
    try {
      await writeFile(temporary, bytes);
      await rename(temporary, destination);
    } finally { await rm(temporary, { force: true }); }
    // Registry dates record first acquisition; a local receipt records this run.
    await writeFile(`${destination}.receipt.json`, JSON.stringify({ sourceId: source.sourceId, retrievedAt: new Date().toISOString(), sha256: source.sha256, downloadUrl: source.downloadUrl }, null, 2) + "\n");
    console.log(`[취득] ${source.sourceId}: ${bytes.length} bytes, SHA-256 일치`);
  }
} else {
  const readSource = async (id: string) => {
    const source = register.sources.find((entry) => entry.sourceId === id);
    if (!source?.localPath) throw new Error(`${id}: 취득 원본 경로 없음`);
    const bytes = await readFile(sourcePath(root, source.localPath));
    assertSourceBytes(source, bytes);
    return bytes;
  };
  const schools = parseSchoolOverview(await readSource("gwe-school-overview-2026"));
  const unused = parseUnusedClosed(await readSource("gwe-unused-closed-2025"));
  const included = schools.filter((row) => row.level !== null);
  const levelCounts: Record<string, number> = {};
  const exclusionCounts: Record<string, number> = {};
  const keys = new Map<string, number[]>();
  for (const row of schools) {
    levelCounts[row.rawLevel] = (levelCounts[row.rawLevel] ?? 0) + 1;
    if (row.exclusionReason) exclusionCounts[row.rawLevel] = (exclusionCounts[row.rawLevel] ?? 0) + 1;
    const key = `${row.regionName}|${row.rawLevel}|${row.name}`;
    keys.set(key, [...(keys.get(key) ?? []), row.sourceRow]);
  }
  const blockers = [
    "공식 학교 ID·본분교·운영상태·주소 보완 자료의 적용 범위와 연결 심사 미완료",
    "저장·재배포 가능한 공식 학교 좌표 미확보",
    ...(!register.sources.some(source => source.sourceId === "mods-sgis-administrative-boundaries-2025q2" && source.reviewStatus === "publishable") ? ["정부 직접 제공 경계의 공개 심사 미완료"] : []),
    "동일 기준일·정의의 독립적인 공식 합계 대조 미완료",
    "미활용 폐교 제3유형 자료의 가공·재배포 조건 미확인",
  ];
  const report = {
    schemaVersion: 1, profileId: "gangwon", parserVersion: PARSER_VERSION,
    publicationStatus: "blocked", officialComparison: "not-performed",
    sources: register.sources.map(({ sourceId, sha256, reviewStatus }) => ({ sourceId, sha256, reviewStatus })),
    schoolOverview: {
      sourceRows: schools.length, targetLevelRows: included.length, byRawLevel: levelCounts, excludedByLevel: exclusionCounts,
      targetRowsByRegion: Object.fromEntries(REGION_NAMES.map((region) => [region, included.filter((row) => row.regionName === region).length])),
      duplicateNameKeys: [...keys].filter(([, rows]) => rows.length > 1).map(([key, sourceRows]) => ({ key, sourceRows })),
      missingNumericCells: Object.fromEntries(Object.keys(schools[0].counts).map((field) => [field, schools.filter((row) => row.counts[field].value === null).length])),
      officialSchoolIds: 0, knownBranchStatus: 0, coordinates: 0,
      note: "행 수는 공식 본교 수가 아님. 이름 유사도 연결·분교명 추정·결측 0 처리 없이 원본 행 보존.",
    },
    unusedClosed: {
      sourceRows: unused.length, scope: "unused-only", redistribution: "unverified",
      listedRegions: REGION_NAMES.filter((region) => unused.some((row) => row.regionName === region)),
      note: "향후계획과 현재 활용상태를 구분. 전체 폐교 지표와 전체 대비 비율 생성 금지.",
    },
    blockers,
  };
  await mkdir(outputDir, { recursive: true });
  // Internal intermediates stay ignored until the source's publication review.
  await writeFile(path.join(outputDir, "school-overview.json"), JSON.stringify({ profileId: "gangwon", sourceId: "gwe-school-overview-2026", rows: schools }, null, 2) + "\n");
  await writeFile(path.join(outputDir, "unused-closed.json"), JSON.stringify({ profileId: "gangwon", sourceId: "gwe-unused-closed-2025", rows: unused }, null, 2) + "\n");
  await writeFile(path.join(root, "data/sources/gangwon/intake-report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(`원본 검사 완료: 학교개황 ${schools.length}행 (대상 학교급 ${included.length}행), 미활용 폐교 ${unused.length}행`);
  console.log(`학교명 중복키 ${report.schoolOverview.duplicateNameKeys.length}개. 공개 상태: blocked`);
  if (mode === "preflight") {
    console.error(blockers.map((message) => `- ${message}`).join("\n"));
    process.exitCode = 1;
  }
}

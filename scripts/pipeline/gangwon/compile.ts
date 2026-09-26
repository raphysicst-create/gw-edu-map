import { readFile } from "node:fs/promises";
import { ACTIVE_PROFILE } from "../../../src/lib/profiles";
import type { IndicatorFile, IndicatorRow, SeriesFile } from "../../../src/lib/indicators/types";
import type { Availability, ReleaseManifest } from "../../../src/lib/data/release";
import type { School, SchoolsFile } from "../../../src/lib/schools/types";
import type { EducationIssuesFile, SchoolIssueFacts } from "../../../src/lib/issues/types";
import { assertIssueData } from "../../../src/lib/issues/validate";
import { aggregateGangwonSchoolIndicators, SCHOOL_INDICATOR_IDS } from "./aggregate";
import { MOE_SCHOOL_SOURCE_ID, parseMoeSchoolWorkbook } from "./moe";
import { preparationManifest } from "./release";
import { assertPublishable, assertSourceBytes, sha256, sourcePath, type SourceRegister } from "./source-register";
import { buildGangwonSpatialLayersFromZip } from "./spatial";
import { buildCharset } from "../build-charset";

export const LIMITED_RELEASE_SOURCE_IDS = [MOE_SCHOOL_SOURCE_ID, "mods-sgis-administrative-boundaries-2025q2", "molit-legal-dong-code-20260630"];
const SCOPE = "2022-04-01 강원 초·중·고·특수학교. 폐교 제외·휴교 포함. 학생·학급·교원은 분교 포함, 학교수·소규모·신입생 0명·면지역 비율은 본교 기준. 시군 명칭으로 현재 코드에 연결하며 경계 기준일은 별도 표시.";
type Document = { data: object; sourceIds: string[] };

/** Compile only reviewed original files. No location inference or cross-year filling. */
export async function compileGangwonRelease(root: string, register: SourceRegister): Promise<{ manifest: ReleaseManifest; documents: Record<string, Document> }> {
  assertPublishable(register, LIMITED_RELEASE_SOURCE_IDS);
  const sources = LIMITED_RELEASE_SOURCE_IDS.map(id => register.sources.find(s => s.sourceId === id)!);
  const schoolSource = sources[0];
  const schoolBytes = await readFile(sourcePath(root, schoolSource.localPath!));
  assertSourceBytes(schoolSource, schoolBytes);
  const parsed = parseMoeSchoolWorkbook(schoolBytes);
  if (parsed.referenceDate !== schoolSource.referenceDate) throw new Error("학교 통계 원문과 등록 기준일이 다릅니다.");
  const year = Number(parsed.referenceDate.slice(0, 4));
  const regionCodes = new Map(ACTIVE_PROFILE.regions.map(region => [region.name, region.code]));
  regionCodes.set(ACTIVE_PROFILE.province.name, ACTIVE_PROFILE.province.aggregateCode);
  const regionCode = (name: string) => {
    const code = regionCodes.get(name);
    if (!code) throw new Error(`강원 지역 코드 대응 없음: ${name}`);
    return code;
  };
  const statsSource = { name: schoolSource.title, url: schoolSource.landingUrl, referenceDate: parsed.referenceDate };
  const schools: School[] = parsed.rows.filter(row => row.status === "active").map(row => {
    const kediCode = row.sourceSchoolIds.kedi;
    if (!kediCode) throw new Error(`공식 학교 코드 누락: ${row.recordId}`);
    const students = row.counts.students.value;
    const classes = row.counts.classes.value;
    return {
      id: `kedi-${kediCode}`, kediCode, sourceSchoolIds: row.sourceSchoolIds,
      sourceRecord: { sourceId: row.sourceId, sheet: row.sourceSheet, row: row.sourceRow },
      name: row.name, level: row.level, status: row.rawStatus, branch: row.branch === true,
      regionCode: regionCode(row.regionName), address: row.address ?? undefined,
      lat: null, lng: null, locationMissingReason: "저장·재배포가 허용된 공식 학교 좌표 자료 미확보",
      students, classes, teachers: row.counts.teachers.value,
      studentsPerClass: students !== null && classes !== null && classes > 0 ? students / classes : null,
      small: row.branch === false && students !== null && students <= 60,
      statisticsSource: statsSource,
    };
  });
  if (new Set(schools.map(s => s.id)).size !== schools.length) throw new Error("공식 학교 코드 중복으로 공개를 중단합니다.");
  const schoolsFile: SchoolsFile & { scope: string } = { referenceDate: { stats: parsed.referenceDate, location: null }, source: { stats: statsSource, location: null }, schools, scope: SCOPE };
  const spatial = await buildGangwonSpatialLayersFromZip(sourcePath(root, sources[1].localPath!));
  const manifest = preparationManifest();
  manifest.releaseStatus = "limited";
  manifest.latestYear = year;
  manifest.sources = sources.map(source => ({ sourceId: source.sourceId, providerName: source.providerName, name: source.title, url: source.landingUrl, referenceDate: source.referenceDate!, ...(source.publishedAt ? { publishedAt: source.publishedAt } : {}) }));
  const available = (sourceIds: string[], referenceDate: string, scope: string): Availability => ({ status: "available", sourceIds, referenceDate, scope });
  const schoolIds = [MOE_SCHOOL_SOURCE_ID];
  const spatialIds = sources.slice(1).map(s => s.sourceId);
  for (const id of ["school-size", "special-education"]) manifest.issues[id] = {
    status: "unavailable", sourceIds: schoolIds,
    reason: "2022 학교 통계는 지표에서 제공합니다. 교육문제 화면의 정책 근거는 원문별 공개 조건을 확인 중입니다.",
  };
  manifest.features.schools = available(schoolIds, parsed.referenceDate, `${SCOPE} 좌표 미확보 학교는 검색·상세에서만 제공.`);
  manifest.features.regions = available(spatialIds, sources[1].referenceDate!, "정부 SGIS 2025년 2분기 시군구 경계 중 강원 18시군. 통계지역코드를 현재 법정동 시군 코드에 명시적으로 대응.");
  manifest.features.neighbors = available(spatialIds, sources[1].referenceDate!, "정부 SGIS 인접 경기·충북·경북 시도 경계");
  manifest.features.emd = available(spatialIds, sources[1].referenceDate!, "정부 SGIS 강원 행정동 경계 193개. 법정동 경계와 구별.");
  manifest.indicators.students_change_5y = { status: "unavailable", years: [], sourceIds: schoolIds, reason: "2022년 단독 시점만 검증되어 학생수 증감률과 다년 추이를 제공하지 않습니다." };
  const documents: Record<string, Document> = {
    "schools.json": { data: schoolsFile, sourceIds: schoolIds },
    "regions.geojson": { data: spatial.regions, sourceIds: spatialIds },
    "neighbors.geojson": { data: spatial.neighbors, sourceIds: spatialIds },
    "charset.json": { data: { charset: buildCharset([ACTIVE_PROFILE.province.name, ...ACTIVE_PROFILE.regions.map(r => r.name), ...spatial.neighbors.features.map(f => f.properties.name), ...[...spatial.emdByRegion.values()].flatMap(collection => collection.features.map(f => f.properties.name)), ...schools.map(s => s.name)]) }, sourceIds: [...schoolIds, ...spatialIds] },
  };
  const schoolFacts: Record<string, SchoolIssueFacts> = {};
  for (const row of parsed.rows.filter(row => row.status === "active")) {
    schoolFacts[`kedi-${row.sourceSchoolIds.kedi}`] = {
      kediCode: row.sourceSchoolIds.kedi,
      sourceRecord: { sourceId: row.sourceId, sheet: row.sourceSheet, row: row.sourceRow },
      isMain: row.branch === false,
      status: row.rawStatus === "휴(원)교" ? "휴교" : row.rawStatus === "신설(원)교" ? "신설" : "기존",
      entrants: row.counts.entrants.value, specialClasses: row.counts.specialClasses.value,
      specialStudents: row.counts.specialStudents.value,
      librarianTeachers: row.counts.librarians.value, counselorTeachers: row.counts.counselors.value,
    };
  }
  const facts: EducationIssuesFile = { version: 1, statsReferenceDate: parsed.referenceDate,
    sources: [{ ...statsSource, scope: SCOPE }],
    designations: Object.fromEntries(ACTIVE_PROFILE.regions.map(r => [r.code, null])), schools: schoolFacts };
  assertIssueData(facts, schoolsFile, manifest);
  manifest.features.educationIssues = available(schoolIds, parsed.referenceDate, "학교별 입학생·특수학급·사서·상담교사 통계. 인구감소 지정과 정책·기관 명단은 미제공.");
  documents["education-issues.json"] = { data: facts, sourceIds: schoolIds };
  for (const [code, data] of spatial.emdByRegion) documents[`emd/${code}.geojson`] = { data, sourceIds: spatialIds };
  const cells = aggregateGangwonSchoolIndicators({ ...parsed, year, scopeKey: "moe-2022-four-levels-closed-excluded" });
  for (const id of SCHOOL_INDICATOR_IDS) {
    if (id === "students_change_5y" || id === "classrooms_per_school") continue;
    const selected = cells.filter(cell => cell.indicatorId === id);
    if (!selected.some(cell => cell.value !== null)) continue;
    const rows: (IndicatorRow & { missingReason?: string })[] = selected.map(cell => ({ regionCode: regionCode(cell.regionName), value: cell.value, ...(cell.level ? { level: cell.level } : {}), ...(cell.reason ? { missingReason: cell.reason } : {}) }));
    const indicator: IndicatorFile & { scope: string } = { id, year, referenceDate: parsed.referenceDate, source: { name: schoolSource.title, url: schoolSource.landingUrl, year }, rows, scope: SCOPE };
    manifest.indicators[id] = { ...available(schoolIds, parsed.referenceDate, SCOPE), years: [year] };
    documents[`indicators/${id}.json`] = { data: indicator, sourceIds: schoolIds };
    const series: SeriesFile = { id, rows: rows.filter(row => !row.level).map(row => ({ regionCode: row.regionCode, year, value: row.value })) };
    documents[`series/${id}.json`] = { data: series, sourceIds: schoolIds };
  }
  manifest.indicators.classrooms_per_school = { status: "unavailable", years: [], sourceIds: schoolIds, reason: "2022 원본 교실 유형별 결측과 본분교 시설 중복 여부를 확인 중입니다." };
  documents["provenance.json"] = { sourceIds: LIMITED_RELEASE_SOURCE_IDS, data: {
    compilerVersion: "gangwon-limited-v1", schoolScope: SCOPE,
    sources: sources.map(({ sourceId, providerName, title, landingUrl, referenceDate, sha256, license, scope, parserVersion, publicationReview }) => ({ sourceId, providerName, title, landingUrl, referenceDate, sha256, license, scope, parserVersion, publicationReview })),
    schoolAudit: parsed.audit,
    publishedSchoolRecords: schools.length,
    excludedClosedRecords: parsed.rows.filter(row => row.status === "closed").length,
    coordinates: { available: 0, missing: schools.length, reason: "저장·재배포 가능한 공식 학교 좌표 미확보" },
    aggregation: { ratio: "분자 총합 / 분모 총합", missing: "결측·비공개·미수록을 0으로 바꾸지 않음", smallSchoolThreshold: "본교 학생수 60명 이하 자체 탐색 기준", baseline: "비교 가능한 두 번째 연도 미확보" },
    indicatorMissingCells: Object.fromEntries(SCHOOL_INDICATOR_IDS.map(id => [id, cells.filter(cell => cell.indicatorId === id && cell.reason).map(({ regionName, level, reason }) => ({ regionName, level, reason }))])),
  } };
  // Content-derived identity changes with transformed geometry, definitions,
  // availability or provenance as well as with source bytes. builtAt is excluded.
  const content = { indicators: manifest.indicators, issues: manifest.issues, features: manifest.features, sources: manifest.sources, documents };
  manifest.dataVersion = `gangwon-${year}-${sha256(Buffer.from(JSON.stringify(content))).slice(0, 16)}`;
  return { manifest, documents };
}

/** The Ministry of Education's own 2022 school-level education-statistics attachment.
 *
 * This file is distinct from similarly named later KESS downloads. Its source
 * is the exact MOE attachment recorded as `moe-school-level-2022`.
 */
import * as XLSX from "xlsx";
import { REGION_NAMES, parseNumber, type SourceNumber } from "./parse";
import type { CoverageAttestation, Level } from "./aggregate";
import type { SchoolDetailRecord } from "./school-details";

export const MOE_SCHOOL_SOURCE_ID = "moe-school-level-2022";
export const MOE_SCHOOL_PARSER_VERSION = "moe-school-level-2022-v1";
export const MOE_SCHOOL_SHEET = "학교별 주요통계";

const LEVEL_BY_LABEL: Record<string, Level> = {
  초등학교: "elem", 중학교: "mid", 고등학교: "high", 특수학교: "special",
};
const OTHER_LEVELS = new Set(["유치원", "방송통신중학교", "방송통신고등학교", "각종학교", "고등공민학교", "고등기술학교"]);
const STATUS_BY_LABEL: Record<string, SchoolDetailRecord["status"]> = {
  "기존(원)교": "active", "신설(원)교": "active", "휴(원)교": "active", "폐(원)교": "closed",
};
const AREA_BY_LABEL: Record<string, NonNullable<SchoolDetailRecord["officialAreaType"]>> = {
  "시": "시", "읍지역": "읍", "면지역": "면", "특수지역": "특수",
};

const REQUIRED_COLUMNS = {
  sourceDate: "조사기준일", sido: "시도", region: "행정구", level: "학교급",
  category: "고등학교유형", name: "학교명", kedi: "KEDI학교코드",
  neis: "나이스학교코드", branch: "본분교", establishment: "설립",
  status: "상태", area: "지역규모", openedAt: "개교일", address: "주소",
  website: "홈페이지", nativeSchoolCount: "학교수",
  classes: "편성학급수_계", students: "학생수_총계_계",
  teachers: "교원수_총계_계", counselors: "교원수_정규_상담_계",
  librarians: "교원수_정규_사서_계", entrants: "입학자_계",
  graduates: "졸업자_계", specialClasses: "특수학급_학급수",
  specialStudents: "특수학급_학생수_계", classroomGeneral: "일반교실",
  classroomSubject: "교과교실", classroomSpecial: "특별교실",
  classroomLeveled: "수준별교실", classroomOther: "기타교실",
  siteArea: "교지면적",
} as const;

const clean = (value: unknown): string => String(value ?? "").trim();
const norm = (value: unknown): string => clean(value).replace(/\s+/g, "");
const numeric = (value: unknown, integer = true): SourceNumber => parseNumber(clean(value), integer);

function strictSum(values: readonly SourceNumber[]): SourceNumber {
  const absent = values.find((value) => value.value === null);
  if (absent?.value === null) return absent;
  return { value: values.reduce((total, item) => total + item.value!, 0), reason: null };
}

function sourceReferenceDate(rows: unknown[][]): string {
  for (const row of rows.slice(0, 20)) {
    const match = /조사\s*기준일\s*:\s*(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\./.exec(clean(row[0]));
    if (match) return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  }
  throw new Error(`${MOE_SCHOOL_SOURCE_ID}: 조사 기준일 원문 주석을 찾지 못했습니다.`);
}

export type MoeSchoolAudit = {
  sourceId: typeof MOE_SCHOOL_SOURCE_ID;
  sourceSheet: typeof MOE_SCHOOL_SHEET;
  rawGangwonRows: number;
  targetRows: number;
  omittedByLevel: Record<string, number>;
  nativeMainSchoolCountByLevel: Record<Level, number>;
  parsedMainSchoolCountByLevel: Record<Level, number>;
  nullNumericFields: Record<string, number>;
};

export type MoeSchoolParseResult = {
  referenceDate: string;
  rows: SchoolDetailRecord[];
  coverage: CoverageAttestation[];
  mainSchoolRecordIds: Set<string>;
  audit: MoeSchoolAudit;
};

/** Strict, source-local adapter; publication eligibility remains a separate review. */
export function parseMoeSchoolWorkbook(bytes: Uint8Array): MoeSchoolParseResult {
  const workbook = XLSX.read(bytes, { type: "buffer", sheets: [MOE_SCHOOL_SHEET] });
  const sheet = workbook.Sheets[MOE_SCHOOL_SHEET];
  if (!sheet) throw new Error(`${MOE_SCHOOL_SOURCE_ID}: ${MOE_SCHOOL_SHEET} 시트 없음`);
  const allRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true });
  const referenceDate = sourceReferenceDate(allRows);
  if (referenceDate !== "2022-04-01") throw new Error(`${MOE_SCHOOL_SOURCE_ID}: 예상과 다른 조사 기준일 ${referenceDate}`);
  const headerIndex = allRows.findIndex((row) => norm(row[1]) === "시도" && norm(row[4]) === "학교급" && norm(row[8]) === "학교명");
  if (headerIndex < 0) throw new Error(`${MOE_SCHOOL_SOURCE_ID}: 학교별 헤더 없음`);
  const headers = allRows[headerIndex].map(norm);
  const col = {} as Record<keyof typeof REQUIRED_COLUMNS, number>;
  for (const [key, label] of Object.entries(REQUIRED_COLUMNS)) {
    const index = headers.indexOf(norm(label));
    if (index < 0) throw new Error(`${MOE_SCHOOL_SOURCE_ID}: 원문 열 ${label} 없음`);
    col[key as keyof typeof REQUIRED_COLUMNS] = index;
  }

  const rows: SchoolDetailRecord[] = [];
  const mainSchoolRecordIds = new Set<string>();
  const omittedByLevel: Record<string, number> = {};
  const nullNumericFields: Record<string, number> = {};
  const nativeMainSchoolCountByLevel: Record<Level, number> = { elem: 0, mid: 0, high: 0, special: 0 };
  const parsedMainSchoolCountByLevel: Record<Level, number> = { elem: 0, mid: 0, high: 0, special: 0 };
  let rawGangwonRows = 0;

  for (let index = headerIndex + 1; index < allRows.length; index++) {
    const raw = allRows[index];
    if (clean(raw[col.sido]) !== "강원") continue;
    rawGangwonRows++;
    const sourceRow = index + 1;
    const levelLabel = clean(raw[col.level]);
    const level = LEVEL_BY_LABEL[levelLabel];
    if (!level) {
      if (!OTHER_LEVELS.has(levelLabel)) throw new Error(`${MOE_SCHOOL_SOURCE_ID} ${sourceRow}행: 알 수 없는 학교급 ${levelLabel}`);
      omittedByLevel[levelLabel] = (omittedByLevel[levelLabel] ?? 0) + 1;
      continue;
    }
    const regionName = clean(raw[col.region]);
    if (!REGION_NAMES.includes(regionName)) throw new Error(`${MOE_SCHOOL_SOURCE_ID} ${sourceRow}행: 알 수 없는 강원 시군 ${regionName}`);
    if (clean(raw[col.sourceDate]) !== "20220401") throw new Error(`${MOE_SCHOOL_SOURCE_ID} ${sourceRow}행: 기준일 불일치`);
    const name = clean(raw[col.name]);
    const address = clean(raw[col.address]);
    if (!name || !address) throw new Error(`${MOE_SCHOOL_SOURCE_ID} ${sourceRow}행: 학교명·주소 누락`);
    const branchRaw = clean(raw[col.branch]);
    if (branchRaw !== "본교" && branchRaw !== "분교장") throw new Error(`${MOE_SCHOOL_SOURCE_ID} ${sourceRow}행: 본분교 미확인 ${branchRaw}`);
    const rawStatus = clean(raw[col.status]);
    const status = STATUS_BY_LABEL[rawStatus];
    if (!status) throw new Error(`${MOE_SCHOOL_SOURCE_ID} ${sourceRow}행: 상태 미확인 ${rawStatus}`);
    const areaRaw = clean(raw[col.area]);
    const officialAreaType = AREA_BY_LABEL[areaRaw];
    if (!officialAreaType) throw new Error(`${MOE_SCHOOL_SOURCE_ID} ${sourceRow}행: 지역규모 미확인 ${areaRaw}`);
    const nativeSchoolCount = numeric(raw[col.nativeSchoolCount]);
    const isMain = branchRaw === "본교" && status === "active";
    const nativeCount = nativeSchoolCount.value;
    if (nativeCount === null || nativeCount !== (isMain ? 1 : 0))
      throw new Error(`${MOE_SCHOOL_SOURCE_ID} ${sourceRow}행: 원문 학교수와 본분교·상태 불일치`);
    nativeMainSchoolCountByLevel[level] += nativeCount;
    if (isMain) parsedMainSchoolCountByLevel[level]++;
    const recordId = `${MOE_SCHOOL_SOURCE_ID}:${MOE_SCHOOL_SHEET}!A${sourceRow}`;
    if (branchRaw === "본교") mainSchoolRecordIds.add(recordId);

    const counts: SchoolDetailRecord["counts"] = {};
    const read = (field: string, sourceColumn: keyof typeof REQUIRED_COLUMNS, integer = true) => {
      counts[field] = numeric(raw[col[sourceColumn]], integer);
      if (counts[field].value === null) nullNumericFields[field] = (nullNumericFields[field] ?? 0) + 1;
    };
    read("classes", "classes"); read("students", "students"); read("teachers", "teachers");
    read("entrants", "entrants"); read("graduates", "graduates");
    read("counselors", "counselors"); read("librarians", "librarians");
    read("siteArea", "siteArea", false);
    if (level === "special") {
      // The school-level special-school row contains all processes in the
      // overall totals; its separate special-class columns are not that total.
      counts.specialClasses = counts.classes;
      counts.specialStudents = counts.students;
    } else {
      read("specialClasses", "specialClasses");
      read("specialStudents", "specialStudents");
    }
    const classroomFields = ["classroomGeneral", "classroomSubject", "classroomSpecial", "classroomLeveled", "classroomOther"] as const;
    for (const field of classroomFields) read(field, field);
    counts.classrooms = strictSum(classroomFields.map((field) => counts[field]));
    if (counts.classrooms.value === null) nullNumericFields.classrooms = (nullNumericFields.classrooms ?? 0) + 1;
    counts.buildingArea = parseNumber(""); // No building-area column in this attachment.

    const sourceSchoolIds: Record<string, string> = {};
    if (clean(raw[col.kedi])) sourceSchoolIds.kedi = clean(raw[col.kedi]);
    if (clean(raw[col.neis])) sourceSchoolIds.neis = clean(raw[col.neis]);
    rows.push({
      recordId, sourceId: MOE_SCHOOL_SOURCE_ID, sourceSheet: MOE_SCHOOL_SHEET, sourceRow,
      sourceSchoolIds, name, regionName, level,
      category: level === "high" ? clean(raw[col.category]) : levelLabel,
      address, website: clean(raw[col.website]) || null,
      establishment: clean(raw[col.establishment]) || null,
      openedAt: clean(raw[col.openedAt]) || null,
      rawStatus, status, branch: branchRaw === "분교장", branchEvidence: "official-column",
      officialAreaType, counts,
    });
  }

  if (!rows.length || REGION_NAMES.some((region) => !rows.some((row) => row.regionName === region)))
    throw new Error(`${MOE_SCHOOL_SOURCE_ID}: 강원 18개 시군 학교 행이 누락됨`);
  const coverage: CoverageAttestation[] = REGION_NAMES.flatMap((regionName) =>
    (["elem", "mid", "high", "special"] as Level[]).map((level) => ({
      regionName, level, complete: true,
      expectedRecordCount: rows.filter((row) => row.regionName === regionName && row.level === level).length,
    })));
  return {
    referenceDate, rows, coverage, mainSchoolRecordIds,
    audit: { sourceId: MOE_SCHOOL_SOURCE_ID, sourceSheet: MOE_SCHOOL_SHEET,
      rawGangwonRows, targetRows: rows.length, omittedByLevel,
      nativeMainSchoolCountByLevel, parsedMainSchoolCountByLevel, nullNumericFields },
  };
}

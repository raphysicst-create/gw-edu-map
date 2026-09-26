import { beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { parseMoeSchoolWorkbook } from "../../scripts/pipeline/gangwon/moe";
import { aggregateGangwonSchoolIndicators } from "../../scripts/pipeline/gangwon/aggregate";
import { REGION_NAMES } from "../../scripts/pipeline/gangwon/parse";

// The official XLSX is ignored by Git. Its byte-for-byte audit is an explicit
// local integration run; ordinary CI keeps parser and aggregation coverage below.
const officialSource = process.env.GANGWON_MOE_INTEGRATION === "1" ? describe : describe.skip;

const HEADERS = [
  "", "시도", "행정구", "조사기준일", "학교급", "고등학교유형", "KEDI학교코드", "나이스학교코드", "학교명",
  "본분교", "설립", "상태", "지역규모", "개교일", "주소", "홈페이지", "학교수", "편성학급수_계",
  "학생수_총계_계", "교원수_총계_계", "교원수_정규_상담_계", "교원수_정규_사서_계", "입학자_계",
  "졸업자_계", "특수학급_학급수", "특수학급_학생수_계", "일반교실", "교과교실", "특별교실",
  "수준별교실", "기타교실", "교지면적",
];

function syntheticWorkbook(mutate?: (rows: Record<string, string>[]) => void): Uint8Array {
  const makeRow = (region: string, index: number): Record<string, string> => ({
    시도: "강원", 행정구: region, 조사기준일: "20220401", 학교급: "초등학교", 고등학교유형: "",
    KEDI학교코드: `test-kedi-${index}`, 나이스학교코드: `test-neis-${index}`, 학교명: `${region}합성초등학교${index}`,
    본분교: "본교", 설립: "공립", 상태: "기존(원)교", 지역규모: "시", 개교일: "2000-03-01",
    주소: `강원특별자치도 ${region} 테스트로 1`, 홈페이지: "", 학교수: "1", 편성학급수_계: "3",
    학생수_총계_계: "60", 교원수_총계_계: "6", 교원수_정규_상담_계: "0", 교원수_정규_사서_계: "0",
    입학자_계: "0", 졸업자_계: "10", 특수학급_학급수: "1", 특수학급_학생수_계: "2",
    일반교실: "2", 교과교실: "1", 특별교실: "0", 수준별교실: "0", 기타교실: "0", 교지면적: "1200",
  });
  const rows = REGION_NAMES.map((region, index) => makeRow(region, index));
  rows.push({ ...makeRow(REGION_NAMES[0], 18), 본분교: "분교장", 학교수: "0", 교과교실: "" });
  rows.push({ ...makeRow(REGION_NAMES[1], 19), 학교급: "특수학교", 편성학급수_계: "5", 학생수_총계_계: "30", 특수학급_학급수: "1", 특수학급_학생수_계: "2" });
  rows.push({ ...makeRow(REGION_NAMES[2], 20), 상태: "폐(원)교", 학교수: "0" });
  mutate?.(rows);
  const book = XLSX.utils.book_new();
  const table = [["조사 기준일: 2022. 4. 1."], HEADERS, ...rows.map(row => HEADERS.map(name => row[name] ?? ""))];
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(table), "학교별 주요통계");
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" });
}

describe("MOE 학교별 통계 어댑터: CI 합성 입력", () => {
  it("18개 시군, 공식 식별자, 본분교와 폐교 상태를 원문 열대로 보존한다", () => {
    const parsed = parseMoeSchoolWorkbook(syntheticWorkbook());
    expect(parsed.referenceDate).toBe("2022-04-01");
    expect(parsed.rows).toHaveLength(21);
    expect(new Set(parsed.rows.map(row => row.regionName)).size).toBe(18);
    expect(parsed.coverage).toHaveLength(72);
    expect(new Set(parsed.rows.map(row => row.sourceSchoolIds.kedi)).size).toBe(21);
    expect(parsed.rows.filter(row => row.branch)).toHaveLength(1);
    expect(parsed.rows.filter(row => row.status === "closed")).toHaveLength(1);
    expect(parsed.mainSchoolRecordIds.size).toBe(20);
    expect(parsed.audit.nativeMainSchoolCountByLevel.elem).toBe(18);
  });

  it("특수학교 전체 값을 보존하고 다섯 교실 중 하나가 없으면 합계도 결측으로 둔다", () => {
    const parsed = parseMoeSchoolWorkbook(syntheticWorkbook());
    const special = parsed.rows.find(row => row.level === "special")!;
    expect(special.counts.specialClasses.value).toBe(5);
    expect(special.counts.specialStudents.value).toBe(30);
    const branch = parsed.rows.find(row => row.branch)!;
    expect(branch.counts.classroomSubject.value).toBeNull();
    expect(branch.counts.classrooms.value).toBeNull();
  });

  it("원문 학교수와 본분교·운영 상태가 어긋나면 공개 입력으로 받지 않는다", () => {
    expect(() => parseMoeSchoolWorkbook(syntheticWorkbook(rows => { rows[0].학교수 = "0"; }))).toThrow("원문 학교수와 본분교·상태 불일치");
  });

  it("단일 2022 관측으로 학생수 증감률을 만들지 않는다", () => {
    const parsed = parseMoeSchoolWorkbook(syntheticWorkbook());
    const result = aggregateGangwonSchoolIndicators({ rows: parsed.rows, year: 2022, scopeKey: "moe-2022-school-level", coverage: parsed.coverage,
      mainSchoolRecordIds: parsed.mainSchoolRecordIds });
    expect(result.filter(entry => entry.indicatorId === "students_change_5y").every(entry => entry.value === null && entry.reason === "baseline-unavailable")).toBe(true);
  });
});

officialSource("교육부 직접 첨부 2022 학교별 원문 독립 심사", () => {
  let bytes: Buffer;
  let parsed: ReturnType<typeof parseMoeSchoolWorkbook>;
  beforeAll(() => {
    bytes = readFileSync("data/raw/gangwon/research-schools/moe-2022-school-level.xlsx");
    parsed = parseMoeSchoolWorkbook(bytes);
  }, 120_000);
  it("등록된 첨부 바이트와 조사일·강원 모집단 범위를 재현한다", () => {
    expect(bytes.length).toBe(19_221_634);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe("33f0c250c5accb93d987103f169c073a8779d4fba6f2267c4eb72ee0ba388cf5");
    expect(parsed.referenceDate).toBe("2022-04-01");
    expect(parsed.audit.rawGangwonRows).toBe(1040);
    expect(parsed.rows).toHaveLength(662);
    expect(new Set(parsed.rows.map(row => row.regionName)).size).toBe(18);
    expect(parsed.coverage).toHaveLength(72);
  });

  it("학교별 본분교·운영 상태와 고유 공인 식별자를 보존한다", () => {
    const all = parsed.rows;
    expect(all.every(row => row.sourceSchoolIds.kedi && row.sourceSchoolIds.neis)).toBe(true);
    expect(new Set(all.map(row => row.sourceSchoolIds.kedi)).size).toBe(all.length);
    expect(new Set(all.map(row => row.sourceSchoolIds.neis)).size).toBe(all.length);
    // Three closed main-school rows still have an official main role, but
    // the native school-count column excludes them from operating schools.
    const operatingMainCount = Object.values(parsed.audit.nativeMainSchoolCountByLevel).reduce((a,b) => a+b, 0);
    expect(parsed.mainSchoolRecordIds.size).toBe(operatingMainCount + 3);
    expect(all.filter(row => row.status === "closed" && row.branch === false)).toHaveLength(3);
    expect(parsed.audit.parsedMainSchoolCountByLevel).toEqual(parsed.audit.nativeMainSchoolCountByLevel);
    expect(all.every(row => row.branchEvidence === "official-column" && row.officialAreaType)).toBe(true);
  });

  it("원문 학교수 열 합계와 어댑터의 본교수를 독립 대조한다", () => {
    const book = XLSX.read(bytes, { type: "buffer", sheets: ["학교별 주요통계", "요약정보"] });
    const rows = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets["학교별 주요통계"], { header: 1, defval: "", raw: true });
    const head = rows.findIndex(row => String(row[1]).trim() === "시도" && String(row[4]).trim() === "학교급");
    const columns = rows[head].map(value => String(value).trim().replace(/\s+/g, ""));
    const index = (name: string) => columns.indexOf(name);
    const target = new Set(["초등학교", "중학교", "고등학교", "특수학교"]);
    const raw = rows.slice(head + 1).filter(row => String(row[index("시도")]).trim() === "강원" && target.has(String(row[index("학교급")]).trim()));
    const byLevel = Object.fromEntries([...target].map(level => [level, raw.filter(row => row[index("학교급")] === level).reduce((total, row) => total + Number(row[index("학교수")]), 0)]));
    expect(raw).toHaveLength(662);
    expect(byLevel).toEqual({ 초등학교: parsed.audit.nativeMainSchoolCountByLevel.elem, 중학교: parsed.audit.nativeMainSchoolCountByLevel.mid,
      고등학교: parsed.audit.nativeMainSchoolCountByLevel.high, 특수학교: parsed.audit.nativeMainSchoolCountByLevel.special });
    const summary = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets["요약정보"], { header: 1, defval: "", raw: true });
    const gangwon = summary.find(row => row[0] === "강원");
    expect(gangwon?.slice(1, 5)).toEqual([1005, 8838, 161900, 16871]);
    const allGangwon = rows.slice(head + 1).filter(row => row[index("시도")] === "강원");
    for (const [column, expected] of [["학교수", 1005], ["편성학급수_계", 8838], ["학생수_총계_계", 161900], ["교원수_총계_계", 16871]] as const) {
      expect(allGangwon.reduce((total, row) => total + (Number(row[index(column)]) || 0), 0)).toBe(expected);
    }
  }, 60_000);

  it("특수학교 전체 총계를 재사용하며 5종 교실 항목 결측을 임의로 0으로 채우지 않는다", () => {
    const special = parsed.rows.filter(row => row.level === "special");
    expect(special.length).toBeGreaterThan(0);
    expect(special.every(row => row.counts.specialClasses.value === row.counts.classes.value && row.counts.specialStudents.value === row.counts.students.value)).toBe(true);
    // The actual 2022 target rows have all five classroom fields populated.
    // A reduced copy with one missing source cell proves a future partial
    // row will stay missing instead of becoming a fabricated zero.
    const book = XLSX.read(bytes, { type: "buffer", sheets: ["학교별 주요통계"] });
    const original = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets["학교별 주요통계"], { header: 1, defval: "", raw: true });
    const head = original.findIndex(row => String(row[1]).trim() === "시도" && String(row[4]).trim() === "학교급");
    const headers = original[head].map(value => String(value).trim().replace(/\s+/g, ""));
    const column = (label: string) => headers.indexOf(label);
    const regions = [...new Set(parsed.rows.map(row => row.regionName))];
    const selected = regions.map(region => original.slice(head + 1).find(row => row[column("시도")] === "강원" && row[column("행정구")] === region && row[column("학교급")] === "초등학교")!);
    selected[0] = [...selected[0]];
    selected[0][column("교과교실")] = "";
    const tinyBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(tinyBook, XLSX.utils.aoa_to_sheet([...original.slice(0, head + 1), ...selected]), "학교별 주요통계");
    const changed = parseMoeSchoolWorkbook(XLSX.write(tinyBook, { type: "buffer", bookType: "xlsx" }));
    expect(changed.rows[0].counts.classroomSubject.value).toBeNull();
    expect(changed.rows[0].counts.classrooms.value).toBeNull();
  }, 60_000);

  it("2022 단독 관측으로 학생수 증감률을 만들지 않는다", () => {
    const result = aggregateGangwonSchoolIndicators({ rows: parsed.rows, year: 2022, scopeKey: "moe-2022-school-level", coverage: parsed.coverage,
      mainSchoolRecordIds: parsed.mainSchoolRecordIds });
    expect(result.filter(entry => entry.indicatorId === "students_change_5y").every(entry => entry.value === null && entry.reason === "baseline-unavailable")).toBe(true);
  });
});

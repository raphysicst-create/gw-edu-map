import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { SCHOOL_FIELDS, UNUSED_FIELDS, completeSum, parseNumber, parseSchoolOverview, parseUnusedClosed } from "../../scripts/pipeline/gangwon/parse";
import { assertPublishable, assertSourceBytes, assertSourceRegister, sha256, sourcePath, type SourceRegister } from "../../scripts/pipeline/gangwon/source-register";

const bytes = (text: string) => new TextEncoder().encode(text);
const csv = (header: string[], row: string[]) => bytes(`${header.join(",")}\r\n${row.join(",")}\r\n`);
const school = () => ["강원", "초등학교", "공립", "검증용학교", "춘천시", "", "3", "0", "0", "0", "0", "0", "0", "6", "3", "2", "1"];
const closed = () => ["1", "춘천", "검증용폐교", "1995-03-01", "춘천시 서면", "1000", "1", "35.5", "1", "대부"];
const register = (): SourceRegister => JSON.parse(readFileSync(new URL("../../data/sources/gangwon/source-register.json", import.meta.url), "utf8"));

describe("강원 학교개황 입력", () => {
  it("0을 보존하고 공식 ID·본분교·운영상태·좌표를 추정하지 않는다", () => {
    const [result] = parseSchoolOverview(csv(SCHOOL_FIELDS, school()));
    expect(result.counts.학생수).toEqual({ value: 0, reason: null });
    expect(result).toMatchObject({ sourceRow: 2, branch: null, status: null, lat: null, lng: null, sourceSchoolIds: {} });
    expect(result).not.toHaveProperty("kediCode");
  });
  it("전북 행을 입력하면 실패한다", () => {
    const row = school(); row[0] = "전북";
    expect(() => parseSchoolOverview(csv(SCHOOL_FIELDS, row))).toThrow("강원 이외");
  });
  it("지역 매핑을 실패하면 행을 버리지 않는다", () => {
    const row = school(); row[4] = "속초양양";
    expect(() => parseSchoolOverview(csv(SCHOOL_FIELDS, row))).toThrow("알 수 없는 시군");
  });
  it("유치원 등 제외 학교급의 원본 행과 이유를 남긴다", () => {
    const row = school(); row[1] = "유치원";
    expect(parseSchoolOverview(csv(SCHOOL_FIELDS, row))[0]).toMatchObject({ level: null, exclusionReason: "대상 학교급 아님: 유치원" });
  });
  it("예상하지 못한 학교급은 조용히 제외하지 않고 입력 변경으로 알린다", () => {
    const row = school(); row[1] = "초등학고";
    expect(() => parseSchoolOverview(csv(SCHOOL_FIELDS, row))).toThrow("학교급");
  });
  it("학교명이 같아도 자동으로 합치지 않는다", () => {
    const rows = bytes(`${SCHOOL_FIELDS.join(",")}\n${school().join(",")}\n${school().join(",")}`);
    expect(parseSchoolOverview(rows)).toHaveLength(2);
  });
  it("숫자 결측·비공개·해당 없음·미수록을 구별한다", () => {
    expect(parseNumber("")).toMatchObject({ value: null, reason: "missing" });
    expect(parseNumber("비공개")).toMatchObject({ value: null, reason: "suppressed" });
    expect(parseNumber("해당없음")).toMatchObject({ value: null, reason: "not-applicable" });
    expect(parseNumber("-")).toMatchObject({ value: null, reason: "not-recorded" });
    expect(() => parseNumber("<5")).toThrow();
    expect(() => parseNumber("1.5")).toThrow();
    expect(() => parseNumber("12,34")).toThrow();
    expect(parseNumber("1,234").value).toBe(1234);
  });
  it("빈 합계와 일부 결측을 0이나 완전한 합계로 만들지 않는다", () => {
    expect(completeSum([])).toBeNull();
    expect(completeSum([parseNumber("10"), parseNumber("")])).toBeNull();
    expect(completeSum([parseNumber("0"), parseNumber("10")])).toBe(10);
  });
  it("스키마 변경, 불완전 행, 닫히지 않은 인용부호를 거부한다", () => {
    expect(() => parseSchoolOverview(csv(SCHOOL_FIELDS.slice(1), school().slice(1)))).toThrow("열 구성");
    expect(() => parseSchoolOverview(csv(SCHOOL_FIELDS, school().slice(1)))).toThrow("열 수");
    expect(() => parseSchoolOverview(bytes(`${SCHOOL_FIELDS.join(",")}\n\"broken`))).toThrow("따옴표");
  });
  it("닫힌 인용 필드 뒤에 다른 문자가 붙은 잘못된 CSV를 거부한다", () => {
    const row = school(); row[3] = '"검증용학교"junk';
    expect(() => parseSchoolOverview(csv(SCHOOL_FIELDS, row))).toThrow("CSV");
  });
  it("여학생수가 전체 학생수보다 크면 실패한다", () => {
    const row = school(); row[8] = "1";
    expect(() => parseSchoolOverview(csv(SCHOOL_FIELDS, row))).toThrow("학생수_여 > 학생수");
  });
});

describe("강원 미활용 폐교 입력", () => {
  it("향후 대부계획을 현재 활용상태로 바꾸지 않는다", () => {
    const [row] = parseUnusedClosed(csv(UNUSED_FIELDS.map((field) => ` ${field} `), closed()));
    expect(row).toMatchObject({ datasetScope: "unused-only", futurePlan: "대부", regionName: "춘천시" });
    expect(row).not.toHaveProperty("usageStatus");
    expect(row).not.toHaveProperty("totalClosedSchools");
  });
  it("존재하지 않는 날짜와 지역·주소 불일치를 거부한다", () => {
    const row = closed(); row[3] = "2025-02-30";
    expect(() => parseUnusedClosed(csv(UNUSED_FIELDS, row))).toThrow("폐교일");
    row[3] = "2025-02-28"; row[4] = "원주시";
    expect(() => parseUnusedClosed(csv(UNUSED_FIELDS, row))).toThrow("불일치");
  });
  it("누락 시군을 임의 배정하지 않는다", () => {
    const row = closed(); row[1] = "";
    expect(() => parseUnusedClosed(csv(UNUSED_FIELDS, row))).toThrow("시군");
  });
  it("속초양양 관할은 같은 공식 행의 소재지로 구분하고 복제하지 않는다", () => {
    const row = closed(); row[1] = "속초양양"; row[4] = "양양군 현북면";
    const result = parseUnusedClosed(csv(UNUSED_FIELDS, row));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ sourceRegion: "속초양양", regionName: "양양군", regionResolution: "official-row-address" });
    row[4] = "확인 필요";
    expect(() => parseUnusedClosed(csv(UNUSED_FIELDS, row))).toThrow("시군");
  });
});

describe("강원 출처 심사", () => {
  it("실제 등록부를 검증하지만 취득만으로 공개를 허용하지 않는다", () => {
    expect(() => assertSourceRegister(register())).not.toThrow();
    expect(() => assertPublishable(register(), ["gwe-school-overview-2026"])).toThrow("공개 가능한");
    expect(() => assertPublishable(register(), [])).toThrow("출처 ID");
  });
  it("data.go.kr 유통 자료라도 실제 제공기관이 허용되지 않으면 실패한다", () => {
    const value = register(); value.sources[0].providerName = "한국교육시설안전원";
    expect(() => assertSourceRegister(value)).toThrow("허용 제공기관");
  });
  it("다른 지역·중복 ID·미취득 출처의 가짜 해시를 거부한다", () => {
    const value = register(); value.profileId = "jeonbuk" as "gangwon";
    expect(() => assertSourceRegister(value)).toThrow("profile/schema");
    value.profileId = "gangwon"; value.sources.push(value.sources[0]);
    expect(() => assertSourceRegister(value)).toThrow("중복");
    const unacquired = register(); unacquired.sources[2].sha256 = "a".repeat(64);
    expect(() => assertSourceRegister(unacquired)).toThrow("미취득");
  });
  it("저장·재배포 조건을 모르는 자료를 publishable로 바꿔도 차단한다", () => {
    const value = register(); value.sources[1].reviewStatus = "publishable";
    expect(() => assertSourceRegister(value)).toThrow("재배포 조건");
  });
  it("공식 도메인처럼 보이는 외부 주소와 학교 독립 홈페이지를 거부한다", () => {
    const value = register(); value.sources[0].officialEvidenceUrl = "https://gwe.go.kr.example.com/file";
    expect(() => assertSourceRegister(value)).toThrow("출처 도메인");
    value.sources[0].officialEvidenceUrl = "https://school.gwe.es.kr/file";
    expect(() => assertSourceRegister(value)).toThrow("출처 도메인");
  });
  it("필수 공개 근거와 기준일을 요구한다", () => {
    const value = register(); const source = value.sources[0]; source.reviewStatus = "publishable";
    source.referenceDate = null;
    expect(() => assertSourceRegister(value)).toThrow("공개 기준일");
    source.referenceDate = "2026-04-01"; source.providerReview.status = "pending";
    expect(() => assertSourceRegister(value)).toThrow("제공기관 심사");
  });
  it("체크섬이 다른 다운로드를 받아들이지 않는다", () => {
    const source = register().sources[0]; source.sha256 = sha256(bytes("expected"));
    expect(() => assertSourceBytes(source, bytes("expected"))).not.toThrow();
    expect(() => assertSourceBytes(source, bytes("<html>error</html>"))).toThrow("체크섬");
  });
  it("원본 경로가 작업 경계 밖으로 나가지 않는다", () => {
    expect(() => sourcePath(process.cwd(), "data/raw/gangwon/../../private.txt")).toThrow("경로 밖");
    expect(() => sourcePath(process.cwd(), "data/raw/jeonbuk/source.csv")).toThrow("경로 밖");
  });
});

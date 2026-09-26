import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseSchoolDirectory } from "../../scripts/pipeline/gangwon/school-details";

function workbook(rows: string[][]): Uint8Array {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), "Sheet1");
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" });
}

function elementaryRows(): string[][] {
  const rows = Array.from({ length: 10 }, () => Array(60).fill(""));
  rows[3][1] = "학교명";
  rows[4][0] = "춘천시\n소계";
  rows[5][1] = "검사용초등학교분교장";
  rows[5][4] = "기존";
  rows[5][5] = "계";
  rows[5][6] = "1";
  rows[5][16] = "12";
  rows[5][29] = "2";
  rows[5][50] = "-";
  rows[6][1] = "강원특별자치도 춘천시 검사용길 1";
  rows[8][1] = "https://example.invalid";
  return rows;
}

describe("강원 교육통계연보 학교 일람표 어댑터", () => {
  it("분교장 원문과 주소·결측을 보존하고 원문 행 주소를 학교 ID로 쓰지 않는다", () => {
    const [row] = parseSchoolDirectory(workbook(elementaryRows()), 36645);
    expect(row).toMatchObject({
      recordId: "gwe-directory-36645:Sheet1!B6", sourceSchoolIds: {},
      regionName: "춘천시", level: "elem", status: "active", rawStatus: "기존",
      branch: true, branchEvidence: "literal-branch-name",
      address: "강원특별자치도 춘천시 검사용길 1",
    });
    expect(row.counts.students).toMatchObject({ value: 12, reason: null });
    expect(row.counts.siteArea).toMatchObject({ value: null, reason: "not-recorded" });
    expect(row).not.toHaveProperty("kediCode");
  });

  it("지역 머리글이 없는 학교 행은 지역을 추정하지 않고 실패한다", () => {
    const rows = elementaryRows(); rows[4][0] = "";
    expect(() => parseSchoolDirectory(workbook(rows), 36645)).toThrow("region missing");
  });

  it("이름에 분교장 표기가 없으면 본교로 단정하지 않는다", () => {
    const rows = elementaryRows(); rows[5][1] = "검사용초등학교";
    const [row] = parseSchoolDirectory(workbook(rows), 36645);
    expect(row.branch).toBeNull();
    expect(row.branchEvidence).toBeNull();
  });

  it("특수학교는 전체과정 행만 학교 단위로 세고 하위과정을 더하지 않는다", () => {
    const rows = elementaryRows();
    rows[5][2] = "00.전체과정";
    rows[5][5] = "기존";
    rows[5][6] = "계";
    rows[5][7] = "1";
    rows[5][17] = "12";
    rows[7][1] = rows[5][1];
    rows[7][2] = "01.유치원";
    rows[7][5] = "기존";
    rows[7][6] = "계";
    expect(parseSchoolDirectory(workbook(rows), 36652)).toHaveLength(1);
  });
});

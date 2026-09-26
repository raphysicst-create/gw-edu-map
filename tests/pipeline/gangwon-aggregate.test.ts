import { describe, expect, it } from "vitest";
import { aggregateGangwonSchoolIndicators, LEVELS, PROVINCE_NAME, SCHOOL_INDICATOR_IDS, type AggregateInput, type CoverageAttestation } from "../../scripts/pipeline/gangwon/aggregate";
import { parseNumber, REGION_NAMES } from "../../scripts/pipeline/gangwon/parse";
import type { SchoolDetailRecord } from "../../scripts/pipeline/gangwon/school-details";

const fields = ["students", "classes", "teachers", "siteArea", "classrooms", "entrants", "specialClasses", "specialStudents"];
function row(id: string, regionName: string, students: number, branch: true | null = null): SchoolDetailRecord {
  return {
    recordId: id, sourceId: "synthetic-school-directory", sourceSheet: "Sheet1", sourceRow: 1,
    sourceSchoolIds: {}, name: `검사용${id}`, regionName, level: "elem", category: "elementary",
    address: `강원특별자치도 ${regionName} 검사용면`, website: null, establishment: "공립", openedAt: null,
    rawStatus: "기존", status: "active", branch, branchEvidence: branch === true ? "literal-branch-name" : null,
    counts: Object.fromEntries(fields.map((field) => [field, parseNumber(String(field === "students" ? students : field === "classes" ? 2 : field === "teachers" ? 4 : field === "siteArea" ? 200 : field === "classrooms" ? 3 : field === "entrants" ? 0 : 0))])),
  };
}
function input(rows: SchoolDetailRecord[], mainIds: string[] = [], year = 2026): AggregateInput {
  const coverage: CoverageAttestation[] = REGION_NAMES.flatMap((regionName) => LEVELS.map((level) => ({
    regionName, level, complete: true,
    expectedRecordCount: rows.filter((school) => school.regionName === regionName && school.level === level).length,
  })));
  return { rows, year, scopeKey: "synthetic-comparable-population", coverage, mainSchoolRecordIds: new Set(mainIds) };
}
function cell(result: ReturnType<typeof aggregateGangwonSchoolIndicators>, indicatorId: string, regionName = PROVINCE_NAME, level: null | "elem" = null) {
  return result.find((item) => item.indicatorId === indicatorId && item.regionName === regionName && item.level === level)!;
}

describe("강원 학교별 집계의 공개 안전 조건", () => {
  it("18개 시군과 도 전체, 전체와 4학교급, 15개 학교 지표를 모두 추적한다", () => {
    const result = aggregateGangwonSchoolIndicators(input([]));
    expect(result).toHaveLength(19 * 5 * SCHOOL_INDICATOR_IDS.length);
    expect(new Set(result.map((entry) => entry.regionName)).size).toBe(19);
  });

  it("본교 판정이 미확정이어도 학생수는 별도 계산하고 학교수·소규모 비율은 보류한다", () => {
    const result = aggregateGangwonSchoolIndicators(input([row("a", "춘천시", 40)]));
    expect(cell(result, "students_total", "춘천시", "elem").value).toBe(40);
    expect(cell(result, "schools_total", "춘천시", "elem")).toMatchObject({ value: null, reason: "unknown-main-role" });
    expect(cell(result, "small_school_share", "춘천시", "elem")).toMatchObject({ value: null, reason: "unknown-main-role" });
  });

  it("도 전체 비율을 시군 비율의 평균이 아니라 전체 분자·분모로 계산한다", () => {
    const rows = [row("a", "춘천시", 40), row("b", "춘천시", 100), row("c", "원주시", 200)];
    rows[1].address = "강원특별자치도 춘천시 검사용동";
    rows[2].address = "강원특별자치도 원주시 검사용동";
    const result = aggregateGangwonSchoolIndicators(input(rows, ["a", "b", "c"]));
    expect(cell(result, "small_school_share").value).toBeCloseTo(100 / 3);
    expect(cell(result, "rural_school_share").value).toBeCloseTo(100 / 3);
    expect(cell(result, "students_per_class").value).toBeCloseTo(340 / 6);
    expect(cell(result, "schools_total").value).toBe(3);
  });

  it("부분 모집단, 중복, 결측을 전체 값이나 0으로 공개하지 않는다", () => {
    const rows = [row("a", "춘천시", 40), row("b", "원주시", 20)];
    const incomplete = input(rows, ["a", "b"]);
    incomplete.coverage = incomplete.coverage.map((entry) => entry.regionName === "원주시" && entry.level === "elem" ? { ...entry, complete: false } : entry);
    expect(cell(aggregateGangwonSchoolIndicators(incomplete), "students_total")).toMatchObject({ value: null, reason: "population-unverified" });
    const duplicate = input([rows[0], rows[0]], ["a"]);
    expect(cell(aggregateGangwonSchoolIndicators(duplicate), "students_total", "춘천시", "elem")).toMatchObject({ value: null, reason: "duplicate-record" });
    rows[0].counts.students = parseNumber("");
    expect(cell(aggregateGangwonSchoolIndicators(input(rows, ["a", "b"])), "students_total")).toMatchObject({ value: null, reason: "missing-value" });
    expect(cell(aggregateGangwonSchoolIndicators(input(rows, ["a", "b"])), "zero_entrant_schools").value).toBe(2);
  });

  it("0인 분모와 주소의 면 구분 미확인을 결측 사유로 남긴다", () => {
    const school = row("a", "춘천시", 40);
    school.counts.classes = parseNumber("0");
    school.address = "강원특별자치도 춘천시 검사용로 1";
    const result = aggregateGangwonSchoolIndicators(input([school], ["a"]));
    expect(cell(result, "students_per_class", "춘천시", "elem")).toMatchObject({ value: null, reason: "zero-denominator" });
    expect(cell(result, "rural_school_share", "춘천시", "elem")).toMatchObject({ value: null, reason: "unknown-address-area" });
  });

  it("학생 변화율은 실제 두 관측시점과 같은 모집단일 때만 계산한다", () => {
    const current = input([row("a", "춘천시", 200)], [], 2026);
    const baseline = input([row("a", "춘천시", 100)], [], 2022);
    expect(cell(aggregateGangwonSchoolIndicators(current), "students_change_5y", "춘천시", "elem")).toMatchObject({ value: null, reason: "baseline-unavailable" });
    current.baseline = baseline;
    expect(cell(aggregateGangwonSchoolIndicators(current), "students_change_5y", "춘천시", "elem")).toMatchObject({ value: 100, baselineYear: 2022 });
    baseline.scopeKey = "different-population";
    expect(cell(aggregateGangwonSchoolIndicators(current), "students_change_5y", "춘천시", "elem")).toMatchObject({ value: null, reason: "scope-mismatch" });
  });
});

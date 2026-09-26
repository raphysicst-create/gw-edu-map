import { describe, expect, it, vi } from "vitest";
import type { IndicatorDef, IndicatorRow } from "../../src/lib/indicators/types";
import { aggregateIndicator } from "../../scripts/pipeline/lib/aggregate";
import type { SchoolRow } from "../../scripts/pipeline/lib/kess-xlsx";
import { INCLUDED_STATUSES } from "../../scripts/pipeline/sources";

vi.mock("../../src/lib/profiles", () => ({ ACTIVE_PROFILE: legacyJeonbukProfile() }));
function legacyJeonbukProfile() {
  return {
    id: "jeonbuk-test",
    province: { name: "전북특별자치도", shortName: "전북", aggregateCode: "52000" },
    regions: [
      { code: "52110", name: "전주시" }, { code: "52130", name: "군산시" },
      { code: "52140", name: "익산시" }, { code: "52180", name: "정읍시" },
      { code: "52190", name: "남원시" }, { code: "52210", name: "김제시" },
      { code: "52710", name: "완주군" }, { code: "52720", name: "진안군" },
      { code: "52730", name: "무주군" }, { code: "52740", name: "장수군" },
      { code: "52750", name: "임실군" }, { code: "52770", name: "순창군" },
      { code: "52790", name: "고창군" }, { code: "52800", name: "부안군" },
    ],
    boundary: { sidoCode: "52", neighborSidoCodes: ["44", "12", "47", "48"], sggCodeOverrides: { "52111": "52110", "52113": "52110" } },
    schoolData: { kessSidoNames: ["전북", "전라북도", "전북특별자치도"], educationOfficeCodes: [], addressPrefixes: ["전북특별자치도", "전라북도"] },
    files: { manualDir: "data/manual", closedSchoolsCsvPrefix: "전북특별자치도교육청_폐교재산 현황_" },
  };
}

// Region codes used below: 52110=전주시, 52130=군산시, 52800=부안군 (no rows on
// purpose, to exercise the "region present in every output with 0/null" and
// "ratio denominator 0 -> null" rules).
const ROWS: SchoolRow[] = [
  {
    regionCode: "52110",
    level: "elem",
    name: "R1 전주 본교 초등",
    branch: false,
    isMain: 1,
    status: "기존",
    areaType: "시",
    address: "",
    students: 100,
    classes: 6,
    teachers: 10,
    staff: 3,
    entrants: 15,
    graduates: 15,
    specialClasses: 1,
    specialStudents: 3,
    classrooms: 10,
    siteArea: 5000,
  },
  {
    regionCode: "52110",
    level: "elem",
    name: "R2 전주 분교장 초등",
    branch: true,
    isMain: 0,
    status: "기존",
    areaType: "면",
    address: "",
    students: 8,
    classes: 1,
    teachers: 2,
    staff: 0,
    entrants: 0,
    graduates: 0,
    specialClasses: 0,
    specialStudents: 0,
    classrooms: 2,
    siteArea: 500,
  },
  {
    // 폐교 — must be excluded by the status filter, at every aggregate kind.
    regionCode: "52110",
    level: "mid",
    name: "R3 전주 폐교 중학교",
    branch: false,
    isMain: 1,
    status: "폐교",
    areaType: "시",
    address: "",
    students: 999,
    classes: 99,
    teachers: 99,
    staff: 99,
    entrants: 99,
    graduates: 99,
    specialClasses: 99,
    specialStudents: 99,
    classrooms: 99,
    siteArea: 99000,
  },
  {
    regionCode: "52110",
    level: "high",
    name: "R4 전주 본교 고등 (신입생 0명)",
    branch: false,
    isMain: 1,
    status: "기존",
    areaType: "읍",
    address: "",
    students: 50,
    classes: 3,
    teachers: 6,
    staff: 2,
    entrants: 0,
    graduates: 20,
    specialClasses: 0,
    specialStudents: 0,
    classrooms: 5,
    siteArea: 3000,
  },
  {
    regionCode: "52130",
    level: "elem",
    name: "R5 군산 본교 초등 (소규모, 면지역)",
    branch: false,
    isMain: 1,
    status: "신설",
    areaType: "면",
    address: "",
    students: 40,
    classes: 2,
    teachers: 4,
    staff: 1,
    entrants: 5,
    graduates: 3,
    specialClasses: 0,
    specialStudents: 0,
    classrooms: 3,
    siteArea: 2000,
  },
  {
    regionCode: "52130",
    level: "special",
    name: "R6 군산 본교 특수 (휴교)",
    branch: false,
    isMain: 1,
    status: "휴교",
    areaType: "특수",
    address: "",
    students: 10,
    classes: 1,
    teachers: 3,
    staff: 1,
    entrants: 0,
    graduates: 0,
    specialClasses: 1,
    specialStudents: 10,
    classrooms: 1,
    siteArea: 800,
  },
];

function findRow(rows: IndicatorRow[], regionCode: string, level?: string): IndicatorRow | undefined {
  return rows.find((r) => r.regionCode === regionCode && r.level === level);
}

const sumStudentsDef: IndicatorDef = {
  id: "test_students_total",
  group: "scale",
  label: "test",
  unit: "명",
  polarity: "neutral",
  kind: "count",
  byLevel: true,
  format: String,
  source: { name: "KESS test", url: "https://example.com", year: 2026 },
  aggregate: { kind: "sum", field: "students" },
  description: "테스트용 설명",
};

const schoolsTotalDef: IndicatorDef = {
  ...sumStudentsDef,
  id: "test_schools_total",
  aggregate: { kind: "count", predicate: "isMain" },
};

const studentsPerClassDef: IndicatorDef = {
  ...sumStudentsDef,
  id: "test_students_per_class",
  byLevel: false,
  kind: "ratio",
  aggregate: { kind: "ratio", numerator: "students", denominator: "classes" },
};

const smallSchoolsDef: IndicatorDef = {
  ...sumStudentsDef,
  id: "test_small_schools",
  byLevel: false,
  aggregate: { kind: "count", predicate: "small" },
};

const smallSchoolShareDef: IndicatorDef = {
  ...sumStudentsDef,
  id: "test_small_school_share",
  byLevel: false,
  kind: "ratio",
  aggregate: { kind: "share", predicate: "small" },
};

const zeroEntrantDef: IndicatorDef = {
  ...sumStudentsDef,
  id: "test_zero_entrants",
  byLevel: false,
  aggregate: { kind: "count", predicate: "zeroEntrants" },
};

const ruralShareDef: IndicatorDef = {
  ...sumStudentsDef,
  id: "test_rural_share",
  byLevel: false,
  kind: "ratio",
  aggregate: { kind: "share", predicate: "ruralArea" },
};

const specialClassesDef: IndicatorDef = {
  ...sumStudentsDef,
  id: "test_special_classes",
  byLevel: false,
  aggregate: { kind: "sum", field: "specialClasses" },
};

describe("aggregateIndicator", () => {
  it("produces 14 시군 rows + a 52000 province row for a non-byLevel indicator", () => {
    const rows = aggregateIndicator(studentsPerClassDef, ROWS, { statuses: INCLUDED_STATUSES });
    expect(rows).toHaveLength(15);
    expect(rows.filter((r) => r.regionCode === "52000")).toHaveLength(1);
  });

  it("adds 4x(14+1) level rows on top of the base rows when byLevel is set", () => {
    const rows = aggregateIndicator(sumStudentsDef, ROWS, { statuses: INCLUDED_STATUSES });
    expect(rows).toHaveLength(15 + 4 * 15);
  });

  it("excludes 폐교 rows from every aggregate kind via the statuses filter", () => {
    const rows = aggregateIndicator(sumStudentsDef, ROWS, { statuses: INCLUDED_STATUSES });
    // mid level only has the 폐교 row (999 students) — with it excluded, every
    // mid-level total (all regions + province) must be 0, not 999+.
    const midProvince = findRow(rows, "52000", "mid");
    expect(midProvince?.value).toBe(0);
  });

  it("includes a status when explicitly requested (parameterized filter, not hardcoded)", () => {
    const rows = aggregateIndicator(sumStudentsDef, ROWS, { statuses: [...INCLUDED_STATUSES, "폐교"] });
    const midProvince = findRow(rows, "52000", "mid");
    expect(midProvince?.value).toBe(999);
  });

  it("sums students per region and for the province total (분교장 rows included in sums)", () => {
    const rows = aggregateIndicator(sumStudentsDef, ROWS, { statuses: INCLUDED_STATUSES });
    expect(findRow(rows, "52110")?.value).toBe(158); // 100 + 8 + 50 (폐교 999 excluded)
    expect(findRow(rows, "52130")?.value).toBe(50); // 40 + 10
    expect(findRow(rows, "52000")?.value).toBe(208);
  });

  it("gives a region with zero matching rows a sum of 0, not null", () => {
    const rows = aggregateIndicator(sumStudentsDef, ROWS, { statuses: INCLUDED_STATUSES });
    expect(findRow(rows, "52800")?.value).toBe(0);
  });

  it("counts isMain (분교장 excluded) per region and province", () => {
    const rows = aggregateIndicator(schoolsTotalDef, ROWS, { statuses: INCLUDED_STATUSES });
    expect(findRow(rows, "52110")?.value).toBe(2); // R1, R4 (R2 분교장 excluded, R3 폐교 excluded)
    expect(findRow(rows, "52130")?.value).toBe(2); // R5, R6
    expect(findRow(rows, "52000")?.value).toBe(4);
  });

  it("computes byLevel breakdowns for both count and sum aggregates", () => {
    const schoolRows = aggregateIndicator(schoolsTotalDef, ROWS, { statuses: INCLUDED_STATUSES });
    expect(findRow(schoolRows, "52000", "elem")?.value).toBe(2); // R1 + R5 (R2 is 분교장, excluded)
    expect(findRow(schoolRows, "52000", "high")?.value).toBe(1); // R4
    expect(findRow(schoolRows, "52000", "special")?.value).toBe(1); // R6

    const studentRows = aggregateIndicator(sumStudentsDef, ROWS, { statuses: INCLUDED_STATUSES });
    expect(findRow(studentRows, "52000", "elem")?.value).toBe(148); // 100+8+40
  });

  it("computes ratio as Σnumerator/Σdenominator, not an average of per-school ratios", () => {
    const rows = aggregateIndicator(studentsPerClassDef, ROWS, { statuses: INCLUDED_STATUSES });
    // 52110: Σstudents=158, Σclasses=6+1+3=10 -> 15.8
    expect(findRow(rows, "52110")?.value).toBeCloseTo(15.8, 6);
    // province: Σstudents=208, Σclasses=13 -> 16.0
    expect(findRow(rows, "52000")?.value).toBeCloseTo(16.0, 6);
  });

  it("returns null for a ratio when the denominator sums to 0", () => {
    const rows = aggregateIndicator(studentsPerClassDef, ROWS, { statuses: INCLUDED_STATUSES });
    expect(findRow(rows, "52800")?.value).toBeNull();
  });

  it("counts small schools (isMain && students <= 60), excluding 분교장", () => {
    const rows = aggregateIndicator(smallSchoolsDef, ROWS, { statuses: INCLUDED_STATUSES });
    expect(findRow(rows, "52110")?.value).toBe(1); // R4 (50) only; R1=100 too big, R2 excluded (분교장)
    expect(findRow(rows, "52130")?.value).toBe(2); // R5 (40), R6 (10)
    expect(findRow(rows, "52000")?.value).toBe(3);
  });

  it("computes small_school_share as count(small) / ΣisMain * 100", () => {
    const rows = aggregateIndicator(smallSchoolShareDef, ROWS, { statuses: INCLUDED_STATUSES });
    expect(findRow(rows, "52110")?.value).toBeCloseTo(50, 6); // 1 / 2 * 100
    expect(findRow(rows, "52130")?.value).toBeCloseTo(100, 6); // 2 / 2 * 100
    expect(findRow(rows, "52000")?.value).toBeCloseTo(75, 6); // 3 / 4 * 100
  });

  it("returns null for a share when Σismain is 0", () => {
    const rows = aggregateIndicator(smallSchoolShareDef, ROWS, { statuses: INCLUDED_STATUSES });
    expect(findRow(rows, "52800")?.value).toBeNull();
  });

  it("counts zero-entrant main schools", () => {
    const rows = aggregateIndicator(zeroEntrantDef, ROWS, { statuses: INCLUDED_STATUSES });
    expect(findRow(rows, "52110")?.value).toBe(1); // R4
    expect(findRow(rows, "52130")?.value).toBe(1); // R6
  });

  it("computes rural_school_share over 면 area-type main schools", () => {
    const rows = aggregateIndicator(ruralShareDef, ROWS, { statuses: INCLUDED_STATUSES });
    expect(findRow(rows, "52110")?.value).toBeCloseTo(0, 6); // R2 is 면 but 분교장 (isMain=0), excluded
    expect(findRow(rows, "52130")?.value).toBeCloseTo(50, 6); // R5 rural / 2 main * 100
  });

  it("sums specialClasses across all rows including 분교장", () => {
    const rows = aggregateIndicator(specialClassesDef, ROWS, { statuses: INCLUDED_STATUSES });
    expect(findRow(rows, "52110")?.value).toBe(1); // R1 only (R2=0, R3 폐교 excluded)
    expect(findRow(rows, "52130")?.value).toBe(1); // R6
    expect(findRow(rows, "52000")?.value).toBe(2);
  });
});

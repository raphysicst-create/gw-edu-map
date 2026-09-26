import { describe, expect, it, vi } from "vitest";

import { parseCsv } from "../../scripts/pipeline/lib/csv";
import type { SchoolRow } from "../../scripts/pipeline/lib/kess-xlsx";
import {
  buildMatchReport,
  buildNoLocationSchoolRecord,
  buildSchoolRecord,
  includedKessRows,
  matchSchools,
  normalizeSchoolName,
  parseLocationCsv,
  partitionUnmatched,
  regionCodeFromAddress,
  stripLevelSuffix,
} from "../../scripts/pipeline/lib/schools";

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

describe("parseCsv — BOM and basic shape", () => {
  it("strips a leading UTF-8 BOM before parsing the header", () => {
    const text = "﻿a,b,c\n1,2,3\n";
    const rows = parseCsv(text);
    expect(rows[0]).toEqual(["a", "b", "c"]);
    expect(rows[1]).toEqual(["1", "2", "3"]);
  });

  it("splits plain comma-separated rows", () => {
    const rows = parseCsv("a,b,c\n1,2,3\n4,5,6\n");
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
      ["4", "5", "6"],
    ]);
  });

  it("handles CRLF line endings", () => {
    const rows = parseCsv("a,b\r\n1,2\r\n3,4\r\n");
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("does not produce a spurious trailing empty row when the file ends with a newline", () => {
    const rows = parseCsv("a,b\n1,2\n");
    expect(rows).toHaveLength(2);
  });

  it("does not require a trailing newline at EOF", () => {
    const rows = parseCsv("a,b\n1,2");
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("preserves empty fields", () => {
    const rows = parseCsv("a,,c\n1,,3\n");
    expect(rows).toEqual([
      ["a", "", "c"],
      ["1", "", "3"],
    ]);
  });
});

describe("parseCsv — quoted fields", () => {
  it("keeps a comma inside a quoted field as literal text", () => {
    const rows = parseCsv('a,"b,c",d\n');
    expect(rows[0]).toEqual(["a", "b,c", "d"]);
  });

  it("unescapes a doubled quote inside a quoted field", () => {
    const rows = parseCsv('a,"b""c",d\n');
    expect(rows[0]).toEqual(["a", 'b"c', "d"]);
  });

  it("keeps an embedded newline inside a quoted field as part of the same logical row", () => {
    const rows = parseCsv('a,"line1\nline2",c\nx,y,z\n');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(["a", "line1\nline2", "c"]);
    expect(rows[1]).toEqual(["x", "y", "z"]);
  });

  it("handles a quoted field at the very end of the file with no trailing newline", () => {
    const rows = parseCsv('a,"b"');
    expect(rows).toEqual([["a", "b"]]);
  });
});

// ---------------------------------------------------------------------------
// regionCodeFromAddress
// ---------------------------------------------------------------------------

describe("regionCodeFromAddress", () => {
  it("resolves the 시군 token right after the 전북특별자치도 prefix", () => {
    expect(regionCodeFromAddress("전북특별자치도 무주군 무주읍 향한로 43")).toBe("52730");
    expect(regionCodeFromAddress("전북특별자치도 전주시 덕진구 세병로 196")).toBe("52110");
  });

  it("also accepts the legacy 전라북도 prefix", () => {
    expect(regionCodeFromAddress("전라북도 군산시 임피면 임피향교길 44-6")).toBe("52130");
  });

  it("returns null for a non-전북 address", () => {
    expect(regionCodeFromAddress("서울특별시 강남구 타지로 6")).toBeNull();
  });

  it("returns null when the token after the 시도 prefix isn't one of the 14 시군", () => {
    expect(regionCodeFromAddress("전북특별자치도 미상읍 미상로 7")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// normalizeSchoolName / stripLevelSuffix
// ---------------------------------------------------------------------------

describe("normalizeSchoolName", () => {
  it("strips whitespace, the middle dot, and parentheses", () => {
    expect(normalizeSchoolName("전주 초등학교")).toBe("전주초등학교");
    expect(normalizeSchoolName("전주·초등학교")).toBe("전주초등학교");
    expect(normalizeSchoolName("전주초등학교(본교)")).toBe("전주초등학교본교");
  });
});

describe("stripLevelSuffix", () => {
  it("removes a trailing 학교급 suffix", () => {
    expect(stripLevelSuffix("전주초등학교")).toBe("전주");
    expect(stripLevelSuffix("전주중학교")).toBe("전주");
    expect(stripLevelSuffix("전주고등학교")).toBe("전주");
  });

  it("returns the name unchanged when it has no known suffix", () => {
    expect(stripLevelSuffix("전주")).toBe("전주");
  });
});

// ---------------------------------------------------------------------------
// parseLocationCsv + matchSchools — the brief's 8-row / 8-KESS-row fixture
// ---------------------------------------------------------------------------

const LOCATION_CSV_HEADER =
  "학교ID,학교명,학교급구분,설립일자,설립형태,본교분교구분,운영상태,소재지지번주소,소재지도로명주소,시도교육청코드,시도교육청명,교육지원청코드,교육지원청명,생성일자,변경일자,위도,경도,데이터기준일자";

/**
 * 8 location rows covering every case the brief calls out:
 *  L01 완전일치 (exact stage)              L05 미매칭 (위치에만 있음, KESS 없음)
 *  L02 접미어 차이 (suffix stage)          L06 타 시도 (전북 필터에서 제외)
 *  L03+L04 분교장 세트 (본교/분교 쌍)       L07 주소 파싱 실패 (시군 토큰 불명)
 *  L08 완전일치 (고등학교 레벨 커버리지)     L03 also covers the 도로명주소 blank -> 지번주소 fallback.
 */
const LOCATION_CSV = [
  LOCATION_CSV_HEADER,
  "L01,화신초등학교,초등학교,2000-01-01,공립,본교,운영,전북특별자치도 무주군 화신리 1,전북특별자치도 무주군 화신로 1,8321000,전북특별자치도교육청,8342000,무주교육지원청,2013-11-29,,36.01000,127.66000,20260320",
  "L02,은빛,초등학교,2000-01-01,공립,본교,운영,전북특별자치도 완주군 은빛리 2,전북특별자치도 완주군 은빛로 2,8321000,전북특별자치도교육청,8343000,완주교육지원청,2013-11-29,,35.90000,127.16000,20260320",
  "L03,대아초등학교,초등학교,2000-01-01,공립,본교,운영,전북특별자치도 남원시 대아리 3,,8321000,전북특별자치도교육청,8344000,남원교육지원청,2013-11-29,,35.40000,127.39000,20260320",
  "L04,대아초등학교대아분교장,초등학교,2000-01-01,공립,분교,운영,전북특별자치도 남원시 대아분교리 4,전북특별자치도 남원시 대아분교로 4,8321000,전북특별자치도교육청,8344000,남원교육지원청,2013-11-29,,35.41000,127.40000,20260320",
  "L05,외딴중학교,중학교,2000-01-01,공립,본교,운영,전북특별자치도 고창군 외딴리 5,전북특별자치도 고창군 외딴로 5,8321000,전북특별자치도교육청,8345000,고창교육지원청,2013-11-29,,35.43000,126.70000,20260320",
  "L06,타지초등학교,초등학교,2000-01-01,공립,본교,운영,서울특별시 강남구 타지동 6,서울특별시 강남구 타지로 6,7010000,서울특별시교육청,7020000,강남교육지원청,2013-11-29,,37.50000,127.03000,20260320",
  "L07,미상중학교,중학교,2000-01-01,공립,본교,운영,전북특별자치도 미상읍 미상리 7,전북특별자치도 미상읍 미상로 7,8321000,전북특별자치도교육청,8346000,미상교육지원청,2013-11-29,,35.50000,127.00000,20260320",
  "L08,정읍고등학교,고등학교,2000-01-01,공립,본교,운영,전북특별자치도 정읍시 정읍리 8,전북특별자치도 정읍시 정읍로 8,8321000,전북특별자치도교육청,8347000,정읍교육지원청,2013-11-29,,35.57000,126.85000,20260320",
  "",
].join("\n");

// Prefixed with a BOM so parseLocationCsv's end-to-end path (not just
// parseCsv in isolation) is proven to handle it too.
const LOCATION_CSV_WITH_BOM = "﻿" + LOCATION_CSV;

function kessRow(overrides: Partial<SchoolRow> & Pick<SchoolRow, "name" | "regionCode" | "level">): SchoolRow {
  return {
    branch: false,
    isMain: 1,
    status: "기존",
    areaType: "시",
    address: "전북특별자치도 어딘가 1",
    students: 100,
    classes: 5,
    teachers: 10,
    staff: 3,
    entrants: 20,
    graduates: 20,
    specialClasses: 0,
    specialStudents: 0,
    classrooms: 10,
    siteArea: 5000,
    ...overrides,
  };
}

/** The 8 KESS rows paired against LOCATION_CSV above (see the per-row comments for the intended stage/outcome). */
function kessFixtureRows(): SchoolRow[] {
  return [
    kessRow({ name: "화신초등학교", regionCode: "52730", level: "elem", students: 150, classes: 8 }), // k1 -> L01, exact
    kessRow({ name: "은빛초등학교", regionCode: "52710", level: "elem", students: 80, classes: 6 }), // k2 -> L02, suffix (location name lacks the 초등학교 suffix)
    kessRow({ name: "대아초등학교", regionCode: "52190", level: "elem", students: 200, classes: 10 }), // k3 -> L03, exact
    kessRow({
      name: "대아초등학교대아분교장",
      regionCode: "52190",
      level: "elem",
      branch: true,
      isMain: 0,
      students: 10,
      classes: 1,
    }), // k4 -> L04, exact (branch<->branch)
    kessRow({ name: "유령고등학교", regionCode: "52210", level: "high", students: 300, classes: 12 }), // k5 -> no location row at all
    kessRow({ name: "정읍고등학교", regionCode: "52180", level: "high", students: 400, classes: 15 }), // k6 -> L08, exact
    kessRow({ name: "미상중학교", regionCode: "52180", level: "mid", students: 90, classes: 4 }), // k7 -> L07 exists but its address never resolved to a regionCode, so no candidate
    kessRow({
      name: "대아초등학교",
      regionCode: "52190",
      level: "elem",
      branch: true,
      isMain: 0,
      students: 5,
      classes: 1,
    }), // k8 -> same base name as k3/L03, but branch=true: must NOT match L03 (본교) or L04 (different name)
  ];
}

describe("parseLocationCsv", () => {
  it("keeps only 전북 rows in the 4 core 학교급, dropping non-전북 rows entirely", () => {
    const { rows } = parseLocationCsv(LOCATION_CSV_WITH_BOM);
    // L01..L05, L08 = 6 (L06 non-전북, L07 region-parse failure)
    expect(rows).toHaveLength(6);
    expect(rows.find((r) => r.name === "타지초등학교")).toBeUndefined();
  });

  it("reports rows whose address doesn't resolve to a 시군 separately, excluding them from `rows`", () => {
    const { rows, regionParseFailures } = parseLocationCsv(LOCATION_CSV_WITH_BOM);
    expect(regionParseFailures).toHaveLength(1);
    expect(regionParseFailures[0]).toMatchObject({ id: "L07", name: "미상중학교" });
    expect(rows.find((r) => r.id === "L07")).toBeUndefined();
  });

  it("assigns regionCode from the address's 시군 token", () => {
    const { rows } = parseLocationCsv(LOCATION_CSV_WITH_BOM);
    expect(rows.find((r) => r.id === "L01")?.regionCode).toBe("52730");
    expect(rows.find((r) => r.id === "L08")?.regionCode).toBe("52180");
  });

  it("falls back to the 지번주소 when 도로명주소 is blank", () => {
    const { rows } = parseLocationCsv(LOCATION_CSV_WITH_BOM);
    const l03 = rows.find((r) => r.id === "L03");
    expect(l03?.address).toBe("전북특별자치도 남원시 대아리 3");
    expect(l03?.regionCode).toBe("52190");
  });

  it("maps 학교급구분 via the shared LEVEL_MAP and reads 본교분교구분/운영상태 verbatim", () => {
    const { rows } = parseLocationCsv(LOCATION_CSV_WITH_BOM);
    const l04 = rows.find((r) => r.id === "L04");
    expect(l04?.level).toBe("elem");
    expect(l04?.branch).toBe(true);
    expect(l04?.status).toBe("운영");
    const l01 = rows.find((r) => r.id === "L01");
    expect(l01?.branch).toBe(false);
  });

  it("parses lat/lng as numbers", () => {
    const { rows } = parseLocationCsv(LOCATION_CSV_WITH_BOM);
    const l01 = rows.find((r) => r.id === "L01");
    expect(l01?.lat).toBeCloseTo(36.01, 5);
    expect(l01?.lng).toBeCloseTo(127.66, 5);
  });
});

describe("matchSchools", () => {
  it("matches the expected 5 of 8 KESS rows against the fixture location rows", () => {
    const { rows: locationRows } = parseLocationCsv(LOCATION_CSV_WITH_BOM);
    const result = matchSchools(locationRows, kessFixtureRows(), {});
    expect(result.matched).toHaveLength(5);
    expect(result.ambiguous).toEqual([]);
  });

  it("matches 완전일치 (exact) pairs at the exact stage", () => {
    const { rows: locationRows } = parseLocationCsv(LOCATION_CSV_WITH_BOM);
    const result = matchSchools(locationRows, kessFixtureRows(), {});
    const jeongeup = result.matched.find((m) => m.kess.name === "정읍고등학교");
    expect(jeongeup?.stage).toBe("exact");
    expect(jeongeup?.location.id).toBe("L08");
  });

  it("matches an 접미어 차이 (suffix-stripped) pair only at the suffix stage", () => {
    const { rows: locationRows } = parseLocationCsv(LOCATION_CSV_WITH_BOM);
    const result = matchSchools(locationRows, kessFixtureRows(), {});
    const eunbit = result.matched.find((m) => m.kess.name === "은빛초등학교");
    expect(eunbit?.stage).toBe("suffix");
    expect(eunbit?.location.id).toBe("L02");
  });

  it("matches a 분교장 pair by name, keyed with branch=true on both sides", () => {
    const { rows: locationRows } = parseLocationCsv(LOCATION_CSV_WITH_BOM);
    const result = matchSchools(locationRows, kessFixtureRows(), {});
    const branch = result.matched.find((m) => m.kess.name === "대아초등학교대아분교장");
    expect(branch?.location.id).toBe("L04");
    expect(branch?.stage).toBe("exact");
  });

  it("never matches a 분교장 KESS row to a 본교 location row of the same base name (branch is part of the key)", () => {
    const { rows: locationRows } = parseLocationCsv(LOCATION_CSV_WITH_BOM);
    const result = matchSchools(locationRows, kessFixtureRows(), {});
    const wrongBranch = result.unmatchedKess.find((k) => k.name === "대아초등학교" && k.branch === true);
    expect(wrongBranch).toBeDefined();
    // L03 (본교) must have gone to k3 (본교), not to k8 (분교장).
    const mainMatch = result.matched.find((m) => m.location.id === "L03");
    expect(mainMatch?.kess.branch).toBe(false);
  });

  it("leaves a KESS row with no location counterpart unmatched (미매칭)", () => {
    const { rows: locationRows } = parseLocationCsv(LOCATION_CSV_WITH_BOM);
    const result = matchSchools(locationRows, kessFixtureRows(), {});
    expect(result.unmatchedKess.map((k) => k.name)).toContain("유령고등학교");
  });

  it("leaves a KESS row unmatched when its location row exists but failed 시군 parsing (미상중학교/L07)", () => {
    const { rows: locationRows } = parseLocationCsv(LOCATION_CSV_WITH_BOM);
    const result = matchSchools(locationRows, kessFixtureRows(), {});
    expect(result.unmatchedKess.map((k) => k.name)).toContain("미상중학교");
  });

  it("leaves a location-only row (위치 CSV 에만 있는) in unmatchedLocation", () => {
    const { rows: locationRows } = parseLocationCsv(LOCATION_CSV_WITH_BOM);
    const result = matchSchools(locationRows, kessFixtureRows(), {});
    expect(result.unmatchedLocation.map((r) => r.id)).toEqual(["L05"]);
  });

  it("uses a manual alias when neither the exact nor suffix stage finds a candidate", () => {
    const locationRows = parseLocationCsv(LOCATION_CSV_WITH_BOM).rows;
    const aliasLocation = { ...locationRows[0], id: "L99", name: "신학교", regionCode: "52110" };
    const kess = kessRow({ name: "구학교", regionCode: "52110", level: "elem" });
    const result = matchSchools([...locationRows, aliasLocation], [kess], { "구학교|52110": "L99" });
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]).toMatchObject({ stage: "alias" });
    expect(result.matched[0].location.id).toBe("L99");
  });

  it("throws when an alias points to a 학교ID that isn't in the location rows", () => {
    const locationRows = parseLocationCsv(LOCATION_CSV_WITH_BOM).rows;
    const kess = kessRow({ name: "구학교", regionCode: "52110", level: "elem" });
    expect(() => matchSchools(locationRows, [kess], { "구학교|52110": "NOPE" })).toThrow(/school-aliases\.json/);
  });

  it("throws when two different KESS rows resolve to the same location row (double claim)", () => {
    const locationRows = parseLocationCsv(LOCATION_CSV_WITH_BOM).rows;
    const target = locationRows.find((r) => r.id === "L01")!;
    // k-a matches L01 by its real exact key; k-b is a *different* KESS row
    // that an alias also points at L01 — both must never resolve to the
    // same location row.
    const kA = kessRow({ name: target.name, regionCode: target.regionCode, level: target.level });
    const kB = kessRow({ name: "다른이름초등학교", regionCode: "52999", level: "elem" });
    expect(() =>
      matchSchools(locationRows, [kA, kB], { "다른이름초등학교|52999": "L01" }),
    ).toThrow(/한 위치 행이 여러 KESS 행에 매칭/);
  });

  it("treats 2+ location candidates sharing the same key as ambiguous (unmatched, not guessed)", () => {
    const base = parseLocationCsv(LOCATION_CSV_WITH_BOM).rows[0];
    const dupA = { ...base, id: "DUP-A" };
    const dupB = { ...base, id: "DUP-B" };
    const kess = kessRow({ name: base.name, regionCode: base.regionCode, level: base.level });
    const result = matchSchools([dupA, dupB], [kess], {});
    expect(result.matched).toEqual([]);
    expect(result.ambiguous).toHaveLength(1);
    expect(result.ambiguous[0].candidateIds.sort()).toEqual(["DUP-A", "DUP-B"]);
  });
});

describe("includedKessRows", () => {
  it("keeps 기존/신설/휴교 and excludes 폐교", () => {
    const rows: SchoolRow[] = [
      kessRow({ name: "a", regionCode: "52110", level: "elem", status: "기존" }),
      kessRow({ name: "b", regionCode: "52110", level: "elem", status: "신설" }),
      kessRow({ name: "c", regionCode: "52110", level: "elem", status: "휴교" }),
      kessRow({ name: "d", regionCode: "52110", level: "elem", status: "폐교" }),
    ];
    const kept = includedKessRows(rows);
    expect(kept.map((r) => r.name)).toEqual(["a", "b", "c"]);
  });
});

describe("buildSchoolRecord", () => {
  it("takes name/level/branch/stats from KESS and id/lat/lng/status from location", () => {
    const { rows: locationRows } = parseLocationCsv(LOCATION_CSV_WITH_BOM);
    const result = matchSchools(locationRows, kessFixtureRows(), {});
    const m = result.matched.find((x) => x.kess.name === "화신초등학교")!;
    const record = buildSchoolRecord(m);
    expect(record).toMatchObject({
      id: "L01",
      name: "화신초등학교",
      level: "elem",
      status: "운영",
      branch: false,
      regionCode: "52730",
      students: 150,
      classes: 8,
      studentsPerClass: 18.75,
      small: false,
    });
    expect(record.lat).toBeCloseTo(36.01, 5);
    expect(record.lng).toBeCloseTo(127.66, 5);
  });

  it("flags small=true at/under SMALL_SCHOOL_MAX_STUDENTS (60), independent of isMain", () => {
    const { rows: locationRows } = parseLocationCsv(LOCATION_CSV_WITH_BOM);
    const result = matchSchools(locationRows, kessFixtureRows(), {});
    const branch = result.matched.find((x) => x.kess.name === "대아초등학교대아분교장")!;
    const record = buildSchoolRecord(branch);
    expect(record.students).toBe(10);
    expect(record.small).toBe(true);
  });

  it("returns studentsPerClass=null when classes is null or 0", () => {
    const { rows: locationRows } = parseLocationCsv(LOCATION_CSV_WITH_BOM);
    const loc = locationRows.find((r) => r.id === "L01")!;
    const kess = kessRow({ name: loc.name, regionCode: loc.regionCode, level: loc.level, classes: null });
    const record = buildSchoolRecord({ location: loc, kess, stage: "exact" });
    expect(record.studentsPerClass).toBeNull();
  });

  it("omits kediCode when the KESS row has none", () => {
    const { rows: locationRows } = parseLocationCsv(LOCATION_CSV_WITH_BOM);
    const loc = locationRows.find((r) => r.id === "L01")!;
    const kess = kessRow({ name: loc.name, regionCode: loc.regionCode, level: loc.level });
    const record = buildSchoolRecord({ location: loc, kess, stage: "exact" });
    expect(record.kediCode).toBeUndefined();
  });
});

describe("buildMatchReport", () => {
  it("computes matchRate = matched / totalKessIncluded and per-stage counts", () => {
    const { rows: locationRows, regionParseFailures } = parseLocationCsv(LOCATION_CSV_WITH_BOM);
    const kessRows = kessFixtureRows();
    const result = matchSchools(locationRows, kessRows, {});
    const report = buildMatchReport(result, kessRows, kessRows.length, regionParseFailures);
    expect(report.totalKessIncluded).toBe(8);
    expect(report.matchedCount).toBe(5);
    expect(report.matchRate).toBeCloseTo(5 / 8, 10);
    expect(report.byStage).toEqual({ exact: 4, suffix: 1, alias: 0 });
    expect(report.unmatchedKess.map((r) => r.name).sort()).toEqual(["미상중학교", "유령고등학교", "대아초등학교"].sort());
    expect(report.regionParseFailures).toHaveLength(1);
  });

  it("annotates a location-only row with the matching (by key) KESS row's status when one exists under a different status (e.g. 폐교)", () => {
    const { rows: locationRows } = parseLocationCsv(LOCATION_CSV_WITH_BOM);
    const kessIncluded = [kessRow({ name: "정읍고등학교", regionCode: "52180", level: "high" })]; // matches L08, leaves L05 (외딴중학교) unmatched
    const allKessRows = [
      ...kessIncluded,
      kessRow({ name: "외딴중학교", regionCode: "52790", level: "mid", status: "폐교" }),
    ];
    const result = matchSchools(locationRows, kessIncluded, {});
    const report = buildMatchReport(result, allKessRows, kessIncluded.length, []);
    const oedan = report.locationOnly.find((r) => r.id === "L05");
    expect(oedan?.kessStatus).toBe("폐교");
  });

  it("leaves kessStatus null when the location-only row has no KESS counterpart under any status", () => {
    const { rows: locationRows } = parseLocationCsv(LOCATION_CSV_WITH_BOM);
    const kessIncluded = [kessRow({ name: "정읍고등학교", regionCode: "52180", level: "high" })];
    const result = matchSchools(locationRows, kessIncluded, {});
    const report = buildMatchReport(result, kessIncluded, kessIncluded.length, []);
    const oedan = report.locationOnly.find((r) => r.id === "L05");
    expect(oedan?.kessStatus).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// fix-round-1: 특수학교 (no-location-source levels) — a KESS row whose 학교급
// the location source doesn't cover at all is not a "matching failure".
// ---------------------------------------------------------------------------

describe("partitionUnmatched", () => {
  it("puts a level covered by sourceLevels into genuinelyUnmatched", () => {
    const kess = kessRow({ name: "미매칭중학교", regionCode: "52110", level: "mid" });
    const { genuinelyUnmatched, noLocationSource } = partitionUnmatched([kess], ["elem", "mid", "high"]);
    expect(genuinelyUnmatched).toEqual([kess]);
    expect(noLocationSource).toEqual([]);
  });

  it("puts a level NOT covered by sourceLevels into noLocationSource", () => {
    const kess = kessRow({ name: "전북특수학교", regionCode: "52110", level: "special" });
    const { genuinelyUnmatched, noLocationSource } = partitionUnmatched([kess], ["elem", "mid", "high"]);
    expect(genuinelyUnmatched).toEqual([]);
    expect(noLocationSource).toEqual([kess]);
  });

  it("defaults sourceLevels to LOCATION_SOURCE_LEVELS (elem/mid/high) when omitted", () => {
    const special = kessRow({ name: "전북특수학교", regionCode: "52110", level: "special" });
    const elem = kessRow({ name: "미매칭초등학교", regionCode: "52110", level: "elem" });
    const { genuinelyUnmatched, noLocationSource } = partitionUnmatched([special, elem]);
    expect(noLocationSource).toEqual([special]);
    expect(genuinelyUnmatched).toEqual([elem]);
  });
});

describe("buildNoLocationSchoolRecord", () => {
  it("uses kedi:<kediCode> as id, null lat/lng, and the given reason", () => {
    const kess = kessRow({
      name: "전북특수학교",
      regionCode: "52110",
      level: "special",
      kediCode: "450099999",
      students: 80,
      classes: 8,
      status: "기존",
    });
    const record = buildNoLocationSchoolRecord(kess, "특수학교는 위치 표준데이터(2026-03-20)에 없음");
    expect(record).toMatchObject({
      id: "kedi:450099999",
      name: "전북특수학교",
      level: "special",
      status: "기존",
      branch: false,
      lat: null,
      lng: null,
      regionCode: "52110",
      students: 80,
      classes: 8,
      studentsPerClass: 10,
      locationMissingReason: "특수학교는 위치 표준데이터(2026-03-20)에 없음",
      kediCode: "450099999",
    });
  });

  it("falls back to a deterministic synthetic id when kediCode is absent", () => {
    const kess = kessRow({ name: "코드없는특수학교", regionCode: "52190", level: "special", kediCode: undefined });
    const record1 = buildNoLocationSchoolRecord(kess, "reason");
    const record2 = buildNoLocationSchoolRecord(kess, "reason");
    expect(record1.id).not.toMatch(/^kedi:/);
    expect(record1.id).toBe(record2.id); // deterministic, not random
    expect(record1.kediCode).toBeUndefined();
  });

  it("computes small the same way buildSchoolRecord does", () => {
    const smallKess = kessRow({ name: "작은특수학교", regionCode: "52110", level: "special", students: 30 });
    const bigKess = kessRow({ name: "큰특수학교", regionCode: "52110", level: "special", students: 200 });
    expect(buildNoLocationSchoolRecord(smallKess, "r").small).toBe(true);
    expect(buildNoLocationSchoolRecord(bigKess, "r").small).toBe(false);
  });
});

describe("buildMatchReport — 특수학교 no-location-source handling", () => {
  it("excludes noLocationSource rows from unmatchedKess/matchRate, and lists them separately", () => {
    const { rows: locationRows } = parseLocationCsv(LOCATION_CSV_WITH_BOM);
    const covered = kessFixtureRows(); // 8 rows: 5 matched, 3 genuinely unmatched (none are special)
    const special = kessRow({ name: "전북특수학교", regionCode: "52110", level: "special" });
    const allIncluded = [...covered, special];

    const result = matchSchools(locationRows, allIncluded, {});
    const report = buildMatchReport(result, allIncluded, allIncluded.length, []);

    expect(report.locationSourceLevels).toEqual(["elem", "mid", "high"]);
    expect(report.noLocationSource).toHaveLength(1);
    expect(report.noLocationSource[0]).toMatchObject({ name: "전북특수학교", level: "special" });
    // The special row must NOT appear in unmatchedKess (it's not a matching failure).
    expect(report.unmatchedKess.some((r) => r.name === "전북특수학교")).toBe(false);
    // totalKessIncluded is scoped to covered levels only: 8 (all of kessFixtureRows), not 9.
    expect(report.totalKessIncluded).toBe(8);
    expect(report.totalKessAll).toBe(9);
    expect(report.matchRate).toBeCloseTo(5 / 8, 10);
  });

  it("matchRate is 100% (1) when every covered-level row matched, even with unmatched specials present", () => {
    const { rows: locationRows } = parseLocationCsv(LOCATION_CSV_WITH_BOM);
    const matched = [kessRow({ name: "정읍고등학교", regionCode: "52180", level: "high" })]; // matches L08
    const special = kessRow({ name: "전북특수학교", regionCode: "52110", level: "special" });
    const allIncluded = [...matched, special];

    const result = matchSchools(locationRows, allIncluded, {});
    const report = buildMatchReport(result, allIncluded, allIncluded.length, []);

    expect(report.unmatchedKess).toEqual([]);
    expect(report.matchRate).toBe(1);
    expect(report.noLocationSource).toHaveLength(1);
  });
});

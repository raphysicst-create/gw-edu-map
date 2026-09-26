import { describe, expect, it, vi } from "vitest";

import {
  aggregateClosedSchools,
  assertPublishedAtNotBeforeReferenceDate,
  parseClosedSchoolsCsv,
  referenceYear,
  regionCodeForClosedSchool,
} from "../../scripts/pipeline/lib/closed-schools";

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

const HEADER =
  "시도교육청코드,시도교육청명,교육지원청코드,교육지원청명,시도코드,시도명,시군구코드,시군구명,폐교명,폐교연도,학교급구분명,활용현황구분명,건물연면적,대지,담당자 부서명,담당자 전화번호,소재지도로명주소,소재지지번주소,데이터기준일자";

interface FixtureRow {
  sigunguCode: string;
  sigunguName: string;
  name: string;
  year: number;
  level: string;
  usage: string;
  buildingArea: number;
  siteArea: number;
  roadAddress?: string;
  jibunAddress?: string;
}

function csvRow(r: FixtureRow): string {
  return [
    "8321000",
    "전북특별자치도교육청",
    "8332000",
    "전북특별자치도전주교육지원청",
    "52",
    "전북특별자치도",
    r.sigunguCode,
    r.sigunguName,
    r.name,
    String(r.year),
    r.level,
    r.usage,
    String(r.buildingArea),
    String(r.siteArea),
    "재정협력과",
    "063-270-6167",
    r.roadAddress ?? `전북특별자치도 ${r.sigunguName} 어딘가로 1`,
    r.jibunAddress ?? `전북특별자치도 ${r.sigunguName} 어딘가동 1`,
    "2026-07-16",
  ].join(",");
}

function csvText(rows: FixtureRow[]): string {
  return [HEADER, ...rows.map(csvRow)].join("\n") + "\n";
}

// 6-row happy-path fixture (per the task brief): 전주시 완산구(111)/덕진구(113)
// merge into 52110, one row with a blank 소재지도로명주소 (jibun fallback), a
// 미활용/자체활용 usage split, and a 최근 10년 boundary anchored on
// referenceDate="2026-07-16" (연도 2026) -> threshold 2017: row[1]=2017 is IN,
// row[0]=2016 is OUT. This fixture's data itself also happens to max out at
// 폐교연도=2026 (군산고), but the boundary is driven by referenceDate, not by
// that coincidence — see the dedicated "anchors on referenceDate" test below,
// which uses a referenceDate whose year differs from the data's own max year.
const FIXTURE_ROWS: FixtureRow[] = [
  {
    sigunguCode: "111",
    sigunguName: "전주시 완산구",
    name: "완산초",
    year: 2016,
    level: "초등학교",
    usage: "자체활용",
    buildingArea: 100,
    siteArea: 200,
  },
  {
    sigunguCode: "113",
    sigunguName: "전주시 덕진구",
    name: "덕진중",
    year: 2017,
    level: "중학교",
    usage: "미활용",
    buildingArea: 300,
    siteArea: 400,
  },
  {
    sigunguCode: "130",
    sigunguName: "군산시",
    name: "군산고",
    year: 2026,
    level: "고등학교",
    usage: "미활용",
    buildingArea: 500,
    siteArea: 600,
  },
  {
    sigunguCode: "130",
    sigunguName: "군산시",
    name: "군산초",
    year: 2010,
    level: "초등학교",
    usage: "자체활용",
    buildingArea: 700,
    siteArea: 800,
    roadAddress: "", // blank road address -> must fall back to 지번주소
    jibunAddress: "전북특별자치도 군산시 어딘가동 4",
  },
  {
    sigunguCode: "800",
    sigunguName: "부안군",
    name: "부안중",
    year: 2020,
    level: "중학교",
    usage: "미활용",
    buildingArea: 900,
    siteArea: 1000,
  },
  {
    sigunguCode: "800",
    sigunguName: "부안군",
    name: "부안고",
    year: 2005,
    level: "고등학교",
    usage: "자체활용",
    buildingArea: 1100,
    siteArea: 1200,
  },
];

describe("regionCodeForClosedSchool", () => {
  it("resolves a plain 시군구코드 to '52' + code", () => {
    expect(regionCodeForClosedSchool("130", "군산시")).toBe("52130");
    expect(regionCodeForClosedSchool("800", "부안군")).toBe("52800");
  });

  it("merges 전주시 완산구(111)/덕진구(113) into 52110", () => {
    expect(regionCodeForClosedSchool("111", "전주시 완산구")).toBe("52110");
    expect(regionCodeForClosedSchool("113", "전주시 덕진구")).toBe("52110");
  });

  it("throws when 시군구코드 and 시군구명 point at different regions", () => {
    // code 130 -> 52130 (군산시), but the name says 정읍시 — a genuine data error.
    expect(() => regionCodeForClosedSchool("130", "정읍시")).toThrow(/불일치/);
  });

  it("throws for a 시군구코드 with no matching REGION_TABLE entry at all", () => {
    expect(() => regionCodeForClosedSchool("999", "존재하지않는군")).toThrow();
  });
});

describe("parseClosedSchoolsCsv", () => {
  it("parses every row of the 6-row fixture with the expected fields", () => {
    const { rows } = parseClosedSchoolsCsv(csvText(FIXTURE_ROWS));
    expect(rows).toHaveLength(6);

    const wansan = rows[0];
    expect(wansan).toEqual({
      regionCode: "52110",
      name: "완산초",
      year: 2016,
      level: "elem",
      usage: "자체활용",
      buildingArea: 100,
      siteArea: 200,
      address: "전북특별자치도 전주시 완산구 어딘가로 1",
    });
  });

  it("merges 완산구(111)/덕진구(113) rows under the same regionCode (52110)", () => {
    const { rows } = parseClosedSchoolsCsv(csvText(FIXTURE_ROWS));
    const jeonjuRows = rows.filter((r) => r.regionCode === "52110");
    expect(jeonjuRows).toHaveLength(2);
    expect(jeonjuRows.map((r) => r.name).sort()).toEqual(["덕진중", "완산초"]);
  });

  it("maps 학교급구분명 to the SchoolLevel union (초/중/고 -> elem/mid/high)", () => {
    const { rows } = parseClosedSchoolsCsv(csvText(FIXTURE_ROWS));
    expect(rows.find((r) => r.name === "완산초")?.level).toBe("elem");
    expect(rows.find((r) => r.name === "덕진중")?.level).toBe("mid");
    expect(rows.find((r) => r.name === "군산고")?.level).toBe("high");
  });

  it("falls back to 소재지지번주소 when 소재지도로명주소 is blank", () => {
    const { rows } = parseClosedSchoolsCsv(csvText(FIXTURE_ROWS));
    const gunsanElem = rows.find((r) => r.name === "군산초");
    expect(gunsanElem?.address).toBe("전북특별자치도 군산시 어딘가동 4");
  });

  it("never carries a 담당자 부서명/전화번호 field through (개인정보성 컬럼 제외)", () => {
    const { rows } = parseClosedSchoolsCsv(csvText(FIXTURE_ROWS));
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(
        ["address", "buildingArea", "level", "name", "regionCode", "siteArea", "usage", "year"].sort(),
      );
    }
  });

  it("throws when a row's 시군구코드/시군구명 don't agree (data error, not a gap to paper over)", () => {
    const badRow: FixtureRow = {
      sigunguCode: "130", // 군산시's code
      sigunguName: "정읍시", // wrong name for that code
      name: "가짜폐교",
      year: 2020,
      level: "초등학교",
      usage: "미활용",
      buildingArea: 1,
      siteArea: 1,
    };
    expect(() => parseClosedSchoolsCsv(csvText([badRow]))).toThrow(/불일치/);
  });

  it("throws on an unrecognized 학교급구분명", () => {
    const badRow: FixtureRow = {
      sigunguCode: "130",
      sigunguName: "군산시",
      name: "이상한폐교",
      year: 2020,
      level: "유치원", // not one of 초/중/고/특수
      usage: "미활용",
      buildingArea: 1,
      siteArea: 1,
    };
    expect(() => parseClosedSchoolsCsv(csvText([badRow]))).toThrow();
  });

  it("strips a leading BOM (real file is UTF-8 BOM)", () => {
    const withBom = "﻿" + csvText(FIXTURE_ROWS);
    const { rows } = parseClosedSchoolsCsv(withBom);
    expect(rows).toHaveLength(6);
  });

  it("trims a padded 활용현황구분명 value instead of treating it as unknown", () => {
    const paddedRow: FixtureRow = {
      sigunguCode: "130",
      sigunguName: "군산시",
      name: "공백폐교",
      year: 2020,
      level: "초등학교",
      usage: "  미활용  ",
      buildingArea: 1,
      siteArea: 1,
    };
    const { rows } = parseClosedSchoolsCsv(csvText([paddedRow]));
    expect(rows[0].usage).toBe("미활용");
  });

  it("a trimmed padded usage value is counted correctly by aggregateClosedSchools", () => {
    const paddedRow: FixtureRow = {
      sigunguCode: "130",
      sigunguName: "군산시",
      name: "공백폐교",
      year: 2020,
      level: "초등학교",
      usage: " 미활용 ",
      buildingArea: 1,
      siteArea: 1,
    };
    const { rows } = parseClosedSchoolsCsv(csvText([paddedRow]));
    const aggregated = aggregateClosedSchools(rows, "2026-07-16");
    expect(aggregated.unused.find((r) => r.regionCode === "52130")?.value).toBe(1);
  });

  it("throws on an unrecognized 활용현황구분명 (not in the known USAGE_VALUES set)", () => {
    const badRow: FixtureRow = {
      sigunguCode: "130",
      sigunguName: "군산시",
      name: "이상한활용폐교",
      year: 2020,
      level: "초등학교",
      usage: "철거예정", // not one of 미활용/자체활용/대부/매각
      buildingArea: 1,
      siteArea: 1,
    };
    expect(() => parseClosedSchoolsCsv(csvText([badRow]))).toThrow(/활용현황구분명/);
  });
});

describe("aggregateClosedSchools", () => {
  const { rows } = parseClosedSchoolsCsv(csvText(FIXTURE_ROWS));
  const aggregated = aggregateClosedSchools(rows, "2026-07-16");

  it("produces all 14 시군 + 52000 rows for every metric, even for regions with 0 폐교", () => {
    for (const metric of ["count", "unused", "recent"] as const) {
      const codes = aggregated[metric].map((r) => r.regionCode).sort();
      const expected = [
        "52000",
        "52110",
        "52130",
        "52140",
        "52180",
        "52190",
        "52210",
        "52710",
        "52720",
        "52730",
        "52740",
        "52750",
        "52770",
        "52790",
        "52800",
      ].sort();
      expect(codes).toEqual(expected);
    }
  });

  it("count: merges 완산/덕진 into 52110=2, and leaves untouched regions at 0", () => {
    const byCode = new Map(aggregated.count.map((r) => [r.regionCode, r.value]));
    expect(byCode.get("52110")).toBe(2); // 완산초 + 덕진중
    expect(byCode.get("52130")).toBe(2); // 군산고 + 군산초
    expect(byCode.get("52800")).toBe(2); // 부안중 + 부안고
    expect(byCode.get("52720")).toBe(0); // 진안군 — no rows at all
    expect(byCode.get("52000")).toBe(6); // 전북 총계 == fixture row count
  });

  it("unused: counts only 활용현황구분명 === '미활용'", () => {
    const byCode = new Map(aggregated.unused.map((r) => [r.regionCode, r.value]));
    expect(byCode.get("52110")).toBe(1); // 덕진중만 미활용
    expect(byCode.get("52130")).toBe(1); // 군산고만 미활용
    expect(byCode.get("52800")).toBe(1); // 부안중만 미활용
    expect(byCode.get("52000")).toBe(3);
  });

  it("recent: 폐교연도 >= (referenceDate 연도 2026 - 9 = 2017) — 2017 is IN, 2016 is OUT", () => {
    const byCode = new Map(aggregated.recent.map((r) => [r.regionCode, r.value]));
    // 52110: 완산초(2016, OUT) + 덕진중(2017, IN) -> 1
    expect(byCode.get("52110")).toBe(1);
    // 52130: 군산고(2026, IN) + 군산초(2010, OUT) -> 1
    expect(byCode.get("52130")).toBe(1);
    // 52800: 부안중(2020, IN) + 부안고(2005, OUT) -> 1
    expect(byCode.get("52800")).toBe(1);
    expect(byCode.get("52000")).toBe(3);
  });

  it("anchors the 최근 10년 window on referenceDate's year, not the data's own max 폐교연도", () => {
    // Same rows (data max 폐교연도 is still 2026, via 군산고), but referenceDate
    // is now 2030-01-01 -> threshold 2021, not 2017. 완산초(2016)/덕진중(2017)
    // and 부안중(2020)/부안고(2005) all fall OUT under the 2021 threshold, even
    // though nothing in `rows` itself changed — proving the anchor is
    // referenceDate, not a value derived from the rows.
    const later = aggregateClosedSchools(rows, "2030-01-01");
    const byCode = new Map(later.recent.map((r) => [r.regionCode, r.value]));
    expect(byCode.get("52110")).toBe(0); // was 1 under the 2017 threshold
    expect(byCode.get("52800")).toBe(0); // was 1 under the 2017 threshold
    expect(byCode.get("52130")).toBe(1); // 군산고(2026, still IN under 2021)
    expect(byCode.get("52000")).toBe(1); // only 군산고
  });

  it("returns an all-zero aggregate for an empty row set", () => {
    const empty = aggregateClosedSchools([], "2026-07-16");
    for (const metric of ["count", "unused", "recent"] as const) {
      expect(empty[metric].every((r) => r.value === 0)).toBe(true);
    }
  });
});

describe("referenceYear", () => {
  it("extracts the calendar year from an ISO YYYY-MM-DD date string", () => {
    expect(referenceYear("2026-07-16")).toBe(2026);
    expect(referenceYear("1999-01-01")).toBe(1999);
  });

  it("throws on a malformed date string", () => {
    expect(() => referenceYear("2026/07/16")).toThrow();
    expect(() => referenceYear("not-a-date")).toThrow();
    expect(() => referenceYear("")).toThrow();
  });
});

describe("assertPublishedAtNotBeforeReferenceDate", () => {
  it("does not throw when publishedAt is on or after referenceDate", () => {
    expect(() => assertPublishedAtNotBeforeReferenceDate("2026-07-16", "2026-07-16")).not.toThrow();
    expect(() => assertPublishedAtNotBeforeReferenceDate("2026-07-16", "2026-07-20")).not.toThrow();
  });

  it("throws when publishedAt is before referenceDate", () => {
    expect(() => assertPublishedAtNotBeforeReferenceDate("2026-07-16", "2026-07-01")).toThrow(
      /날짜/,
    );
  });
});

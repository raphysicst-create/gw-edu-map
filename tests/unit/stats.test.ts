import { describe, expect, it } from "vitest";

import {
  changeYearRange,
  collisionPriorityFromRank,
  deltaPrevYear,
  displayLabel,
  rank,
  referenceDateLabel,
  regionValues,
  shareOfProvince,
  trend,
  valueMap,
  vsProvince,
} from "@/lib/stats";
import type { IndicatorDef, IndicatorFile, SeriesFile } from "@/lib/indicators/types";
import { formatInt } from "@/lib/format";
import { REGION_CODES } from "@/lib/geo/regions";

function fileFixture(): IndicatorFile {
  return {
    id: "students_total",
    year: 2026,
    referenceDate: "2026-04-01",
    source: { name: "KESS", url: "https://example.com", year: 2026 },
    rows: [
      { regionCode: "51110", value: 100 },
      { regionCode: "51130", value: 50 },
      { regionCode: "51000", value: 150 },
      // byLevel breakdown rows (level set) — must be excluded by valueMap.
      { regionCode: "51110", value: 60, level: "elem" },
      { regionCode: "51130", value: 30, level: "elem" },
      { regionCode: "51000", value: 90, level: "elem" },
    ],
  };
}

describe("valueMap", () => {
  it("keeps only rows without a level, keyed by regionCode", () => {
    const map = valueMap(fileFixture());
    expect(map.size).toBe(3);
    expect(map.get("51110")).toBe(100);
    expect(map.get("51130")).toBe(50);
    expect(map.get("51000")).toBe(150);
  });

  it("preserves null values (not dropped)", () => {
    const file: IndicatorFile = {
      ...fileFixture(),
      rows: [{ regionCode: "51110", value: null }],
    };
    const map = valueMap(file);
    expect(map.get("51110")).toBeNull();
  });
});

describe("regionValues", () => {
  it("excludes 51000 and returns the remaining {code, value} pairs", () => {
    const map = valueMap(fileFixture());
    const values = regionValues(map);
    expect(values).toHaveLength(2);
    expect(values.map((v) => v.code).sort()).toEqual(["51110", "51130"]);
    expect(values.find((v) => v.code === "51000")).toBeUndefined();
  });
});

describe("rank", () => {
  // Fix round 1 (review finding #3): `rank` no longer takes a `polarity`
  // parameter at all — ranking is always by descending raw value (1위 =
  // 가장 큰 값), for every polarity, per the controller's ruling. The three
  // near-duplicate per-polarity tests that used to pin this down (when
  // `polarity` was still an accepted-but-unused argument) are collapsed
  // into one, since there is no longer a parameter to vary.
  it("ranks sample 시군 by descending raw value (largest = rank 1), excluding 51000", () => {
    const map = new Map([
      ["51110", 30],
      ["51130", 10],
      ["51150", 20],
      ["51000", 999],
    ]);
    const ranks = rank(map);
    expect(ranks.get("51110")).toBe(1);
    expect(ranks.get("51150")).toBe(2);
    expect(ranks.get("51130")).toBe(3);
    expect(ranks.has("51000")).toBe(false);
  });

  it("gives ties the same (competition-style) rank and skips the next", () => {
    const map = new Map([
      ["51110", 10],
      ["51130", 10],
      ["51150", 8],
    ]);
    const ranks = rank(map);
    expect(ranks.get("51110")).toBe(1);
    expect(ranks.get("51130")).toBe(1);
    expect(ranks.get("51150")).toBe(3); // skips rank 2
  });

  it("omits regions with a null value entirely", () => {
    const map = new Map<string, number | null>([
      ["51110", 10],
      ["51130", null],
    ]);
    const ranks = rank(map);
    expect(ranks.has("51130")).toBe(false);
    expect(ranks.get("51110")).toBe(1);
  });
});

describe("collisionPriorityFromRank", () => {
  const regionCount = REGION_CODES.length;

  it("negates the rank", () => {
    expect(collisionPriorityFromRank(1, regionCount)).toBe(-1);
    expect(collisionPriorityFromRank(regionCount, regionCount)).toBe(-regionCount);
  });

  it("undefined or null (no rank at all, i.e. no data) maps below every region rank", () => {
    expect(collisionPriorityFromRank(undefined, regionCount)).toBe(-(regionCount + 1));
    expect(collisionPriorityFromRank(null, regionCount)).toBe(-(regionCount + 1));
  });

  // A school label's collision priority (schoolLayers.ts's
  // schoolCollisionPriority) is clamped to [-1000, -100] specifically so it
  // can NEVER outrank a 시군 (region) label, selected or not — this pins
  // down the region side of that guarantee: every real output this function
  // can ever produce stays within [-(regionCount+1), -1], strictly above -100.
  it("every output stays within the Gangwon rank bounds and above school-label priority -100", () => {
    const outputs = [
      ...Array.from({ length: regionCount }, (_, i) => collisionPriorityFromRank(i + 1, regionCount)),
      collisionPriorityFromRank(undefined, regionCount),
      collisionPriorityFromRank(null, regionCount),
    ];
    for (const priority of outputs) {
      expect(priority).toBeGreaterThanOrEqual(-(regionCount + 1));
      expect(priority).toBeLessThanOrEqual(-1);
      expect(priority).toBeGreaterThan(-100);
    }
  });
});

describe("vsProvince", () => {
  it("returns value minus the province row", () => {
    const map = valueMap(fileFixture());
    expect(vsProvince(map, "51110")).toBe(100 - 150);
  });

  it("returns null when the region's own value is null", () => {
    const map = new Map<string, number | null>([
      ["51110", null],
      ["51000", 150],
    ]);
    expect(vsProvince(map, "51110")).toBeNull();
  });

  it("returns null when the province value is null", () => {
    const map = new Map<string, number | null>([
      ["51110", 100],
      ["51000", null],
    ]);
    expect(vsProvince(map, "51110")).toBeNull();
  });
});

describe("shareOfProvince", () => {
  it("returns value/province * 100, on a 0-100 scale", () => {
    const map = new Map<string, number | null>([
      ["51110", 25],
      ["51000", 100],
    ]);
    expect(shareOfProvince(map, "51110")).toBe(25);
  });

  it("handles a region value larger than any single-region share intuition would suggest (still just value/province*100)", () => {
    const map = new Map<string, number | null>([
      ["51110", 700],
      ["51000", 500],
    ]);
    expect(shareOfProvince(map, "51110")).toBe(140);
  });

  it("returns 0 for a region with value 0 (not null — a real, known zero share)", () => {
    const map = new Map<string, number | null>([
      ["51110", 0],
      ["51000", 100],
    ]);
    expect(shareOfProvince(map, "51110")).toBe(0);
  });

  it("returns null when the region's own value is null", () => {
    const map = new Map<string, number | null>([
      ["51110", null],
      ["51000", 100],
    ]);
    expect(shareOfProvince(map, "51110")).toBeNull();
  });

  it("returns null when the province value is null", () => {
    const map = new Map<string, number | null>([
      ["51110", 10],
      ["51000", null],
    ]);
    expect(shareOfProvince(map, "51110")).toBeNull();
  });

  it("returns null when the province value is 0 (avoids Infinity/NaN)", () => {
    const map = new Map<string, number | null>([
      ["51110", 10],
      ["51000", 0],
    ]);
    expect(shareOfProvince(map, "51110")).toBeNull();
  });
});

function seriesFixture(): SeriesFile {
  return {
    id: "students_total",
    rows: [
      { regionCode: "51110", year: 2024, value: 100 },
      { regionCode: "51110", year: 2022, value: 80 },
      { regionCode: "51110", year: 2023, value: 90 },
      { regionCode: "51130", year: 2023, value: 40 },
    ],
  };
}

describe("trend", () => {
  it("returns a region's rows sorted by ascending year", () => {
    const rows = trend(seriesFixture(), "51110");
    expect(rows).toEqual([
      { year: 2022, value: 80 },
      { year: 2023, value: 90 },
      { year: 2024, value: 100 },
    ]);
  });

  it("returns an empty array for an unknown region", () => {
    expect(trend(seriesFixture(), "99999")).toEqual([]);
  });
});

describe("deltaPrevYear", () => {
  it("returns latest minus the immediately preceding year", () => {
    expect(deltaPrevYear(seriesFixture(), "51110", 2024)).toBe(100 - 90);
  });

  it("returns null when there is no preceding year", () => {
    const series: SeriesFile = { id: "x", rows: [{ regionCode: "51110", year: 2022, value: 80 }] };
    expect(deltaPrevYear(series, "51110", 2022)).toBeNull();
  });

  it("returns null when the latest year itself is missing", () => {
    expect(deltaPrevYear(seriesFixture(), "51110", 2099)).toBeNull();
  });

  it("returns null when either value is null", () => {
    const series: SeriesFile = {
      id: "x",
      rows: [
        { regionCode: "51110", year: 2022, value: null },
        { regionCode: "51110", year: 2023, value: 90 },
      ],
    };
    expect(deltaPrevYear(series, "51110", 2023)).toBeNull();
  });
});

describe("changeYearRange", () => {
  it("returns [minYear, maxYear] across a series' rows", () => {
    expect(changeYearRange(seriesFixture())).toEqual([2022, 2024]);
  });

  it("returns null for an undefined series (e.g. an external-kind indicator with no series file)", () => {
    expect(changeYearRange(undefined)).toBeNull();
  });

  it("returns null for a series with no rows", () => {
    expect(changeYearRange({ id: "x", rows: [] })).toBeNull();
  });
});

describe("displayLabel", () => {
  const baseDef: IndicatorDef = {
    id: "students_total",
    group: "scale",
    label: "학생수",
    unit: "명",
    polarity: "neutral",
    kind: "count",
    format: formatInt,
    source: { name: "KESS", url: "https://example.com", year: 2026 },
    aggregate: { kind: "sum", field: "students" },
    description: "테스트용 설명",
  };

  it("returns def.label unchanged for a normal indicator", () => {
    expect(displayLabel(baseDef, {})).toBe("학생수");
  });

  it("replaces the static '5년' span with the real series year range for students_change_5y", () => {
    const def: IndicatorDef = { ...baseDef, id: "students_change_5y", label: "학생수 5년 증감률" };
    const series = { students_total: seriesFixture() };
    expect(displayLabel(def, series)).toBe("학생수 2022→2024 증감률");
  });

  it("falls back to the static label when the students_total series is unavailable", () => {
    const def: IndicatorDef = { ...baseDef, id: "students_change_5y", label: "학생수 5년 증감률" };
    expect(displayLabel(def, {})).toBe("학생수 5년 증감률");
  });
});

describe("referenceDateLabel", () => {
  it("formats as '기준 {year}.{month}.{day}' with no zero-padding", () => {
    const file: IndicatorFile = { ...fileFixture(), referenceDate: "2026-04-01" };
    expect(referenceDateLabel(file)).toBe("기준 2026.4.1");
  });

  it("takes month/day from the file's own referenceDate", () => {
    const file: IndicatorFile = { ...fileFixture(), referenceDate: "2026-12-25" };
    expect(referenceDateLabel(file)).toBe("기준 2026.12.25");
  });

  // Fix round 2, finding 2 — the OLD implementation took the displayed YEAR
  // from manifest.latestYear while month/day came from a DIFFERENT source
  // (the file actually being displayed)'s own referenceDate, which could
  // assemble a year/month/day combination that never actually occurred
  // together: a KESS refresh bumping manifest.latestYear to 2027 while
  // closed-schools.json's own referenceDate stayed "2026-07-16" (폐교재산
  // 현황's real 기준일) would have printed "기준 2027.7.16" — a date that
  // doesn't exist in either source. referenceDateLabel no longer takes a
  // manifest argument AT ALL (dropped, not just unused) — this regression
  // test pins down the actual guarantee: every part of the caption comes
  // from the ONE file actually being displayed, even when that file's own
  // (unrelated) `year` field disagrees with its referenceDate's year.
  it("never lets a different year leak in — year/month/day all come from the same file.referenceDate (simulates the KESS-2027-vs-폐교-2026-07-16 scenario)", () => {
    const file: IndicatorFile = { ...fileFixture(), year: 2027, referenceDate: "2026-07-16" };
    expect(referenceDateLabel(file)).toBe("기준 2026.7.16");
  });
});

import { describe, expect, it } from "vitest";

import { formatDelta, formatShare, formatWithUnit, makeLinesOf } from "@/lib/tooltipText";
import type { IndicatorDef } from "@/lib/indicators/types";
import { formatInt, formatPercent } from "@/lib/format";
import { PROVINCE_CODE, REGION_CODES } from "@/lib/geo/regions";
import { shareOfProvince } from "@/lib/stats";

// Small local fixtures (no network, no real registry import) — mirrors the
// pattern already used in tests/unit/stats.test.ts's `baseDef`.
const countDef: IndicatorDef = {
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

const ratioDef: IndicatorDef = {
  id: "students_per_class",
  group: "scale",
  label: "학급당 학생수",
  unit: "%",
  polarity: "higherWorse",
  kind: "ratio",
  format: (v: number) => formatPercent(v),
  source: { name: "KESS", url: "https://example.com", year: 2026 },
  aggregate: { kind: "ratio", numerator: "students", denominator: "classes" },
  description: "테스트용 설명",
};

describe("formatWithUnit", () => {
  it("appends def.unit when the formatted value doesn't already end with it", () => {
    expect(formatWithUnit(countDef, 1234)).toBe(`${formatInt(1234)}명`);
  });

  it("does not double up the unit when def.format already embeds it (e.g. formatPercent -> '%')", () => {
    const result = formatWithUnit(ratioDef, 12.3);
    expect(result).toBe(formatPercent(12.3));
    expect(result).not.toMatch(/%%/);
  });
});

describe("formatDelta", () => {
  it("prefixes a positive delta with +", () => {
    expect(formatDelta(countDef, 200)).toBe(`+${formatInt(200)}명`);
  });

  it("prefixes a negative delta with an ASCII '-' and formats the (absolute) magnitude", () => {
    expect(formatDelta(countDef, -400)).toBe(`-${formatInt(400)}명`);
  });
});

describe("makeLinesOf", () => {
  // 51110 춘천시, 51130 원주시, 51150 강릉시 — real REGION_CODES so nameOf()
  // resolves a real name instead of falling back to the raw code.
  const countMap = new Map<string, number | null>([
    ["51110", 700],
    ["51130", 100],
    ["51150", null],
    [PROVINCE_CODE, 500],
  ]);

  it("returns the 2-line '자료 없음' branch when the region has no value", () => {
    const linesOf = makeLinesOf({ def: countDef, label: "학생수", map: countMap });
    const lines = linesOf("51150");
    expect(lines).toEqual(["강릉시", "학생수: 자료 없음"]);
  });

  it("renders the rank line as '{REGION_CODES.length}개 시군 중 n위' (fix round 2 — not hardcoded '14개')", () => {
    const linesOf = makeLinesOf({ def: countDef, label: "학생수", map: countMap });
    const lines = linesOf("51110");
    expect(lines[0]).toBe("춘천시");
    expect(lines[2]).toBe(`${REGION_CODES.length}개 시군 중 1위`);
  });

  it("uses '강원 대비 비중' wording (share, not a delta) for a count-kind indicator — 시군값/51000값×100", () => {
    const linesOf = makeLinesOf({ def: countDef, label: "학생수", map: countMap });
    // 51110: 700 / 500(province) * 100 = 140%
    const lines = linesOf("51110");
    const expectedShare = shareOfProvince(countMap, "51110")!;
    expect(expectedShare).toBe(140);
    expect(lines[3]).toBe(`강원 대비 비중 ${formatShare(expectedShare)}`);
  });

  it("a count-kind share is never signed, even for a region under the province total", () => {
    const linesOf = makeLinesOf({ def: countDef, label: "학생수", map: countMap });
    // 51130: 100 / 500(province) * 100 = 20%
    const lines = linesOf("51130");
    const expectedShare = shareOfProvince(countMap, "51130")!;
    expect(expectedShare).toBe(20);
    expect(lines[3]).toBe(`강원 대비 비중 ${formatShare(expectedShare)}`);
    expect(lines[3]).not.toMatch(/[+-]/);
  });

  it("uses '강원 평균 대비' wording for a ratio-kind indicator", () => {
    const ratioMap = new Map<string, number | null>([
      ["51110", 20],
      ["51130", 15],
      [PROVINCE_CODE, 18],
    ]);
    const linesOf = makeLinesOf({ def: ratioDef, label: "학급당 학생수", map: ratioMap });
    const lines = linesOf("51110");
    expect(lines[3]).toBe(`강원 평균 대비 +${formatPercent(2)}`);
  });

  it('shows "순위 없음" for a code that has a value but is excluded from ranking (51000 itself)', () => {
    const linesOf = makeLinesOf({ def: countDef, label: "학생수", map: countMap });
    const lines = linesOf(PROVINCE_CODE);
    // PROVINCE_CODE is deliberately not a recognized RegionCode (geo/regions.ts),
    // so nameOf() falls back to the raw code.
    expect(lines[0]).toBe(PROVINCE_CODE);
    expect(lines[2]).toBe("순위 없음");
  });

  it("shows '자료 없음' on the share line (count-kind) when the province (51000) value itself is null", () => {
    const map = new Map<string, number | null>([
      ["51110", 100],
      [PROVINCE_CODE, null],
    ]);
    const linesOf = makeLinesOf({ def: countDef, label: "학생수", map });
    const lines = linesOf("51110");
    expect(lines[3]).toBe("강원 대비 비중: 자료 없음");
  });

  it("shows '자료 없음' on the delta line (ratio-kind) when the province (51000) value itself is null", () => {
    const map = new Map<string, number | null>([
      ["51110", 20],
      [PROVINCE_CODE, null],
    ]);
    const linesOf = makeLinesOf({ def: ratioDef, label: "학급당 학생수", map });
    const lines = linesOf("51110");
    expect(lines[3]).toBe("강원 평균 대비: 자료 없음");
  });
});

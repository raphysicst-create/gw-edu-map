import { describe, expect, it } from "vitest";

import { ELEVATION_FLOOR, ELEVATION_MAX, domainOf, makeElevationScale } from "@/lib/scales";
import type { IndicatorDef } from "@/lib/indicators/types";
import { formatInt } from "@/lib/format";

function countDef(overrides: Partial<IndicatorDef> = {}): IndicatorDef {
  return {
    id: "x",
    group: "scale",
    label: "x",
    unit: "명",
    polarity: "neutral",
    kind: "count",
    format: formatInt,
    source: { name: "KESS", url: "https://example.com", year: 2026 },
    aggregate: { kind: "sum", field: "students" },
    description: "테스트용 설명",
    ...overrides,
  };
}

const map14 = new Map<string, number | null>([
  ["51110", 100],
  ["51130", 50],
  ["51150", 10],
  ["51000", 9999], // must be excluded from domain computation
]);

describe("ELEVATION_FLOOR / ELEVATION_MAX", () => {
  it("keeps FLOOR at 800m (thin plate at value 0)", () => {
    expect(ELEVATION_FLOOR).toBe(800);
  });

  it("tunes MAX within the 12,000-20,000m band per 추가 요구 #1", () => {
    expect(ELEVATION_MAX).toBeGreaterThanOrEqual(12000);
    expect(ELEVATION_MAX).toBeLessThanOrEqual(20000);
  });
});

describe("domainOf", () => {
  it("uses def.domain verbatim when set, ignoring the data", () => {
    const def = countDef({ domain: [5, 25] });
    expect(domainOf(def, map14)).toEqual([5, 25]);
  });

  it("floors count-kind domains at 0 regardless of the data minimum", () => {
    const def = countDef({ kind: "count" });
    expect(domainOf(def, map14)).toEqual([0, 100]);
  });

  it("uses [dataMin, dataMax] for ratio-kind domains", () => {
    const def = countDef({ kind: "ratio" });
    expect(domainOf(def, map14)).toEqual([10, 100]);
  });

  it("excludes null values from the computed domain", () => {
    const map = new Map<string, number | null>([
      ["51110", 100],
      ["51130", null],
      ["51150", 10],
    ]);
    expect(domainOf(countDef({ kind: "ratio" }), map)).toEqual([10, 100]);
  });

  it("excludes the 51000 row from the computed domain", () => {
    const map = new Map<string, number | null>([
      ["51110", 5],
      ["51000", 99999],
    ]);
    expect(domainOf(countDef({ kind: "count" }), map)).toEqual([0, 5]);
  });

  it("widens a zero-width domain to [min, min+1] to avoid div-by-zero", () => {
    const map = new Map<string, number | null>([
      ["51110", 7],
      ["51130", 7],
    ]);
    expect(domainOf(countDef({ kind: "ratio" }), map)).toEqual([7, 8]);
  });

  it("supports negative ratio domains (e.g. a decline-everywhere percent-change indicator)", () => {
    const map = new Map<string, number | null>([
      ["51110", -4.9],
      ["51130", -19.8],
    ]);
    expect(domainOf(countDef({ kind: "ratio" }), map)).toEqual([-19.8, -4.9]);
  });
});

describe("makeElevationScale", () => {
  it("maps the domain min to FLOOR and the domain max to ELEVATION_MAX", () => {
    const def = countDef({ kind: "ratio", domain: [0, 100] });
    const map = new Map<string, number | null>([
      ["51110", 0],
      ["51130", 100],
    ]);
    const elevationOf = makeElevationScale(def, map);
    expect(elevationOf("51110")).toBeCloseTo(ELEVATION_FLOOR, 5);
    expect(elevationOf("51130")).toBeCloseTo(ELEVATION_MAX, 5);
  });

  it("linearly interpolates between FLOOR and MAX", () => {
    const def = countDef({ kind: "ratio", domain: [0, 100] });
    const map = new Map<string, number | null>([["51110", 50]]);
    const elevationOf = makeElevationScale(def, map);
    expect(elevationOf("51110")).toBeCloseTo(ELEVATION_FLOOR + (ELEVATION_MAX - ELEVATION_FLOOR) * 0.5, 5);
  });

  it("returns FLOOR for a null value", () => {
    const def = countDef({ kind: "ratio", domain: [0, 100] });
    const map = new Map<string, number | null>([["51110", null]]);
    const elevationOf = makeElevationScale(def, map);
    expect(elevationOf("51110")).toBe(ELEVATION_FLOOR);
  });

  it("returns FLOOR for a code missing from the map entirely", () => {
    const def = countDef({ kind: "ratio", domain: [0, 100] });
    const elevationOf = makeElevationScale(def, new Map());
    expect(elevationOf("51110")).toBe(ELEVATION_FLOOR);
  });

  it("clamps values above the domain max to ELEVATION_MAX", () => {
    const def = countDef({ kind: "ratio", domain: [0, 100] });
    const map = new Map<string, number | null>([["51110", 500]]);
    const elevationOf = makeElevationScale(def, map);
    expect(elevationOf("51110")).toBeCloseTo(ELEVATION_MAX, 5);
  });

  it("clamps values below the domain min to FLOOR", () => {
    const def = countDef({ kind: "ratio", domain: [10, 100] });
    const map = new Map<string, number | null>([["51110", -5]]);
    const elevationOf = makeElevationScale(def, map);
    expect(elevationOf("51110")).toBeCloseTo(ELEVATION_FLOOR, 5);
  });

  it("applies a sqrt transform to the normalized value when def.scale is 'sqrt'", () => {
    const def = countDef({ kind: "ratio", domain: [0, 100], scale: "sqrt" });
    const map = new Map<string, number | null>([["51110", 25]]); // norm=0.25, sqrt(0.25)=0.5
    const elevationOf = makeElevationScale(def, map);
    expect(elevationOf("51110")).toBeCloseTo(ELEVATION_FLOOR + (ELEVATION_MAX - ELEVATION_FLOOR) * 0.5, 5);
  });
});

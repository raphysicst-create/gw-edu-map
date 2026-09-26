import { describe, expect, it } from "vitest";
import type { Feature, MultiPolygon } from "geojson";

import {
  isRegionCode,
  PROVINCE_CODE,
  REGION_CODES,
  regionName,
  REGIONS,
} from "@/lib/geo/regions";
import {
  bboxOf,
  ringsOf,
  splitRegionIslands,
  unionBbox,
  type RegionFeature,
  type RegionsFeatureCollection,
} from "@/lib/geo/geo";

describe("REGIONS", () => {
  it("has exactly 18 entries", () => {
    expect(REGIONS).toHaveLength(18);
  });

  it("has unique codes", () => {
    const codes = REGIONS.map((r) => r.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("REGION_CODES mirrors REGIONS codes in order", () => {
    expect(REGION_CODES).toEqual(REGIONS.map((r) => r.code));
  });

  it("PROVINCE_CODE is 51000", () => {
    expect(PROVINCE_CODE).toBe("51000");
  });

  it("isRegionCode narrows known codes and rejects unknown ones", () => {
    expect(isRegionCode("51110")).toBe(true);
    expect(isRegionCode("51830")).toBe(true);
    expect(isRegionCode("99999")).toBe(false);
    expect(isRegionCode("51000")).toBe(false); // province code is not a region code
  });

  it("regionName returns the Korean name for a known code", () => {
    expect(regionName("51110")).toBe("춘천시");
    expect(regionName("51130")).toBe("원주시");
    expect(regionName("51830")).toBe("양양군");
  });
});

function rectFeature(
  code: string,
  [minLng, minLat, maxLng, maxLat]: [number, number, number, number],
): RegionFeature {
  return {
    type: "Feature",
    properties: {
      code,
      name: code,
      bbox: [minLng, minLat, maxLng, maxLat],
      labelPoint: [(minLng + maxLng) / 2, (minLat + maxLat) / 2],
    },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [minLng, minLat],
          [maxLng, minLat],
          [maxLng, maxLat],
          [minLng, maxLat],
          [minLng, minLat],
        ],
      ],
    },
  };
}

describe("ringsOf", () => {
  it("returns the single ring of a Polygon feature", () => {
    const feature = rectFeature("A", [0, 0, 1, 1]);
    const rings = ringsOf(feature);
    expect(rings).toHaveLength(1);
    expect(rings[0]).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ]);
  });

  it("returns one ring per part of a MultiPolygon feature", () => {
    const feature: Feature<MultiPolygon, RegionFeature["properties"]> = {
      type: "Feature",
      properties: {
        code: "B",
        name: "B",
        bbox: [0, 0, 3, 1],
        labelPoint: [0.5, 0.5],
      },
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 1],
              [0, 0],
            ],
          ],
          [
            [
              [2, 0],
              [3, 0],
              [3, 1],
              [2, 1],
              [2, 0],
            ],
          ],
        ],
      },
    };
    const rings = ringsOf(feature);
    expect(rings).toHaveLength(2);
    expect(rings[0][0]).toEqual([0, 0]);
    expect(rings[1][0]).toEqual([2, 0]);
  });
});

describe("bboxOf", () => {
  it("computes the bounding box from geometry, ignoring properties.bbox", () => {
    const feature = rectFeature("A", [1, 2, 3, 4]);
    // Deliberately wrong properties.bbox: bboxOf must derive from geometry.
    (feature.properties as unknown as { bbox: unknown }).bbox = [0, 0, 0, 0];
    expect(bboxOf(feature)).toEqual([1, 2, 3, 4]);
  });
});

describe("unionBbox", () => {
  it("unions the bbox of multiple region features", () => {
    const a = rectFeature("A", [0, 0, 1, 1]);
    const b = rectFeature("B", [2, 2, 3, 3]);
    expect(unionBbox([a, b])).toEqual([0, 0, 3, 3]);
  });

  it("throws on an empty feature list", () => {
    expect(() => unionBbox([])).toThrow();
  });
});

// Task 6, Section C.1 — 섬은 평면으로: splits each region's MultiPolygon into
// its single largest-area part (`main`) plus whatever's left (`islands`).
describe("splitRegionIslands", () => {
  /** A closed square ring [x,y]..[x+size,y+size], CCW winding. */
  function square(x: number, y: number, size: number): [number, number][] {
    return [
      [x, y],
      [x + size, y],
      [x + size, y + size],
      [x, y + size],
      [x, y],
    ];
  }

  function multiPolygonFeature(code: string, parts: [number, number][][]): RegionFeature {
    return {
      type: "Feature",
      properties: {
        code,
        name: code,
        bbox: [0, 0, 10, 10],
        labelPoint: [5, 5],
      },
      geometry: {
        type: "MultiPolygon",
        coordinates: parts.map((ring) => [ring]),
      },
    };
  }

  function fc(features: RegionFeature[]): RegionsFeatureCollection {
    return { type: "FeatureCollection", features };
  }

  it("puts a single-part Polygon region entirely into `main`, contributing nothing to `islands`", () => {
    const solo = rectFeature("51130", [0, 0, 1, 1]);
    const { main, islands } = splitRegionIslands(fc([solo]));
    expect(main.features).toHaveLength(1);
    expect(main.features[0].properties.code).toBe("51130");
    expect(main.features[0].geometry.type).toBe("Polygon");
    expect(islands.features).toHaveLength(0);
  });

  it("picks the largest-area part as `main` (Polygon) and puts the rest in `islands`", () => {
    // mainland: 4x4=16, islet: 1x1=1 — mainland must win regardless of
    // input order.
    const mainland = square(0, 0, 4);
    const islet = square(6, 6, 1);
    const region = multiPolygonFeature("51130", [islet, mainland]); // islet listed FIRST
    const { main, islands } = splitRegionIslands(fc([region]));

    expect(main.features).toHaveLength(1);
    expect(main.features[0].geometry).toEqual({ type: "Polygon", coordinates: [mainland] });
    expect(main.features[0].properties.code).toBe("51130");

    expect(islands.features).toHaveLength(1);
    expect(islands.features[0].properties.code).toBe("51130");
    expect(islands.features[0].geometry).toEqual({ type: "Polygon", coordinates: [islet] });
  });

  it("bundles 2+ remaining parts into one MultiPolygon `islands` feature", () => {
    const mainland = square(0, 0, 5);
    const isletA = square(6, 6, 1);
    const isletB = square(8, 8, 0.5);
    const region = multiPolygonFeature("51130", [mainland, isletA, isletB]);
    const { main, islands } = splitRegionIslands(fc([region]));

    expect(main.features[0].geometry).toEqual({ type: "Polygon", coordinates: [mainland] });
    expect(islands.features).toHaveLength(1);
    expect(islands.features[0].geometry).toEqual({
      type: "MultiPolygon",
      coordinates: [[isletA], [isletB]],
    });
  });

  it("only regions that actually have extra parts contribute an `islands` feature", () => {
    const soloRegion = rectFeature("51110", [0, 0, 1, 1]); // Polygon, no islands
    const multiRegion = multiPolygonFeature("51130", [square(0, 0, 4), square(6, 6, 1)]);
    const { main, islands } = splitRegionIslands(fc([soloRegion, multiRegion]));

    expect(main.features).toHaveLength(2); // every region always contributes to `main`
    expect(islands.features).toHaveLength(1); // only 51130 has a leftover part
    expect(islands.features[0].properties.code).toBe("51130");
  });

  it("preserves the region's properties (code/name/bbox/labelPoint) on both main and island features", () => {
    const region = multiPolygonFeature("51130", [square(0, 0, 4), square(6, 6, 1)]);
    const { main, islands } = splitRegionIslands(fc([region]));
    expect(main.features[0].properties).toEqual(region.properties);
    expect(islands.features[0].properties).toEqual(region.properties);
  });

  it("compares areas per-region only (a huge part of one region never masks a genuinely-largest part of another)", () => {
    const small = multiPolygonFeature("51130", [square(0, 0, 1), square(20, 20, 0.5)]);
    const { main } = splitRegionIslands(fc([small]));
    // 51130's own largest part (1x1=1) wins for 51130, regardless of any
    // other region's absolute size.
    expect(main.features[0].geometry).toEqual({ type: "Polygon", coordinates: [square(0, 0, 1)] });
  });
});

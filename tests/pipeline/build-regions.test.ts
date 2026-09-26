import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Feature, FeatureCollection, Polygon } from "geojson";

import {
  LABEL_OFFSET_METERS_PER_PX,
  labelOffsetToLngLat,
  transformNeighbors,
  transformRegions,
} from "../../scripts/pipeline/build-regions";

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

type SourceProps = {
  adm_nm: string;
  adm_cd: string;
  adm_cd2: string;
  sgg: string;
  sggnm: string;
  sido: string;
  sidonm: string;
};

function rect(
  [minLng, minLat, maxLng, maxLat]: [number, number, number, number],
  properties: SourceProps,
): Feature<Polygon, SourceProps> {
  return {
    type: "Feature",
    properties,
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

// Mirrors the real admdongkor source's 읍면동 (eupmyeondong) granularity:
// two adjacent 전주시 gu's that must collapse into one 52110 feature, one
// untouched 군산시 feature, and one out-of-province 충남 feature that must
// be dropped from regions.geojson but picked up by neighbors.geojson.
function fixture(): FeatureCollection<Polygon, SourceProps> {
  return {
    type: "FeatureCollection",
    features: [
      rect([127.1, 35.78, 127.15, 35.83], {
        adm_nm: "전북특별자치도 전주시 완산구 중앙동",
        adm_cd: "52111250",
        adm_cd2: "5211110100",
        sgg: "52111",
        sggnm: "완산구",
        sido: "52",
        sidonm: "전북특별자치도",
      }),
      rect([127.15, 35.78, 127.2, 35.83], {
        adm_nm: "전북특별자치도 전주시 덕진구 금암1동",
        adm_cd: "52113253",
        adm_cd2: "5211310100",
        sgg: "52113",
        sggnm: "덕진구",
        sido: "52",
        sidonm: "전북특별자치도",
      }),
      rect([126.6, 35.9, 126.7, 36.0], {
        adm_nm: "전북특별자치도 군산시 나운동",
        adm_cd: "52130320",
        adm_cd2: "5213010100",
        sgg: "52130",
        sggnm: "군산시",
        sido: "52",
        sidonm: "전북특별자치도",
      }),
      rect([127.0, 36.5, 127.1, 36.6], {
        adm_nm: "충청남도 천안시서북구 성정동",
        adm_cd: "44131253",
        adm_cd2: "4413110100",
        sgg: "44131",
        sggnm: "천안시서북구",
        sido: "44",
        sidonm: "충청남도",
      }),
    ],
  };
}

function publicDataHashes(directory = path.resolve("public/data")): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) Object.assign(hashes, publicDataHashes(file));
    else hashes[path.relative(path.resolve("public/data"), file)] = createHash("sha256").update(readFileSync(file)).digest("hex");
  }
  return hashes;
}

describe("legacy writer safety", () => {
  it("blocks Jeonbuk pipeline CLIs under Gangwon and leaves public data unchanged", () => {
    const before = publicDataHashes();
    for (const script of [
      "scripts/pipeline/build-regions.ts",
      "scripts/pipeline/build-emd.ts",
      "scripts/pipeline/build-schools.ts",
      "scripts/pipeline/build-closed-schools.ts",
    ]) {
      let failure: { status?: number; stderr?: Buffer } | undefined;
      try {
        execFileSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", script], {
          cwd: process.cwd(),
          encoding: "buffer",
          stdio: "pipe",
          env: { ...process.env, EDU_MAP_PROFILE: "gangwon", NEXT_PUBLIC_EDU_MAP_PROFILE: "gangwon" },
        });
      } catch (error) {
        failure = error as { status?: number; stderr?: Buffer };
      }
      expect(failure?.status, `${script} should exit with the legacy-writer guard`).toBe(1);
      expect(failure?.stderr?.toString("utf8")).toMatch(/Gangwon|강원|전북 원본·중간자료/);
    }
    expect(publicDataHashes()).toEqual(before);
  }, 30_000);
});

describe("transformRegions", () => {
  it("dissolves 완산구/덕진구 into 전주시 (52110) and keeps 군산시 (52130), excluding 충남", async () => {
    const fc = await transformRegions(JSON.stringify(fixture()));

    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features).toHaveLength(2);

    const byCode = new Map(fc.features.map((f) => [f.properties.code, f]));
    expect(new Set(byCode.keys())).toEqual(new Set(["52110", "52130"]));

    const jeonju = byCode.get("52110")!;
    expect(jeonju.properties.name).toBe("전주시");
    const gunsan = byCode.get("52130")!;
    expect(gunsan.properties.name).toBe("군산시");
  });

  it("gives every feature a code/name/bbox/labelPoint, with labelPoint inside bbox", async () => {
    const fc = await transformRegions(JSON.stringify(fixture()));

    for (const f of fc.features) {
      const { code, name, bbox, labelPoint } = f.properties;
      expect(typeof code).toBe("string");
      expect(typeof name).toBe("string");
      expect(bbox).toHaveLength(4);
      expect(labelPoint).toHaveLength(2);

      const [minLng, minLat, maxLng, maxLat] = bbox;
      const [lng, lat] = labelPoint;
      expect(lng).toBeGreaterThanOrEqual(minLng);
      expect(lng).toBeLessThanOrEqual(maxLng);
      expect(lat).toBeGreaterThanOrEqual(minLat);
      expect(lat).toBeLessThanOrEqual(maxLat);
    }
  });

  // Task 6, Section C.2 / Task B fix round 1 — data/manual/label-offsets.json's
  // per-code pixel nudge is baked into `labelPoint` itself (geographically),
  // instead of being emitted as a separate `properties.labelOffset` for a
  // render-time `getPixelOffset` (see `labelOffsetToLngLat`'s own doc
  // comment in build-regions.ts for the full root-cause: that used to break
  // CollisionFilterExtension's visibility sampling for 전주시/익산시).
  // `main()` is the only thing that reads the manual file from disk (IO
  // stays out of this pure function, matching the module's existing IO/pure
  // split) — it passes the parsed map in as an argument.
  describe("label anchor nudge from labelOffsets (Task 6, Section C.2 / Task B fix round 1)", () => {
    it("shifts a region's labelPoint by the given labelOffsets map, keyed by code", async () => {
      const base = await transformRegions(JSON.stringify(fixture()));
      const withOffset = await transformRegions(JSON.stringify(fixture()), {
        labelOffsets: { "52110": [0, -12], "52130": [5, 0] },
      });

      const baseByCode = new Map(base.features.map((f) => [f.properties.code, f.properties.labelPoint]));
      const nudgedByCode = new Map(withOffset.features.map((f) => [f.properties.code, f.properties.labelPoint]));

      // Both nudged regions actually moved from their un-nudged labelPoint.
      expect(nudgedByCode.get("52110")).not.toEqual(baseByCode.get("52110"));
      expect(nudgedByCode.get("52130")).not.toEqual(baseByCode.get("52130"));
    });

    // Coordinator's fix-round-1 acceptance example: [16, 0] (16px east) must
    // shift labelPoint.lng east by ~4000m worth of degrees (16px *
    // LABEL_OFFSET_METERS_PER_PX). ~0.0443 degrees = 4000m / (111,320 m/deg *
    // cos(35.7 deg)) — see labelOffsetToLngLat's own direct test below for
    // the exact figure; this just confirms `transformRegions` actually
    // applies it to a real labelPoint, not just the pure helper in isolation.
    it("[16, 0] shifts labelPoint.lng east by ≈4000m worth of degrees (dx * LABEL_OFFSET_METERS_PER_PX)", async () => {
      const base = await transformRegions(JSON.stringify(fixture()));
      const withOffset = await transformRegions(JSON.stringify(fixture()), {
        labelOffsets: { "52110": [16, 0] },
      });
      const baseLng = base.features.find((f) => f.properties.code === "52110")!.properties.labelPoint[0];
      const baseLat = base.features.find((f) => f.properties.code === "52110")!.properties.labelPoint[1];
      const nudged = withOffset.features.find((f) => f.properties.code === "52110")!.properties.labelPoint;

      const [expectedDLng] = labelOffsetToLngLat([16, 0]);
      expect(nudged[0] - baseLng).toBeCloseTo(expectedDLng, 4);
      expect(expectedDLng).toBeGreaterThan(0.04); // ≈4000m worth of degrees at this latitude
      expect(expectedDLng).toBeLessThan(0.05);
      expect(nudged[1]).toBeCloseTo(baseLat, 5); // dy=0 -> no north/south shift
    });

    it("leaves an unlisted region's labelPoint unchanged", async () => {
      const base = await transformRegions(JSON.stringify(fixture()));
      const withOffset = await transformRegions(JSON.stringify(fixture()), {
        labelOffsets: { "52110": [0, -12] }, // 52130 deliberately omitted
      });
      const gunsanBase = base.features.find((f) => f.properties.code === "52130")!;
      const gunsanNudged = withOffset.features.find((f) => f.properties.code === "52130")!;
      expect(gunsanNudged.properties.labelPoint).toEqual(gunsanBase.properties.labelPoint);
    });

    it("leaves every region's labelPoint unchanged when no labelOffsets map is given at all", async () => {
      const base = await transformRegions(JSON.stringify(fixture()));
      const withDefault = await transformRegions(JSON.stringify(fixture()), {});
      expect(withDefault.features.map((f) => f.properties.labelPoint)).toEqual(
        base.features.map((f) => f.properties.labelPoint),
      );
    });

    it("no longer emits a labelOffset property at all", async () => {
      const fc = await transformRegions(JSON.stringify(fixture()), {
        labelOffsets: { "52110": [0, -12] },
      });
      for (const f of fc.features) {
        expect(f.properties).not.toHaveProperty("labelOffset");
      }
    });
  });

  describe("labelOffsetToLngLat (pure px->degrees conversion)", () => {
    it("[16, 0] (16px east) converts to ≈4000m worth of eastward degrees at the reference latitude", () => {
      const [dLng, dLat] = labelOffsetToLngLat([16, 0]);
      // 16 * 250m = 4000m east; 1° longitude ≈ 111,320m * cos(35.7°) ≈ 90,246m
      // at the pipeline's fixed reference latitude -> ≈0.0443°.
      expect(dLng).toBeCloseTo((16 * LABEL_OFFSET_METERS_PER_PX) / (111_320 * Math.cos((35.7 * Math.PI) / 180)), 8);
      expect(dLng).toBeGreaterThan(0.044);
      expect(dLng).toBeLessThan(0.045);
      expect(dLat).toBe(0);
    });

    it("negative dy (screen-up) shifts NORTH (positive dLat); positive dy (screen-down) shifts SOUTH (negative dLat)", () => {
      const [, dLatUp] = labelOffsetToLngLat([0, -16]);
      const [, dLatDown] = labelOffsetToLngLat([0, 16]);
      expect(dLatUp).toBeGreaterThan(0);
      expect(dLatDown).toBeLessThan(0);
      expect(dLatUp).toBeCloseTo(-dLatDown, 10); // symmetric around 0
    });

    it("[0, 0] is a no-op", () => {
      expect(labelOffsetToLngLat([0, 0])).toEqual([0, 0]);
    });
  });

  it("merges the two 전주시 gu rectangles into a bbox spanning both", async () => {
    const fc = await transformRegions(JSON.stringify(fixture()));
    const jeonju = fc.features.find((f) => f.properties.code === "52110")!;
    const [minLng, minLat, maxLng, maxLat] = jeonju.properties.bbox;
    // Union of [127.1,35.78,127.15,35.83] and [127.15,35.78,127.2,35.83]
    expect(minLng).toBeCloseTo(127.1, 4);
    expect(maxLng).toBeCloseTo(127.2, 4);
    expect(minLat).toBeCloseTo(35.78, 4);
    expect(maxLat).toBeCloseTo(35.83, 4);
  });

  describe("작은 섬 제거 (추가 요구 #3)", () => {
    // Two detached rectangles, both sgg=52130 (군산시), physically separate
    // from the mainland 군산시 rectangle and from each other:
    //  - tinyIslet: ~0.003° square (~0.09km² at this latitude) — below the
    //    default 1km² threshold, must be dropped.
    //  - bigIslet: ~0.02° square (~4km² at this latitude) — well above the
    //    threshold, must survive (stands in for a real, meaningfully-sized
    //    island like 위도/선유도, which the brief requires stay on the map).
    function fixtureWithIslands(): FeatureCollection<Polygon, SourceProps> {
      const base = fixture();
      const gunsanProps: SourceProps = {
        adm_nm: "전북특별자치도 군산시 미세섬",
        adm_cd: "52130999",
        adm_cd2: "5213099999",
        sgg: "52130",
        sggnm: "군산시",
        sido: "52",
        sidonm: "전북특별자치도",
      };
      return {
        type: "FeatureCollection",
        features: [
          ...base.features,
          rect([126.5, 36.05, 126.503, 36.053], { ...gunsanProps, adm_nm: "전북특별자치도 군산시 미세섬(작음)" }),
          rect([126.4, 36.1, 126.42, 36.12], { ...gunsanProps, adm_nm: "전북특별자치도 군산시 미세섬(큼)" }),
        ],
      };
    }

    it("drops a sub-1km² detached island but keeps a larger (~4km²) one", async () => {
      // simplifyPercent: 100 (effectively a no-op simplify) isolates
      // -filter-islands' own area threshold from an unrelated confound:
      // mapshaper's percentage-based -simplify, at the default 5%, computes
      // its point-retention budget across the whole shared arc pool, and for
      // this fixture's plain 4-corner rectangles (a handful of points each,
      // unlike a real many-point coastline) that budget can round down to 0
      // surviving points for the *smaller* rectangles regardless of
      // -filter-islands — confirmed empirically while writing this test: at
      // the real pipeline's default 5%, simplify alone (with no island
      // filter at all) already collapsed both the ~0.09km² AND the ~4km²
      // synthetic islet down to nothing, before -filter-islands even ran.
      // The real admdongkor source's actual islands have hundreds of
      // coastline points each, so they don't hit this same-count-of-points
      // edge case (see the "npm run data:regions" real-data results in
      // task-2-report.md: real ~1.6-6.6km² 고군산군도 islands and the
      // ~11.65km² 위도 all survive at the pipeline's real 5% setting).
      const fc = await transformRegions(JSON.stringify(fixtureWithIslands()), { simplifyPercent: 100 });
      const gunsan = fc.features.find((f) => f.properties.code === "52130")!;

      // Exactly 2 parts survive: the mainland rectangle + the ~4km² islet.
      // A single remaining island (beyond the mainland) still serializes as
      // a MultiPolygon with 2 parts, not a bare Polygon.
      expect(gunsan.geometry.type).toBe("MultiPolygon");
      if (gunsan.geometry.type === "MultiPolygon") {
        expect(gunsan.geometry.coordinates).toHaveLength(2);
      }

      // The tiny islet's own corner point must not appear anywhere in the
      // output geometry.
      const text = JSON.stringify(gunsan.geometry);
      expect(text).not.toContain("126.5,36.05");
    });

    it("keeps all 14 시군 codes (island filtering never drops a whole region)", async () => {
      const fc = await transformRegions(JSON.stringify(fixtureWithIslands()));
      // The base fixture only has 전주시/군산시 in-province; island filtering
      // must not remove either of those two features themselves.
      expect(new Set(fc.features.map((f) => f.properties.code))).toEqual(new Set(["52110", "52130"]));
    });
  });
});

describe("transformNeighbors", () => {
  it("keeps only the 충남 feature, with {code, name} properties", async () => {
    const fc = await transformNeighbors(JSON.stringify(fixture()));

    expect(fc.features).toHaveLength(1);
    const [feature] = fc.features;
    expect(feature.properties.code).toBe("44");
    expect(feature.properties.name).toBe("충청남도");
  });
});

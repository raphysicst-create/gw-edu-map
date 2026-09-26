import { describe, expect, it, vi } from "vitest";
import type { Feature, FeatureCollection, Polygon } from "geojson";

import { emdNameOf, transformEmd } from "../../scripts/pipeline/build-emd";

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

// Mirrors tests/pipeline/build-regions.test.ts's fixture shape/conventions
// (same SourceProps, same rect() helper), extended per the task brief:
// 시도 52 의 두 시군(전주시 merged from 완산/덕진구 + 군산시) + a THIRD
// in-province 시군 (완주군) placed FIRST in feature order — deliberately out
// of REGION_CODES' numeric order, so the "sorted keys" test actually proves
// the output Map is sorted rather than just mirroring input order — + one
// sido=11 (서울) feature that must be dropped entirely.
//
// The 완산구/덕진구 adm_nm strings use the REAL admdongkor spacing confirmed
// against data/raw/admdongkor-ver20260701.geojson (see task-E-report.md):
// "시+구" is concatenated with NO space ("전주시완산구"), not
// "전주시 완산구" as tests/pipeline/build-regions.test.ts's OWN fixture
// (written before this was verified) happens to use — emdNameOf's
// last-whitespace-token rule is robust to either spacing, but this fixture
// exercises the real one.
function fixture(): FeatureCollection<Polygon, SourceProps> {
  return {
    type: "FeatureCollection",
    features: [
      rect([127.3, 35.8, 127.35, 35.85], {
        adm_nm: "전북특별자치도 완주군 이서면",
        adm_cd: "35015250",
        adm_cd2: "5271025000",
        sgg: "52710",
        sggnm: "완주군",
        sido: "52",
        sidonm: "전북특별자치도",
      }),
      // High-precision coordinate (9 decimal digits) — proves the pipeline
      // actually ROUNDS to precision=0.00001, not just that the fixture
      // happened to already be short (build-regions.test.ts's own fixture
      // never exercises this, since every one of its coordinates is already
      // ≤ 5 decimals).
      rect([127.123456789, 35.78, 127.15, 35.83], {
        adm_nm: "전북특별자치도 전주시완산구 중화산1동",
        adm_cd: "35011620",
        adm_cd2: "5211167100",
        sgg: "52111",
        sggnm: "전주시완산구",
        sido: "52",
        sidonm: "전북특별자치도",
      }),
      rect([127.15, 35.78, 127.2, 35.83], {
        adm_nm: "전북특별자치도 전주시덕진구 금암1동",
        adm_cd: "35011720",
        adm_cd2: "5211310100",
        sgg: "52113",
        sggnm: "전주시덕진구",
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
      rect([127.0, 37.5, 127.1, 37.6], {
        adm_nm: "서울특별시 종로구 청운동",
        adm_cd: "11010530",
        adm_cd2: "1111051500",
        sgg: "11010",
        sggnm: "종로구",
        sido: "11",
        sidonm: "서울특별시",
      }),
    ],
  };
}

describe("transformEmd", () => {
  it("(a) keeps only sido === '52' — the sido=11 (서울) feature is dropped entirely", async () => {
    const result = await transformEmd(JSON.stringify(fixture()));
    expect(new Set(result.keys())).toEqual(new Set(["52110", "52130", "52710"]));
  });

  it("(b) merges 전주시 완산구/덕진구 읍면동 into ONE 52110 group, preserving BOTH 읍면동 features (not dissolved into one polygon)", async () => {
    const result = await transformEmd(JSON.stringify(fixture()));
    const jeonju = result.get("52110");
    expect(jeonju).toBeDefined();
    expect(jeonju!.features).toHaveLength(2);
    const names = jeonju!.features.map((f) => f.properties.name).sort();
    expect(names).toEqual(["금암1동", "중화산1동"]);
    // Every feature stays its own Polygon/MultiPolygon — merging is a JS-side
    // grouping key, never a mapshaper -dissolve.
    for (const f of jeonju!.features) {
      expect(["Polygon", "MultiPolygon"]).toContain(f.geometry.type);
    }
  });

  it("keeps 군산시/완주군 as their own single-feature groups, un-merged", async () => {
    const result = await transformEmd(JSON.stringify(fixture()));
    expect(result.get("52130")!.features).toHaveLength(1);
    expect(result.get("52130")!.features[0].properties.name).toBe("나운동");
    expect(result.get("52710")!.features).toHaveLength(1);
    expect(result.get("52710")!.features[0].properties.name).toBe("이서면");
  });

  it("(c) every feature's properties are exactly {code, name} — no leftover raw fields", async () => {
    const result = await transformEmd(JSON.stringify(fixture()));
    for (const fc of result.values()) {
      for (const f of fc.features) {
        expect(Object.keys(f.properties).sort()).toEqual(["code", "name"]);
        expect(typeof f.properties.code).toBe("string");
        expect(typeof f.properties.name).toBe("string");
      }
    }
  });

  it("code is the 읍면동's own adm_cd (not the merged sgg_cd, not adm_cd2)", async () => {
    const result = await transformEmd(JSON.stringify(fixture()));
    const jeonju = result.get("52110")!;
    const codes = jeonju.features.map((f) => f.properties.code).sort();
    expect(codes).toEqual(["35011620", "35011720"]);
  });

  it("(d) rounds coordinates to ≤ 1e-5 precision even when the raw input had more decimal digits", async () => {
    const result = await transformEmd(JSON.stringify(fixture()));
    let sawAnyCoordinate = false;
    for (const fc of result.values()) {
      for (const f of fc.features) {
        const text = JSON.stringify(f.geometry);
        expect(text).not.toMatch(/\.\d{6,}/); // no coordinate prints > 5 fractional digits
        if (text.includes(".")) sawAnyCoordinate = true;
      }
    }
    expect(sawAnyCoordinate).toBe(true); // sanity: the assertion above wasn't vacuous
  });

  it("(e) the returned Map's keys are in ascending REGION_CODES order, independent of input feature order (완주군 is first in the fixture but last here)", async () => {
    const result = await transformEmd(JSON.stringify(fixture()));
    const keys = [...result.keys()];
    expect(keys).toEqual(["52110", "52130", "52710"]);
    expect(keys).toEqual([...keys].sort());
  });

  it("throws if a dissolved-merge produces a code outside the 14 known REGION_CODES (pipeline bug guard, mirrors transformRegions)", async () => {
    const bad: FeatureCollection<Polygon, SourceProps> = {
      type: "FeatureCollection",
      features: [
        rect([127.0, 35.8, 127.1, 35.9], {
          adm_nm: "전북특별자치도 없는시 없는동",
          adm_cd: "99999999",
          adm_cd2: "9999999999",
          sgg: "52999", // not one of the 14 REGION_CODES, and not a 5211* gu
          sggnm: "없는시",
          sido: "52",
          sidonm: "전북특별자치도",
        }),
      ],
    };
    await expect(transformEmd(JSON.stringify(bad))).rejects.toThrow(/52999/);
  });
});

describe("emdNameOf", () => {
  it("returns the last whitespace-separated token of a full adm_nm, regardless of 시+구 spacing", () => {
    expect(emdNameOf("전북특별자치도 전주시완산구 중화산1동")).toBe("중화산1동"); // real admdongkor spacing (concatenated 시+구)
    expect(emdNameOf("전북특별자치도 전주시 완산구 중앙동")).toBe("중앙동"); // hypothetical spaced variant
    expect(emdNameOf("전북특별자치도 군산시 나운동")).toBe("나운동");
  });

  it("handles a single-token name defensively (returns it unchanged)", () => {
    expect(emdNameOf("동")).toBe("동");
  });
});

import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pointInPolygon } from "../../scripts/pipeline/lib/point-in-polygon";
import { buildGangwonSpatialLayersFromZip } from "../../scripts/pipeline/gangwon/spatial";
import { REGION_CODES } from "../../src/lib/geo/regions";

// The licensed source ZIP is ignored by Git. Run explicitly after fetching it:
// GANGWON_SPATIAL_INTEGRATION=1 npm test -- tests/pipeline/gangwon-spatial-integration.test.ts
const runWithOfficialSource = process.env.GANGWON_SPATIAL_INTEGRATION === "1" ? describe : describe.skip;

runWithOfficialSource("공식 SGIS 경계 실제 원본 변환", () => {
  it("18개 시군, 인접 3개 시도, 193개 행정동을 생성하고 라벨을 내부에 둔다", async () => {
    const layers = await buildGangwonSpatialLayersFromZip("data/raw/gangwon/research-spatial/sgis-administrative-boundaries-2025.zip");
    expect(layers.regions.features.map((feature) => feature.properties.code)).toEqual(REGION_CODES);
    expect(layers.neighbors.features.map((feature) => feature.properties.code)).toEqual(["41", "43", "47"]);
    expect([...layers.emdByRegion.keys()]).toEqual(REGION_CODES);
    expect([...layers.emdByRegion.values()].reduce((count, collection) => count + collection.features.length, 0)).toBe(193);

    for (const feature of layers.regions.features) {
      const { bbox, labelPoint } = feature.properties;
      expect(labelPoint[0]).toBeGreaterThanOrEqual(bbox[0]);
      expect(labelPoint[0]).toBeLessThanOrEqual(bbox[2]);
      expect(labelPoint[1]).toBeGreaterThanOrEqual(bbox[1]);
      expect(labelPoint[1]).toBeLessThanOrEqual(bbox[3]);
      expect(pointInPolygon(labelPoint, feature.geometry), feature.properties.name).toBe(true);
      expect(bbox[0]).toBeGreaterThan(124);
      expect(bbox[2]).toBeLessThan(132);
      expect(bbox[1]).toBeGreaterThan(33);
      expect(bbox[3]).toBeLessThan(39);
    }
    for (const collection of layers.emdByRegion.values()) expect(collection.features.length).toBeGreaterThan(0);
  }, 180_000);
});

describe("공식 SGIS ZIP 무결성", () => {
  it("등록된 원본과 다른 ZIP은 추출 전에 거부한다", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "gangwon-sgis-test-"));
    try {
      const tampered = path.join(directory, "tampered.zip");
      await writeFile(tampered, "not the registered official archive");
      await expect(buildGangwonSpatialLayersFromZip(tampered)).rejects.toThrow("SHA-256 mismatch");
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});

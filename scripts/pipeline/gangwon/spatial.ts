/**
 * Converts the national 2025-Q2 SGIS administrative SHP release to the map's
 * existing GeoJSON contracts. Inputs are the sidecars extracted from the
 * official ZIP recorded in data/sources/gangwon/spatial-sources.json.
 *
 * SGIS uses 32/32010/... for Gangwon. The application's 51/51110/... keys
 * are the distinct 2026 legal-dong code system. The explicit, dated mapping
 * lives in data/manual/gangwon/region-crosswalk.json.
 *
 * This module only returns data. The caller must apply the source release
 * gate before putting any result in public/data.
 */
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdtemp, readdir, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import mapshaper from "mapshaper";

import crosswalk from "../../../data/manual/gangwon/region-crosswalk.json";
import spatialSources from "../../../data/sources/gangwon/spatial-sources.json";
import type { Bbox, RegionFeature } from "../../../src/lib/geo/geo";

type Area = Polygon | MultiPolygon;
type RawFeature = Feature<Area, Record<string, unknown>>;
type RawCollection = FeatureCollection<Area, Record<string, unknown>>;
type SimpleFeature = Feature<Area, { code: string; name: string }>;
type SimpleCollection = FeatureCollection<Area, SimpleFeature["properties"]>;

export type GangwonSpatialLayers = {
  regions: FeatureCollection<Area, RegionFeature["properties"]>;
  neighbors: SimpleCollection;
  emdByRegion: Map<string, SimpleCollection>;
};

export type ShapefileSidecars = {
  shp: Buffer;
  dbf: Buffer;
  prj: string;
  cpg: string;
};

export type SpatialInputs = {
  sido: ShapefileSidecars;
  sigungu: ShapefileSidecars;
  dong: ShapefileSidecars;
};

const BASENAMES = {
  sido: "bnd_sido_00_2025_2Q",
  sigungu: "bnd_sigungu_00_2025_2Q",
  dong: "bnd_dong_00_2025_2Q",
} as const;
const SOURCE_DATE = "20250630";
const OFFICIAL_ZIP_SHA256 = spatialSources.sources.find(
  (source) => source.sourceId === "mods-sgis-administrative-boundaries-2025q2",
)?.sha256;
const execFileAsync = promisify(execFile);
const SGG_BY_SGIS = new Map(crosswalk.regions.map((row) => [row.sgisCode, row]));
const SIDO_BY_SGIS = new Map(crosswalk.neighborSidoCodes.map((row) => [row.sgisCode, row]));

function property(feature: RawFeature, field: string): string {
  const value = feature.properties[field];
  if (value === undefined || value === null || value === "") {
    throw new Error(`SGIS ${field} is missing`);
  }
  return String(value);
}

function assertSourceDate(feature: RawFeature): void {
  const date = property(feature, "BASE_DATE");
  if (date !== SOURCE_DATE) {
    throw new Error(`Unexpected SGIS boundary date ${date}; expected ${SOURCE_DATE}`);
  }
}

function round5(value: number): number {
  return Math.round(value * 1e5) / 1e5;
}

function assertWgs84(feature: RawFeature): void {
  const bounds = feature.properties.bbox;
  if (!Array.isArray(bounds) || bounds.length !== 4 ||
      !bounds.every((value) => typeof value === "number" && Number.isFinite(value)) ||
      bounds[0] < 124 || bounds[2] > 132 || bounds[1] < 33 || bounds[3] > 39) {
    throw new Error("SGIS projection did not produce Korean WGS84 longitude/latitude bounds");
  }
}

/** Reads the five sidecars of one layer, previously extracted from the official ZIP. */
export async function readShapefileSidecars(
  directory: string,
  layer: keyof typeof BASENAMES,
): Promise<ShapefileSidecars> {
  const base = path.join(directory, BASENAMES[layer]);
  const [shp, dbf, prj, cpg] = await Promise.all([
    readFile(`${base}.shp`),
    readFile(`${base}.dbf`),
    readFile(`${base}.prj`, "utf8"),
    readFile(`${base}.cpg`, "utf8"),
  ]);
  if (!prj.includes("Korea_2000_Korea_Unified_Coordinate_System") || cpg.trim() !== "UTF-8") {
    throw new Error(`Unexpected CRS or text encoding in SGIS ${layer} sidecars`);
  }
  return { shp, dbf, prj, cpg };
}

async function projectLayer(
  sidecars: ShapefileSidecars,
  field: string,
  prefix: string,
  simplifyPercent: number,
  withBounds = false,
): Promise<RawCollection> {
  const input = {
    "input.shp": sidecars.shp,
    "input.dbf": sidecars.dbf,
    "input.prj": sidecars.prj,
    "input.cpg": sidecars.cpg,
  };
  const commands = [
    "-i input.shp encoding=utf8",
    `-filter "String(${field}).slice(0, ${prefix.length}) === '${prefix}'"`,
    `-simplify ${simplifyPercent}% keep-shapes`,
    "-proj wgs84",
    ...(withBounds ? ['-each "bbox=this.bounds, labelPoint=[this.innerX,this.innerY]"'] : []),
    "-o output.geojson format=geojson precision=0.00001",
  ].join(" ");
  const output = await mapshaper.applyCommands(commands, input);
  const geojson = output["output.geojson"];
  if (!geojson) throw new Error("mapshaper did not return output.geojson");
  return JSON.parse(geojson) as RawCollection;
}

/** 18 source 시군구 polygons, keyed by the application's five-digit codes. */
export async function transformGangwonRegions(
  sidecars: ShapefileSidecars,
): Promise<GangwonSpatialLayers["regions"]> {
  const source = await projectLayer(sidecars, "SIGUNGU_CD", crosswalk.sourceSidoCode, 5, true);
  const byCode = new Map<string, RegionFeature>();
  for (const feature of source.features) {
    assertSourceDate(feature);
    assertWgs84(feature);
    const sgisCode = property(feature, "SIGUNGU_CD");
    const row = SGG_BY_SGIS.get(sgisCode);
    if (!row || property(feature, "SIGUNGU_NM") !== row.name || byCode.has(row.internalCode)) {
      throw new Error(`Unmapped, renamed, or duplicated SGIS 시군구 ${sgisCode}`);
    }
    const rawBounds = feature.properties.bbox as number[];
    const rawPoint = feature.properties.labelPoint as number[];
    if (!Array.isArray(rawPoint) || rawPoint.length !== 2 ||
        !rawPoint.every((value) => typeof value === "number" && Number.isFinite(value))) {
      throw new Error(`Missing SGIS label point for ${sgisCode}`);
    }
    byCode.set(row.internalCode, {
      type: "Feature",
      geometry: feature.geometry,
      properties: {
        code: row.internalCode,
        name: row.name,
        bbox: rawBounds.map(round5) as Bbox,
        labelPoint: [round5(rawPoint[0]), round5(rawPoint[1])],
      },
    });
  }
  if (byCode.size !== crosswalk.regions.length) {
    throw new Error(`Expected ${crosswalk.regions.length} Gangwon 시군구; found ${byCode.size}`);
  }
  return {
    type: "FeatureCollection",
    features: crosswalk.regions.map((row) => byCode.get(row.internalCode)!),
  };
}

/** Gyeonggi, Chungbuk, and Gyeongbuk silhouettes surrounding Gangwon. */
export async function transformGangwonNeighbors(
  sidecars: ShapefileSidecars,
): Promise<GangwonSpatialLayers["neighbors"]> {
  const prefixes = crosswalk.neighborSidoCodes.map((row) => row.sgisCode);
  const source = await projectLayer(sidecars, "SIDO_CD", "", 2);
  const byCode = new Map<string, SimpleFeature>();
  for (const feature of source.features) {
    assertSourceDate(feature);
    const code = property(feature, "SIDO_CD");
    if (!prefixes.includes(code)) continue;
    const row = SIDO_BY_SGIS.get(code)!;
    if (property(feature, "SIDO_NM") !== row.name || byCode.has(row.internalCode)) {
      throw new Error(`Renamed or duplicated SGIS neighbor ${code}`);
    }
    byCode.set(row.internalCode, {
      type: "Feature",
      geometry: feature.geometry,
      properties: { code: row.internalCode, name: row.name },
    });
  }
  if (byCode.size !== prefixes.length) {
    throw new Error(`Expected ${prefixes.length} neighboring 시도; found ${byCode.size}`);
  }
  return {
    type: "FeatureCollection",
    features: crosswalk.neighborSidoCodes.map((row) => byCode.get(row.internalCode)!),
  };
}

/** Keeps all 193 행정동 features and groups them under their mapped 시군구. */
export async function transformGangwonEmd(
  sidecars: ShapefileSidecars,
): Promise<GangwonSpatialLayers["emdByRegion"]> {
  const source = await projectLayer(sidecars, "ADM_CD", crosswalk.sourceSidoCode, 10);
  const buckets = new Map<string, SimpleFeature[]>(
    crosswalk.regions.map((row) => [row.internalCode, []]),
  );
  const seen = new Set<string>();
  for (const feature of source.features) {
    assertSourceDate(feature);
    const admCode = property(feature, "ADM_CD");
    const row = SGG_BY_SGIS.get(admCode.slice(0, 5));
    if (!row || seen.has(admCode)) {
      throw new Error(`Unmapped or duplicated SGIS 행정동 ${admCode}`);
    }
    seen.add(admCode);
    buckets.get(row.internalCode)!.push({
      type: "Feature",
      geometry: feature.geometry,
      properties: { code: admCode, name: property(feature, "ADM_NM") },
    });
  }
  if (seen.size !== 193 || [...buckets.values()].some((features) => features.length === 0)) {
    throw new Error(`Expected 193 SGIS 행정동 across all 18 시군구; found ${seen.size}`);
  }
  return new Map([...buckets].map(([code, features]) => [code, {
    type: "FeatureCollection" as const,
    features: features.sort((a, b) => a.properties.code.localeCompare(b.properties.code)),
  }]));
}

/** Accepts three already-extracted official layers; performs no public writes. */
export async function buildGangwonSpatialLayers(inputs: SpatialInputs): Promise<GangwonSpatialLayers> {
  // Sequential processing caps memory use when the national SHP files are large.
  const regions = await transformGangwonRegions(inputs.sigungu);
  const neighbors = await transformGangwonNeighbors(inputs.sido);
  const emdByRegion = await transformGangwonEmd(inputs.dong);
  return { regions, neighbors, emdByRegion };
}

/** Convenience loader for the official ZIP's extracted SHP/DBF/PRJ/CPG files. */
export async function buildGangwonSpatialLayersFromDirectory(directory: string): Promise<GangwonSpatialLayers> {
  const regions = await transformGangwonRegions(await readShapefileSidecars(directory, "sigungu"));
  const neighbors = await transformGangwonNeighbors(await readShapefileSidecars(directory, "sido"));
  const emdByRegion = await transformGangwonEmd(await readShapefileSidecars(directory, "dong"));
  return { regions, neighbors, emdByRegion };
}

async function findLayerDirectory(root: string, layer: keyof typeof BASENAMES): Promise<string> {
  const target = `${BASENAMES[layer]}.shp`;
  const pending = [root];
  const matches: string[] = [];
  while (pending.length) {
    const directory = pending.pop()!;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) pending.push(path.join(directory, entry.name));
      else if (entry.isFile() && entry.name === target) matches.push(directory);
    }
  }
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one ${target} in official SGIS ZIP; found ${matches.length}`);
  }
  return matches[0];
}

/**
 * Reproduces the layers directly from the registered original ZIP. The hash is
 * checked before extraction so edited sidecars in a working directory cannot
 * enter the release build. Only the OS temporary directory is created/removed.
 */
export async function buildGangwonSpatialLayersFromZip(zipPath: string): Promise<GangwonSpatialLayers> {
  if (!OFFICIAL_ZIP_SHA256) throw new Error("Official SGIS ZIP hash is not registered");
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(zipPath)) hash.update(chunk);
  const actual = hash.digest("hex");
  if (actual !== OFFICIAL_ZIP_SHA256) {
    throw new Error(`SGIS boundary ZIP SHA-256 mismatch: ${actual}`);
  }

  const temporaryRoot = await realpath(tmpdir());
  const extracted = await mkdtemp(path.join(temporaryRoot, "gw-edu-spatial-"));
  try {
    // Windows tar.exe and POSIX tar both support ZIP via libarchive.
    await execFileAsync("tar", ["-xf", path.resolve(zipPath), "-C", extracted], {
      maxBuffer: 1024 * 1024,
    });
    // The official archive nests the three SHP sets under Korean-named folders.
    const regions = await transformGangwonRegions(await readShapefileSidecars(
      await findLayerDirectory(extracted, "sigungu"), "sigungu"));
    const neighbors = await transformGangwonNeighbors(await readShapefileSidecars(
      await findLayerDirectory(extracted, "sido"), "sido"));
    const emdByRegion = await transformGangwonEmd(await readShapefileSidecars(
      await findLayerDirectory(extracted, "dong"), "dong"));
    return { regions, neighbors, emdByRegion };
  } finally {
    const resolved = await realpath(extracted);
    if (path.dirname(resolved).toLowerCase() !== temporaryRoot.toLowerCase() ||
        !path.basename(resolved).startsWith("gw-edu-spatial-")) {
      throw new Error("Refusing to remove an unexpected extraction directory");
    }
    await rm(resolved, { recursive: true, force: true });
  }
}

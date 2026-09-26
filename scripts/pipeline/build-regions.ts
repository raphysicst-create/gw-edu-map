// Builds public/data/regions.geojson (14 전북 시군 polygons) and
// public/data/neighbors.geojson (flat silhouettes of the 4 bordering 시도)
// from vuski/admdongkor's 읍면동 (eupmyeondong)-level national boundary file.
//
// IO and the pure geometry transforms are deliberately split (per the task
// brief): `transformRegions`/`transformNeighbors` take GeoJSON text in and
// return a FeatureCollection, with no filesystem/network access, so tests
// can exercise them directly against small fixtures. `main()` is the only
// function that touches disk or the network.
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import mapshaper from "mapshaper";

import { isRegionCode, REGION_CODES, regionName } from "../../src/lib/geo/regions";
import { ACTIVE_PROFILE } from "../../src/lib/profiles";
import type { Bbox, RegionFeature } from "../../src/lib/geo/geo";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

export const SOURCE_URL =
  "https://raw.githubusercontent.com/vuski/admdongkor/master/ver20260701/HangJeongDong_ver20260701.geojson";
// Exported — Task E's build-emd.ts reads the SAME raw national file (it
// needs the finer 읍면동 granularity this file dissolves away) and must
// never drift to a second copy of this path.
export const RAW_PATH = path.join(ROOT, "data/raw/admdongkor-ver20260701.geojson");
const REGIONS_OUTPUT_PATH = path.join(ROOT, "public/data/regions.geojson");
const NEIGHBORS_OUTPUT_PATH = path.join(ROOT, "public/data/neighbors.geojson");
// Task 6, Section C.2 — 라벨 겹침 완화: manual per-region pixel nudges,
// hand-tuned by screenshot comparison (see task-6-report.md). Optional —
// missing entirely, or missing a given code, both just mean "[0, 0]" (see
// transformRegions's own default).
const LABEL_OFFSETS_PATH = path.join(ROOT, ACTIVE_PROFILE.files.manualDir, "label-offsets.json");

const REGIONS_MAX_BYTES = 300 * 1024;
const NEIGHBORS_MAX_BYTES = 200 * 1024;

// admdongkor's 2-digit `sido` code for 전북특별자치도. Not to be confused
// with `PROVINCE_CODE` ('52000') in src/lib/geo/regions.ts, which is the
// 5-digit "전북 전체" aggregate row code used by the indicators pipeline.
// Exported — build-emd.ts filters to the exact same sido, and must never
// hardcode a second copy of "52".
export const JB_SIDO = ACTIVE_PROFILE.boundary.sidoCode;

// Confirmed by inspecting the real source file's distinct `sido`/`sidonm`
// pairs (see task-1A-report.md): the 2026-07-01 광주+전남 통합 entity is
// sido '12' ("전남광주통합특별시"), sitting alongside 충남(44)/경북(47)/경남(48).
const NEIGHBOR_SIDO_CODES = ACTIVE_PROFILE.boundary.neighborSidoCodes;

type RawRegionProps = {
  sgg_cd: string;
  bbox: Bbox;
  labelPoint: [number, number];
};

type RawNeighborProps = {
  sido: string;
  sidonm: string;
};

export type NeighborFeatureCollection = FeatureCollection<
  Polygon | MultiPolygon,
  { code: string; name: string }
>;

function round5(nums: readonly number[]): number[] {
  return nums.map((n) => Math.round(n * 1e5) / 1e5);
}

// Exported — build-emd.ts's own mapshaper pipeline (읍면동-level, no
// -dissolve) reuses this exact IO wrapper rather than re-deriving the
// mapshaper.applyCommands/output.geojson-extraction dance.
export async function runMapshaper(
  commands: string[],
  inputGeojsonText: string,
): Promise<string> {
  const output = await mapshaper.applyCommands(commands.join(" "), {
    "input.geojson": inputGeojsonText,
  });
  const text = output["output.geojson"];
  if (text === undefined) {
    throw new Error("mapshaper did not produce output.geojson");
  }
  return text;
}

/** `{ [regionCode]: [dx, dy] }` pixel nudge — see data/manual/label-offsets.json. */
export type LabelOffsets = Record<string, [number, number]>;

// Task B, fix round 1 — `label-offsets.json`'s `[dx, dy]` used to be applied
// at RENDER time, as a screen-space `getPixelOffset` on the label TextLayer
// (labelLayer.ts). That broke CollisionFilterExtension: the extension's
// collision-visibility sample uses the label's raw `geometry.worldPosition`
// (i.e. `labelPoint`, unaffected by any pixel offset) — installed
// @deck.gl/extensions' shader-module.js re-projects that position
// independently of wherever `getPixelOffset` actually drew the text. A
// label whose text was pushed far enough from its own anchor (전주시/익산시,
// see task-B-report.md's root-cause trace) could sample "nothing of its
// own" at that anchor and fade to invisible, regardless of collision
// priority — not fixable by raising priority, since the failure is in
// SAMPLING, not in losing a priority contest.
//
// Fix: bake the same visual nudge into `labelPoint` itself, geographically,
// at BUILD time — so the collision sample and the drawn text are always the
// exact same point (labelLayer.ts no longer sets `getPixelOffset` at all).
//
// `LABEL_OFFSET_METERS_PER_PX`: 1 screen pixel ≈ 250m on the ground at the
// overview camera (zoom ≈8.77 — see camera.ts's `fitOverview`/
// `OVERVIEW_PITCH` and useCamera.ts's mount effect), the ONLY camera pose
// these manual nudge values were ever hand-tuned against (Task 6, Section
// C.2's screenshot comparison). Not exact at any other zoom/pitch — but
// neither was the old getPixelOffset (a fixed SCREEN-pixel value doesn't
// scale with zoom either); this preserves the same approximate visual
// intent, not a physically exact conversion.
export const LABEL_OFFSET_METERS_PER_PX = 250;
// 전북의 대략적 중심 위도. 경도 1도당 거리(≈111,320m × cos(lat))를 구하는 데만
// 쓰이는 참조값 — 4개 지역 전부에 공통 적용한다(각 지역의 실제 위도 차이는 이만한
// 작은 넛지 크기에서는 무시 가능한 오차).
const LABEL_OFFSET_REFERENCE_LATITUDE_DEG = 35.7;
const METERS_PER_DEGREE_LATITUDE = 111_320;

/**
 * Converts a `[dx, dy]` SCREEN-pixel nudge (dx: +east, dy: +down/south —
 * the same convention `label-offsets.json`/the old `getPixelOffset` used)
 * into a `[dLng, dLat]` GEOGRAPHIC offset in degrees, to add to a
 * `labelPoint`. Pure — no rounding (the caller rounds the final labelPoint,
 * matching this module's existing `round5` precision elsewhere).
 */
export function labelOffsetToLngLat([dxPx, dyPx]: readonly [number, number]): [number, number] {
  const eastMeters = dxPx * LABEL_OFFSET_METERS_PER_PX;
  const northMeters = -dyPx * LABEL_OFFSET_METERS_PER_PX; // dy positive = screen-down = south
  const metersPerDegreeLongitude =
    METERS_PER_DEGREE_LATITUDE * Math.cos((LABEL_OFFSET_REFERENCE_LATITUDE_DEG * Math.PI) / 180);
  // `+ 0` normalizes a `-0` result (e.g. dxPx/dyPx === 0, negated) to `0` —
  // mathematically identical (JSON.stringify(-0) is already "0", so this
  // never affects the real regions.geojson output either way) but keeps
  // `[0, 0]` a true no-op under strict equality (Object.is), which vitest's
  // toBe/toEqual use.
  return [eastMeters / metersPerDegreeLongitude + 0, northMeters / METERS_PER_DEGREE_LATITUDE + 0];
}

// sgg (5자리 시군구 표준코드) is authoritative here — confirmed against the
// real source that sgg === adm_cd2.slice(0,5), NOT adm_cd.slice(0,5) (adm_cd,
// the 8-digit 통계청 code, uses an unrelated internal sequence for its middle
// digits; see task-1A-report.md for the verification). Exported — build-emd.ts
// needs the identical per-feature `sgg_cd` seed (as a JS-side grouping key,
// not a mapshaper -dissolve target) so both pipelines agree on what "sgg_cd"
// means without a second, possibly-drifting copy of this mapshaper -each string.
export const SGG_CD_FROM_SGG_CMD = '-each "sgg_cd = sgg"';
// 전주시 완산구(52111)/덕진구(52113) → 52110 (single 전주시 region). Exported
// for the same reuse reason as SGG_CD_FROM_SGG_CMD above — build-emd.ts's
// 읍면동-level output groups by this SAME merged code (see its own
// transformEmd), so a 읍면동 feature from either gu lands in the one
// `public/data/emd/52110.geojson`.
const sggOverrideExpression = [
  ...Object.entries(ACTIVE_PROFILE.boundary.sggCodeOverrides ?? {}).map(([from, to]) => `sgg_cd === '${from}' ? '${to}' : `),
  ...Object.entries(ACTIVE_PROFILE.boundary.sggPrefixOverrides ?? {}).map(([prefix, to]) => `sgg_cd.slice(0, ${prefix.length}) === '${prefix}' ? '${to}' : `),
].join("");
export const MERGE_JEONJU_GU_CMD = `-each "sgg_cd = ${sggOverrideExpression}sgg_cd"`;

/**
 * sido === '52' (전북) 필터 → sgg_cd(=sgg, 5211*는 52110으로 통합) 로 dissolve
 * → simplify → 미세 섬 제거 → bbox/labelPoint 계산. 14개 시군 코드표에 없는
 * 결과가 나오면(파이프라인 버그 또는 원본 데이터 변경) 즉시 실패한다.
 */
export async function transformRegions(
  inputGeojsonText: string,
  opts: { simplifyPercent?: number; minIslandAreaKm2?: number; labelOffsets?: LabelOffsets } = {},
): Promise<FeatureCollection<Polygon | MultiPolygon, RegionFeature["properties"]>> {
  const simplifyPercent = opts.simplifyPercent ?? 5;
  const minIslandAreaKm2 = opts.minIslandAreaKm2 ?? 1;
  // Task 6, Section C.2 — 라벨 겹침 완화: IO (reading the manual JSON file)
  // stays in main() below, matching this module's existing pure/IO split —
  // this function only ever reads the ALREADY-PARSED map handed to it, so
  // it stays testable against a small in-memory fixture (see
  // tests/pipeline/build-regions.test.ts).
  const labelOffsets = opts.labelOffsets ?? {};
  const outputText = await runMapshaper(
    [
      "-i input.geojson",
      `-filter "sido === '${JB_SIDO}'"`,
      SGG_CD_FROM_SGG_CMD,
      MERGE_JEONJU_GU_CMD,
      "-dissolve sgg_cd",
      `-simplify ${simplifyPercent}% keep-shapes`,
      // 추가 요구 #3: drop sub-`minIslandAreaKm2` detached polygon rings (군산
      // 고군산군도/부안 미세 섬 that would otherwise render as thin spike
      // columns at any real ELEVATION_FLOOR). Placed AFTER -simplify, not
      // between -dissolve and -simplify as the task brief's plan excerpt
      // describes: empirically (see task-2-report.md), running
      // -filter-islands before -simplify has NO effect on the final output
      // here — `-simplify ... keep-shapes` independently prunes/shrinks
      // small rings via its own sub-tolerance-area sliver drop, and the
      // pre-simplify-filtered and unfiltered outputs came out byte-identical
      // when compared directly (confirmed with mapshaper@0.7.62's own
      // `-info`/message logging). Filtering AFTER simplify operates on the
      // actual shipped geometry, so `minIslandAreaKm2` means what it says
      // about the file real users load. 위도(부안, ~11.65km²) and the 5
      // largest 고군산군도 islands (1.6-6.6km², 군산) survive this threshold;
      // only sub-1km² fragments are dropped.
      `-filter-islands min-area=${minIslandAreaKm2}km2`,
      '-each "bbox=this.bounds, labelPoint=[this.innerX, this.innerY]"',
      "-o output.geojson precision=0.00001",
    ],
    inputGeojsonText,
  );

  const dissolved = JSON.parse(outputText) as FeatureCollection<
    Polygon | MultiPolygon,
    RawRegionProps
  >;

  const features: RegionFeature[] = dissolved.features.map((f) => {
    const code = String(f.properties.sgg_cd);
    if (!isRegionCode(code)) {
      throw new Error(
        `transformRegions: dissolved feature has unknown sgg_cd "${code}" ` +
          `(not one of the 14 known REGION_CODES: ${REGION_CODES.join(", ")})`,
      );
    }
    const bbox = round5(f.properties.bbox) as Bbox;
    const [rawLng, rawLat] = f.properties.labelPoint;
    // Task B, fix round 1 — apply this region's manual nudge (if any)
    // GEOGRAPHICALLY, to labelPoint itself, instead of emitting a separate
    // labelOffset for a render-time getPixelOffset — see
    // `labelOffsetToLngLat`'s own doc comment above for why.
    const [dLng, dLat] = labelOffsets[code] ? labelOffsetToLngLat(labelOffsets[code]) : [0, 0];
    const [lng, lat] = round5([rawLng + dLng, rawLat + dLat]);
    return {
      type: "Feature",
      geometry: f.geometry,
      properties: {
        code,
        name: regionName(code),
        bbox,
        labelPoint: [lng, lat],
      },
    } satisfies RegionFeature;
  });

  return { type: "FeatureCollection", features };
}

/**
 * Dissolves the 4 시도 bordering 전북 (충남/전남광주통합특별시/경북/경남) into flat
 * silhouettes, for backdrop context only (전북 itself is excluded).
 */
export async function transformNeighbors(
  inputGeojsonText: string,
  opts: { simplifyPercent?: number } = {},
): Promise<NeighborFeatureCollection> {
  const simplifyPercent = opts.simplifyPercent ?? 2;
  const filterList = NEIGHBOR_SIDO_CODES.map((c) => `'${c}'`).join(",");
  const outputText = await runMapshaper(
    [
      "-i input.geojson",
      `-filter "[${filterList}].includes(sido)"`,
      "-dissolve sido copy-fields=sidonm",
      `-simplify ${simplifyPercent}% keep-shapes`,
      "-o output.geojson precision=0.00001",
    ],
    inputGeojsonText,
  );

  const dissolved = JSON.parse(outputText) as FeatureCollection<
    Polygon | MultiPolygon,
    RawNeighborProps
  >;

  const features: Feature<Polygon | MultiPolygon, { code: string; name: string }>[] =
    dissolved.features.map((f) => ({
      type: "Feature",
      geometry: f.geometry,
      properties: { code: String(f.properties.sido), name: String(f.properties.sidonm) },
    }));

  return { type: "FeatureCollection", features };
}

// Exported — build-emd.ts's main() calls this directly (same RAW_PATH/
// SOURCE_URL, per the task brief: "파일이 없으면 같은 방식으로 내려받는다"),
// rather than re-implementing its own download/cache-check logic.
export async function ensureSourceDownloaded(): Promise<void> {
  if (existsSync(RAW_PATH)) {
    console.log(`[build-regions] using cached ${path.relative(ROOT, RAW_PATH)}`);
    return;
  }
  console.log(`[build-regions] downloading ${SOURCE_URL}`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) {
    throw new Error(`Failed to download admdongkor source: HTTP ${res.status} ${res.statusText}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(path.dirname(RAW_PATH), { recursive: true });
  await writeFile(RAW_PATH, buf);
  console.log(`[build-regions] downloaded ${buf.byteLength} bytes -> ${path.relative(ROOT, RAW_PATH)}`);
}

async function loadLabelOffsets(): Promise<LabelOffsets> {
  if (!existsSync(LABEL_OFFSETS_PATH)) return {};
  const text = await readFile(LABEL_OFFSETS_PATH, "utf8");
  return JSON.parse(text) as LabelOffsets;
}

async function main() {
  if (ACTIVE_PROFILE.id === "gangwon") {
    throw new Error(
      "[build-regions] Gangwon boundaries must use the verified national SGIS ZIP via the Gangwon release pipeline; this legacy admdongkor downloader is disabled.",
    );
  }
  await ensureSourceDownloaded();
  const inputText = await readFile(RAW_PATH, "utf8");
  const labelOffsets = await loadLabelOffsets();
  console.log(
    `[build-regions] label-offsets.json: ${Object.keys(labelOffsets).length} region(s) configured` +
      (Object.keys(labelOffsets).length > 0 ? ` (${Object.keys(labelOffsets).join(", ")})` : ""),
  );

  const distinctSido = new Map<string, string>();
  for (const f of JSON.parse(inputText).features as Feature<
    Polygon | MultiPolygon,
    { sido: string; sidonm: string }
  >[]) {
    distinctSido.set(f.properties.sido, f.properties.sidonm);
  }
  console.log(
    `[build-regions] distinct sido in source: ${[...distinctSido.entries()]
      .map(([code, name]) => `${code}=${name}`)
      .join(", ")}`,
  );

  let regions = await transformRegions(inputText, { simplifyPercent: 5, labelOffsets });
  let regionsText = JSON.stringify(regions);
  if (Buffer.byteLength(regionsText) > REGIONS_MAX_BYTES) {
    console.log(
      `[build-regions] regions.geojson at 5% simplify is ${Buffer.byteLength(regionsText)} bytes ` +
        `(> ${REGIONS_MAX_BYTES}), retrying at 3%`,
    );
    regions = await transformRegions(inputText, { simplifyPercent: 3, labelOffsets });
    regionsText = JSON.stringify(regions);
  }
  if (regions.features.length !== REGION_CODES.length) {
    throw new Error(
      `[build-regions] expected ${REGION_CODES.length} region features, got ${regions.features.length}: ` +
        regions.features.map((f) => f.properties.code).join(", "),
    );
  }
  const regionsBytes = Buffer.byteLength(regionsText);
  if (regionsBytes > REGIONS_MAX_BYTES) {
    throw new Error(
      `[build-regions] regions.geojson is ${regionsBytes} bytes, exceeding the ${REGIONS_MAX_BYTES}-byte limit even at 3% simplify`,
    );
  }
  await mkdir(path.dirname(REGIONS_OUTPUT_PATH), { recursive: true });
  await writeFile(REGIONS_OUTPUT_PATH, regionsText);
  console.log(
    `[build-regions] wrote ${path.relative(ROOT, REGIONS_OUTPUT_PATH)}: ` +
      `${regions.features.length} features, ${regionsBytes} bytes`,
  );
  for (const f of regions.features) {
    console.log(
      `  ${f.properties.code} ${f.properties.name} bbox=[${f.properties.bbox.join(", ")}]`,
    );
  }

  const neighbors = await transformNeighbors(inputText, { simplifyPercent: 2 });
  const neighborsText = JSON.stringify(neighbors);
  const neighborsBytes = Buffer.byteLength(neighborsText);
  if (neighborsBytes > NEIGHBORS_MAX_BYTES) {
    throw new Error(
      `[build-regions] neighbors.geojson is ${neighborsBytes} bytes, exceeding the ${NEIGHBORS_MAX_BYTES}-byte limit`,
    );
  }
  await writeFile(NEIGHBORS_OUTPUT_PATH, neighborsText);
  console.log(
    `[build-regions] wrote ${path.relative(ROOT, NEIGHBORS_OUTPUT_PATH)}: ` +
      `${neighbors.features.length} features, ${neighborsBytes} bytes`,
  );
  for (const f of neighbors.features) {
    console.log(`  ${f.properties.code} ${f.properties.name}`);
  }
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}

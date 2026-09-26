// Builds public/data/emd/<시군코드>.geojson — one file per 시군, each holding
// that 시군's 읍면동 (eupmyeondong)-level boundary lines, for Task E's
// "읍면동 경계" overlay (drawn as a thin PathLayer on the selected region's
// top face — see src/components/map/layers/emdLayer.ts). Labels are never
// drawn for this layer, so `properties.name` is inert cargo, not a rendered
// string — see emdNameOf's own doc comment for what it's derived from and
// why exact fidelity there has no visual consequence.
//
// Reuses build-regions.ts's IO helpers and mapshaper command fragments
// (RAW_PATH, ensureSourceDownloaded, runMapshaper, JB_SIDO,
// SGG_CD_FROM_SGG_CMD, MERGE_JEONJU_GU_CMD) instead of re-deriving them, so
// the two pipelines can never drift on where the raw source lives or how
// 전주시 완산구/덕진구 get merged into 52110 (see build-regions.ts's own doc
// comments on each of those exports for the reasoning).
//
// Unlike build-regions.ts, this file does NOT `-dissolve` 읍면동 features
// into one polygon per 시군 — every individual 읍면동 stays its own feature
// (that IS the point: sub-시군 boundary lines, not a re-derivation of
// regions.geojson at finer precision). `sgg_cd` (the merged 시군 code) is
// only ever used here as a JS-side GROUPING key for which output file a
// feature lands in — it is never written to the emitted `properties`.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";

import { isRegionCode, REGION_CODES } from "../../src/lib/geo/regions";
import { ACTIVE_PROFILE } from "../../src/lib/profiles";
import {
  ensureSourceDownloaded,
  JB_SIDO,
  MERGE_JEONJU_GU_CMD,
  RAW_PATH,
  runMapshaper,
  SGG_CD_FROM_SGG_CMD,
} from "./build-regions";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const EMD_OUTPUT_DIR = path.join(ROOT, "public/data/emd");

const EMD_FILE_MAX_BYTES = 300 * 1024;

type RawEmdProps = {
  adm_cd: string;
  adm_nm: string;
  /** Added by SGG_CD_FROM_SGG_CMD/MERGE_JEONJU_GU_CMD below — the merged 시군 code, used only as a grouping key (never emitted). */
  sgg_cd: string;
};

export type EmdFeature = Feature<Polygon | MultiPolygon, { code: string; name: string }>;
export type EmdFeatureCollection = FeatureCollection<Polygon | MultiPolygon, { code: string; name: string }>;

/**
 * Last whitespace-separated token of admdongkor's full `adm_nm` (e.g.
 * "전북특별자치도 전주시완산구 중화산1동" -> "중화산1동") — the 읍면동's own
 * name, independent of how many administrative levels precede it or how
 * they're spaced. Confirmed against the real
 * data/raw/admdongkor-ver20260701.geojson (see task-E-report.md) that the
 * "시+구" segment is concatenated with NO internal space for 전주시 특례시
 * 구 ("전주시완산구", not "전주시 완산구") — the last-token rule is robust to
 * that either way, since 읍면동 is always the LAST token regardless of how
 * many tokens precede it. No dedicated "읍면동-only name" field exists in
 * the source schema (verified: its only properties are adm_nm, adm_cd,
 * adm_cd2, sgg, sggnm, sido, sidonm), so this derivation is the only way to
 * get a bare 읍면동 name at all. Never rendered as a label (Task E brief:
 * "라벨은 넣지 않는다") — properties.name exists only so a `code`-driven
 * debugging session (devtools inspection of the layer's data, a future
 * label-adding task, ...) has a readable name to look at, not for anything
 * this app currently displays.
 */
export function emdNameOf(admNm: string): string {
  const tokens = admNm.trim().split(/\s+/).filter(Boolean);
  return tokens.length > 0 ? tokens[tokens.length - 1] : admNm;
}

/**
 * sido === '52' 필터 → (JS-side) sgg_cd 병합 규칙으로 그룹핑 — dissolve 하지
 * 않고 읍면동 feature 를 모두 보존한다 → simplify → clean → precision 1e-5.
 * 그룹 키(병합된 sgg_cd)가 14개 REGION_CODES 에 없으면(파이프라인 버그 또는
 * 원본 데이터 변경) 즉시 실패한다 — transformRegions와 동일한 방어.
 *
 * Returns a Map keyed by 시군 code, in ascending REGION_CODES order
 * (REGION_CODES itself is already declared in that order — see
 * src/lib/geo/regions.ts) regardless of the input features' own order, so
 * main()'s file-write loop below is deterministic.
 */
export async function transformEmd(rawGeojsonText: string): Promise<Map<string, EmdFeatureCollection>> {
  const outputText = await runMapshaper(
    [
      "-i input.geojson",
      `-filter "sido === '${JB_SIDO}'"`,
      SGG_CD_FROM_SGG_CMD,
      MERGE_JEONJU_GU_CMD,
      "-simplify 10% keep-shapes",
      "-clean",
      "-o output.geojson precision=0.00001",
    ],
    rawGeojsonText,
  );

  const parsed = JSON.parse(outputText) as FeatureCollection<Polygon | MultiPolygon, RawEmdProps>;

  const bySggCd = new Map<string, EmdFeature[]>();
  for (const f of parsed.features) {
    const sggCd = String(f.properties.sgg_cd);
    if (!isRegionCode(sggCd)) {
      throw new Error(
        `transformEmd: feature has unknown merged sgg_cd "${sggCd}" (adm_cd=${f.properties.adm_cd}) ` +
          `— not one of the 14 known REGION_CODES: ${REGION_CODES.join(", ")}`,
      );
    }
    const feature: EmdFeature = {
      type: "Feature",
      geometry: f.geometry,
      properties: {
        code: String(f.properties.adm_cd),
        name: emdNameOf(String(f.properties.adm_nm)),
      },
    };
    const bucket = bySggCd.get(sggCd);
    if (bucket) {
      bucket.push(feature);
    } else {
      bySggCd.set(sggCd, [feature]);
    }
  }

  const result = new Map<string, EmdFeatureCollection>();
  for (const code of REGION_CODES) {
    const features = bySggCd.get(code);
    if (features && features.length > 0) {
      result.set(code, { type: "FeatureCollection", features });
    }
  }
  return result;
}

async function main() {
  if (ACTIVE_PROFILE.id === "gangwon") {
    throw new Error(
      "[build-emd] Gangwon administrative-dong boundaries must use the verified national SGIS ZIP via the Gangwon release pipeline; this legacy admdongkor downloader is disabled.",
    );
  }
  await ensureSourceDownloaded();
  const inputText = await readFile(RAW_PATH, "utf8");

  const grouped = await transformEmd(inputText);

  const missing = REGION_CODES.filter((code) => !grouped.has(code));
  if (missing.length > 0) {
    throw new Error(
      `[build-emd] missing 읍면동 data for ${missing.length}/${REGION_CODES.length} 시군: ${missing.join(", ")}`,
    );
  }

  await mkdir(EMD_OUTPUT_DIR, { recursive: true });

  for (const [code, fc] of grouped) {
    if (fc.features.length < 1) {
      throw new Error(`[build-emd] ${code}: 0 읍면동 features — pipeline bug`);
    }
    const text = JSON.stringify(fc);
    const bytes = Buffer.byteLength(text);
    if (bytes > EMD_FILE_MAX_BYTES) {
      throw new Error(
        `[build-emd] public/data/emd/${code}.geojson is ${bytes} bytes, exceeding the ${EMD_FILE_MAX_BYTES}-byte limit`,
      );
    }
    const outPath = path.join(EMD_OUTPUT_DIR, `${code}.geojson`);
    await writeFile(outPath, text);
    console.log(
      `[build-emd] wrote public/data/emd/${code}.geojson: ${fc.features.length} features, ${bytes} bytes`,
    );
  }
}

const isMainModule =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}

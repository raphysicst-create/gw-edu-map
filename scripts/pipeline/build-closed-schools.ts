import { assertLegacyPipelineDisabled } from "./gangwon/legacy-guard";
/**
 * Builds data/interim/closed-schools-<YYYYMMDD>.json and
 * public/data/closed-schools.json (전북 폐교재산 현황, Task 5 — 폐교 지표)
 * from data/raw/전북특별자치도교육청_폐교재산 현황_YYYYMMDD.csv.
 *
 * There is no `npm run data:closed` script (package.json must not be
 * modified) — instead build-indicators.ts imports
 * `buildClosedSchoolsInterim()` from this module and calls it before
 * building the 3 closed_schools* indicators. This file is still
 * independently runnable via `tsx scripts/pipeline/build-closed-schools.ts`
 * for manual debugging, gated by the same `isMainModule` guard
 * build-regions.ts uses so importing it as a library never triggers a run.
 *
 * Like data:kess's committed interim JSONs, the raw CSV is optional at run
 * time: when data/raw/ has no matching file (e.g. a fresh clone that never
 * downloaded the source), this falls back to the newest already-committed
 * data/interim/closed-schools-*.json instead of failing build-indicators.ts
 * outright — only throwing when NEITHER a raw CSV nor a committed interim
 * file can be found.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { ClosedSchoolsFile } from "../../src/lib/closedSchools/types";
import { parseClosedSchoolsCsv } from "./lib/closed-schools";
import {
  CLOSED_SCHOOLS_CSV_PREFIX,
  CLOSED_SCHOOLS_PUBLISHED_AT,
  CLOSED_SCHOOLS_SOURCE,
  referenceDateFromFilename,
} from "./sources";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const RAW_DIR = path.join(ROOT, "data/raw");
const INTERIM_DIR = path.join(ROOT, "data/interim");
const PUBLIC_DATA_DIR = path.join(ROOT, "public/data");

const INTERIM_FILENAME_RE = /^closed-schools-(\d{8})\.json$/;

/** Scans data/raw/ for a file matching `CLOSED_SCHOOLS_CSV_PREFIX*.csv`. Returns null (not a throw) when none exists — the caller decides whether to fall back to a committed interim file. */
function findRawCsvFile(): string | null {
  const entries = existsSync(RAW_DIR) ? readdirSync(RAW_DIR) : [];
  const candidates = entries
    .filter((f) => f.startsWith(CLOSED_SCHOOLS_CSV_PREFIX) && f.endsWith(".csv"))
    .sort();
  // If more than one date happens to be present, use the most recent (sorts
  // last as a YYYYMMDD-suffixed string) rather than whichever readdir lists first.
  return candidates.length > 0 ? candidates[candidates.length - 1] : null;
}

/** Reads the newest already-committed data/interim/closed-schools-*.json. Throws (naming both places checked) when none exists — the true "nothing to build from at all" case. */
function readNewestCommittedInterim(): ClosedSchoolsFile {
  const entries = existsSync(INTERIM_DIR) ? readdirSync(INTERIM_DIR) : [];
  const candidates = entries.filter((f) => INTERIM_FILENAME_RE.test(f)).sort();
  if (candidates.length === 0) {
    throw new Error(
      `${path.relative(ROOT, RAW_DIR)}/ 에 ${CLOSED_SCHOOLS_CSV_PREFIX}*.csv 파일이 없고, ` +
        `${path.relative(ROOT, INTERIM_DIR)}/ 에도 closed-schools-*.json 커밋된 파일이 없습니다. ` +
        `공공데이터포털(data.go.kr, 전북특별자치도교육청 폐교재산 현황)에서 CSV를 내려받아 ` +
        `${CLOSED_SCHOOLS_CSV_PREFIX}YYYYMMDD.csv 이름으로 data/raw/ 에 두세요.`,
    );
  }
  const filename = candidates[candidates.length - 1];
  return JSON.parse(readFileSync(path.join(INTERIM_DIR, filename), "utf8")) as ClosedSchoolsFile;
}

/**
 * Finds+parses the raw CSV (if present) or falls back to the newest
 * committed interim, (re)writes data/interim/closed-schools-<date>.json when
 * built fresh from the CSV, always (re)writes public/data/closed-schools.json
 * so the client has the row-level 폐교 목록 data, and returns the in-memory
 * result for build-indicators.ts to aggregate into the 3 indicator files.
 */
export async function buildClosedSchoolsInterim(): Promise<ClosedSchoolsFile> {
  assertLegacyPipelineDisabled();
  const csvFilename = findRawCsvFile();
  let result: ClosedSchoolsFile;

  if (csvFilename) {
    const referenceDate = referenceDateFromFilename(csvFilename);
    console.log(
      `[build-closed-schools] reading ${path.relative(ROOT, path.join(RAW_DIR, csvFilename))} (기준일 ${referenceDate}) ...`,
    );
    const csvText = readFileSync(path.join(RAW_DIR, csvFilename), "utf8");
    const { rows } = parseClosedSchoolsCsv(csvText);
    result = { referenceDate, publishedAt: CLOSED_SCHOOLS_PUBLISHED_AT, source: CLOSED_SCHOOLS_SOURCE, rows };

    await mkdir(INTERIM_DIR, { recursive: true });
    const interimPath = path.join(INTERIM_DIR, `closed-schools-${referenceDate.replaceAll("-", "")}.json`);
    await writeFile(interimPath, JSON.stringify(result, null, 2));
    console.log(`[build-closed-schools] wrote ${path.relative(ROOT, interimPath)}: ${rows.length}행`);
  } else {
    console.log(`[build-closed-schools] data/raw/ 에 ${CLOSED_SCHOOLS_CSV_PREFIX}*.csv 없음 — 커밋된 interim으로 대체`);
    result = readNewestCommittedInterim();
  }

  await mkdir(PUBLIC_DATA_DIR, { recursive: true });
  const publicPath = path.join(PUBLIC_DATA_DIR, "closed-schools.json");
  await writeFile(publicPath, JSON.stringify(result, null, 2));
  console.log(
    `[build-closed-schools] wrote ${path.relative(ROOT, publicPath)}: ${result.rows.length}행 ` +
      `(기준일 ${result.referenceDate}, 게시 ${result.publishedAt})`,
  );

  return result;
}

const isMainModule =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  buildClosedSchoolsInterim().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}


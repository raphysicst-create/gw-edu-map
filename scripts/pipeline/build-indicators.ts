import { assertLegacyPipelineDisabled } from "./gangwon/legacy-guard";
/**
 * Builds public/data/indicators/<id>.json (latest year snapshot),
 * public/data/series/<id>.json (all years, non-byLevel rows only), and
 * public/data/manifest.json from data/interim/kess-<year>.json using
 * nothing but each INDICATORS entry's declarative `aggregate` rule.
 *
 * `students_change_5y` (kind: 'external') is the one exception: it has no
 * SchoolRow-level aggregate, so it's computed after the fact from the
 * students_total series, per the registry's documented rule.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { CLOSED_SCHOOLS_AGGREGATE_FILE, INDICATORS } from "../../src/lib/indicators/registry";
import type {
  IndicatorFile,
  IndicatorRow,
  IndicatorSource,
  Manifest,
  SeriesFile,
} from "../../src/lib/indicators/types";
import type { ClosedSchoolsFile } from "../../src/lib/closedSchools/types";
import type { SchoolsFile } from "../../src/lib/schools/types";
import { aggregateIndicator } from "./lib/aggregate";
import {
  aggregateClosedSchools,
  assertPublishedAtNotBeforeReferenceDate,
  type ClosedSchoolsMetric,
} from "./lib/closed-schools";
import { buildClosedSchoolsInterim } from "./build-closed-schools";
import type { SchoolRow } from "./lib/kess-xlsx";
import {
  BOUNDARY_REFERENCE_DATE,
  BOUNDARY_SOURCE,
  INCLUDED_STATUSES,
  KESS_STATS_SOURCE,
  PROVINCE_CODE,
  REGION_TABLE,
} from "./sources";

const INTERIM_DIR = path.resolve(import.meta.dirname, "../../data/interim");
const PUBLIC_DATA_DIR = path.resolve(import.meta.dirname, "../../public/data");
const INDICATORS_DIR = path.join(PUBLIC_DATA_DIR, "indicators");
const SERIES_DIR = path.join(PUBLIC_DATA_DIR, "series");

interface InterimFile {
  year: number;
  referenceDate: string;
  source: IndicatorSource;
  rows: SchoolRow[];
}

function loadInterimFiles(): Map<number, InterimFile> {
  const files = existsSync(INTERIM_DIR)
    ? readdirSync(INTERIM_DIR).filter((f) => /^kess-\d{4}\.json$/.test(f))
    : [];
  const map = new Map<number, InterimFile>();
  for (const file of files) {
    const data = JSON.parse(readFileSync(path.join(INTERIM_DIR, file), "utf-8")) as InterimFile;
    map.set(data.year, data);
  }
  return map;
}

/** 5년 증감률: (최신 - target) / target * 100. target = latestYear-5, or the
 * oldest available year if that exact year is missing, or null if there's
 * only one year of data (no earlier year to compare against at all). */
function computeChange5y(
  seriesRows: SeriesFile["rows"],
  latestYear: number,
): IndicatorRow[] {
  const years = [...new Set(seriesRows.map((r) => r.year))].sort((a, b) => a - b);
  const fiveYearsAgo = latestYear - 5;
  const targetYear = years.includes(fiveYearsAgo)
    ? fiveYearsAgo
    : years[0] !== latestYear
      ? years[0]
      : null;

  const byRegion = new Map<string, Map<number, number | null>>();
  for (const row of seriesRows) {
    if (!byRegion.has(row.regionCode)) byRegion.set(row.regionCode, new Map());
    byRegion.get(row.regionCode)?.set(row.year, row.value);
  }

  const regionCodes = [...REGION_TABLE.map((r) => r.code), PROVINCE_CODE];
  return regionCodes.map((regionCode) => {
    if (targetYear === null) return { regionCode, value: null };
    const latestValue = byRegion.get(regionCode)?.get(latestYear) ?? null;
    const targetValue = byRegion.get(regionCode)?.get(targetYear) ?? null;
    if (latestValue == null || targetValue == null || targetValue === 0) {
      return { regionCode, value: null };
    }
    return { regionCode, value: ((latestValue - targetValue) / targetValue) * 100 };
  });
}

async function main(): Promise<void> {
  assertLegacyPipelineDisabled();
  const interim = loadInterimFiles();
  if (interim.size === 0) {
    throw new Error("[build-indicators] no data/interim/kess-<year>.json files found — run npm run data:kess first");
  }

  const years = [...interim.keys()].sort((a, b) => a - b);
  const latestYear = years[years.length - 1];
  console.log(`[build-indicators] years available: ${years.join(", ")}; latestYear=${latestYear}`);

  await mkdir(INDICATORS_DIR, { recursive: true });
  await mkdir(SERIES_DIR, { recursive: true });

  const manifestIndicators: Manifest["indicators"] = {};
  let studentsTotalSeriesRows: SeriesFile["rows"] | undefined;

  for (const def of INDICATORS) {
    if (def.aggregate.kind === "external") continue; // handled after the main loop

    const latestInterim = interim.get(latestYear);
    if (!latestInterim) throw new Error(`[build-indicators] missing interim data for latestYear ${latestYear}`);

    const latestRows = aggregateIndicator(def, latestInterim.rows, { statuses: INCLUDED_STATUSES });
    const indicatorFile: IndicatorFile = {
      id: def.id,
      year: latestYear,
      referenceDate: latestInterim.referenceDate,
      source: def.source,
      rows: latestRows,
    };
    await writeFile(path.join(INDICATORS_DIR, `${def.id}.json`), JSON.stringify(indicatorFile, null, 2));

    const seriesRows: SeriesFile["rows"] = [];
    for (const year of years) {
      const yearInterim = interim.get(year);
      if (!yearInterim) continue;
      const yearRows = aggregateIndicator(def, yearInterim.rows, { statuses: INCLUDED_STATUSES });
      for (const row of yearRows) {
        if (row.level !== undefined) continue; // series is the overall (non-byLevel) trend only
        seriesRows.push({ regionCode: row.regionCode, year, value: row.value });
      }
    }
    const seriesFile: SeriesFile = { id: def.id, rows: seriesRows };
    await writeFile(path.join(SERIES_DIR, `${def.id}.json`), JSON.stringify(seriesFile, null, 2));

    if (def.id === "students_total") studentsTotalSeriesRows = seriesRows;

    manifestIndicators[def.id] = { years: [...years] };
    console.log(`[build-indicators] ${def.id}: indicators/${def.id}.json + series/${def.id}.json (${seriesRows.length} series rows)`);
  }

  // students_change_5y: external kind, computed from the students_total series.
  const changeDef = INDICATORS.find((d) => d.id === "students_change_5y");
  if (changeDef) {
    if (!studentsTotalSeriesRows) {
      throw new Error("[build-indicators] students_change_5y requires students_total to be built first");
    }
    const latestInterim = interim.get(latestYear);
    if (!latestInterim) throw new Error(`[build-indicators] missing interim data for latestYear ${latestYear}`);

    const rows = computeChange5y(studentsTotalSeriesRows, latestYear);
    const indicatorFile: IndicatorFile = {
      id: changeDef.id,
      year: latestYear,
      referenceDate: latestInterim.referenceDate,
      source: changeDef.source,
      rows,
    };
    await writeFile(path.join(INDICATORS_DIR, `${changeDef.id}.json`), JSON.stringify(indicatorFile, null, 2));
    manifestIndicators[changeDef.id] = { years: [latestYear] };
    console.log(`[build-indicators] ${changeDef.id}: indicators/${changeDef.id}.json (external, no series file)`);
  }

  // closed_schools / closed_schools_unused / closed_schools_recent (Task 5):
  // external kind, from the 폐교재산 현황 CSV pipeline — a completely
  // separate source from KESS. buildClosedSchoolsInterim() finds+parses the
  // raw CSV (or falls back to a committed interim), and also (re)writes
  // public/data/closed-schools.json for RegionPanel's 폐교 목록 section.
  const closedDefs = INDICATORS.filter(
    (d) => d.aggregate.kind === "external" && d.aggregate.file === CLOSED_SCHOOLS_AGGREGATE_FILE,
  );
  let closedSchoolsResult: ClosedSchoolsFile | undefined;
  if (closedDefs.length > 0) {
    closedSchoolsResult = await buildClosedSchoolsInterim();
    // Fix round 1/5, finding 4: fail loudly if a future CSV refresh's
    // sources.ts constant (CLOSED_SCHOOLS_PUBLISHED_AT) or filename-derived
    // referenceDate is ever set inconsistently (게시일 < 기준일 is never
    // valid for a real 공공데이터포털 dataset).
    assertPublishedAtNotBeforeReferenceDate(closedSchoolsResult.referenceDate, closedSchoolsResult.publishedAt);
    const aggregated = aggregateClosedSchools(closedSchoolsResult.rows, closedSchoolsResult.referenceDate);

    for (const def of closedDefs) {
      if (def.aggregate.kind !== "external") continue; // narrows def.aggregate below
      const metric = def.aggregate.field;
      const rows = aggregated[metric as ClosedSchoolsMetric];
      if (!rows) {
        throw new Error(`[build-indicators] ${def.id}: unknown closed-schools metric "${metric}"`);
      }
      const indicatorFile: IndicatorFile = {
        id: def.id,
        year: latestYear,
        referenceDate: closedSchoolsResult.referenceDate,
        source: def.source,
        rows,
      };
      await writeFile(path.join(INDICATORS_DIR, `${def.id}.json`), JSON.stringify(indicatorFile, null, 2));
      manifestIndicators[def.id] = { years: [latestYear] };
      console.log(`[build-indicators] ${def.id}: indicators/${def.id}.json (external:closed-schools, no series file)`);
    }
  }

  // manifest.sources (Task 5, Section C) — every named data source's
  // name/link/기준일(+게시일), assembled here once so Footer.tsx only ever
  // reads this array and never hardcodes a date string itself.
  const kessLatestInterim = interim.get(latestYear);
  if (!kessLatestInterim) throw new Error(`[build-indicators] missing interim data for latestYear ${latestYear}`);

  const schoolsJsonPath = path.join(PUBLIC_DATA_DIR, "schools.json");
  if (!existsSync(schoolsJsonPath)) {
    throw new Error(
      `[build-indicators] ${path.relative(process.cwd(), schoolsJsonPath)} 이(가) 없습니다 — ` +
        `학교 위치 출처를 manifest.sources에 기록하려면 먼저 npm run data:schools 를 실행하세요.`,
    );
  }
  const schoolsFile = JSON.parse(readFileSync(schoolsJsonPath, "utf-8")) as SchoolsFile;
  if (!schoolsFile.source.location || !schoolsFile.referenceDate.location) throw new Error("기존 빌드는 검증된 학교 위치 출처가 필요합니다.");

  const sources: Manifest["sources"] = [
    { name: KESS_STATS_SOURCE.name, url: KESS_STATS_SOURCE.url, referenceDate: kessLatestInterim.referenceDate },
    {
      name: schoolsFile.source.location.name,
      url: schoolsFile.source.location.url,
      referenceDate: schoolsFile.referenceDate.location,
    },
    { name: BOUNDARY_SOURCE.name, url: BOUNDARY_SOURCE.url, referenceDate: BOUNDARY_REFERENCE_DATE },
  ];
  if (closedSchoolsResult) {
    sources.push({
      name: closedSchoolsResult.source.name,
      url: closedSchoolsResult.source.url,
      referenceDate: closedSchoolsResult.referenceDate,
      publishedAt: closedSchoolsResult.publishedAt,
    });
  }

  const manifest: Manifest = {
    latestYear,
    indicators: manifestIndicators,
    builtAt: new Date().toISOString(),
    sources,
  };
  await writeFile(path.join(PUBLIC_DATA_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`[build-indicators] wrote manifest.json (${Object.keys(manifestIndicators).length} indicators, ${sources.length} sources)`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});


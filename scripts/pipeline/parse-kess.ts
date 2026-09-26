import { assertLegacyPipelineDisabled } from "./gangwon/legacy-guard";
/**
 * Parses every downloaded data/raw/kess-<year>.xlsx into
 * data/interim/kess-<year>.json ({ year, referenceDate, source, rows }).
 * Years with no downloaded file are skipped (fetch-kess.ts logs why).
 * Processes one year at a time so each xlsx buffer/workbook can be garbage
 * collected before the next is read — a full national workbook is ~20k rows
 * x 149 cols and there's no need to hold 5 of them in memory at once.
 */
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { IndicatorSource } from "../../src/lib/indicators/types";
import { readSchoolSheet } from "./lib/kess-xlsx";
import { KESS_FILE_IDS } from "./sources";

const RAW_DIR = path.resolve(import.meta.dirname, "../../data/raw");
const INTERIM_DIR = path.resolve(import.meta.dirname, "../../data/interim");

/**
 * `year` here is a per-year override applied at the write site below (fix
 * round 2, finding 11) — every interim file used to hardcode 2026 regardless
 * of which year it actually held (data/interim/kess-2022.json's own `source`
 * claimed year 2026), which is misleading for a per-file provenance record
 * even though nothing downstream currently reads it (build-indicators.ts
 * uses each INDICATORS entry's own `def.source` instead — see its
 * `source: def.source` — not this interim file's `source` field at all).
 */
const SOURCE: Omit<IndicatorSource, "year"> = {
  name: "한국교육개발원 교육통계서비스(KESS) 교육기본통계 학교별 데이터셋",
  url: "https://kess.kedi.re.kr/contents/dataset",
};

function formatDropped(dropped: Record<string, number>): string {
  const entries = Object.entries(dropped).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return "(none)";
  return entries.map(([key, count]) => `${key}=${count}`).join(", ");
}

async function main(): Promise<void> {
  assertLegacyPipelineDisabled();
  await mkdir(INTERIM_DIR, { recursive: true });

  const years = Object.keys(KESS_FILE_IDS)
    .map(Number)
    .sort((a, b) => b - a);

  const parsedYears: number[] = [];

  for (const year of years) {
    const rawPath = path.join(RAW_DIR, `kess-${year}.xlsx`);
    if (!existsSync(rawPath)) {
      console.warn(`[parse-kess] skip year ${year}: ${rawPath} not found (run npm run data:kess to fetch it)`);
      continue;
    }

    console.log(`[parse-kess] reading ${rawPath} ...`);
    const buffer = readFileSync(rawPath);
    const { referenceDate, rows, dropped } = readSchoolSheet(buffer, year);

    const byLevel = rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.level] = (acc[row.level] ?? 0) + 1;
      return acc;
    }, {});

    console.log(
      `[parse-kess] year ${year}: referenceDate=${referenceDate} rows=${rows.length} byLevel=${JSON.stringify(byLevel)} dropped={ ${formatDropped(dropped)} }`,
    );

    const interimPath = path.join(INTERIM_DIR, `kess-${year}.json`);
    await writeFile(
      interimPath,
      JSON.stringify({ year, referenceDate, source: { ...SOURCE, year }, rows }, null, 2),
    );
    console.log(`[parse-kess] wrote ${interimPath}`);

    parsedYears.push(year);
  }

  console.log(`[parse-kess] done. parsed years: ${parsedYears.join(", ") || "(none)"}`);
  if (parsedYears.length === 0) {
    throw new Error("[parse-kess] no years parsed — nothing to build indicators from");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});


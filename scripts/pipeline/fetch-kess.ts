import { assertLegacyPipelineDisabled } from "./gangwon/legacy-guard";
/**
 * Downloads every year's KESS "학교별 데이터셋" xlsx listed in
 * KESS_FILE_IDS (sources.ts) into data/raw/kess-<year>.xlsx, skipping any
 * file that's already present. A single year's failure is logged and
 * skipped rather than aborting the whole run — parse-kess.ts / build-
 * indicators.ts only use whichever years actually downloaded.
 */
import path from "node:path";
import { downloadIfMissing } from "./lib/download";
import { KESS_FILE_IDS, kessDownloadUrl } from "./sources";

const RAW_DIR = path.resolve(import.meta.dirname, "../../data/raw");

async function main(): Promise<void> {
  assertLegacyPipelineDisabled();
  const years = Object.keys(KESS_FILE_IDS)
    .map(Number)
    .sort((a, b) => b - a);

  console.log(`[fetch-kess] years to fetch: ${years.join(", ")}`);

  const failures: number[] = [];
  for (const year of years) {
    const fileId = KESS_FILE_IDS[year];
    const destPath = path.join(RAW_DIR, `kess-${year}.xlsx`);
    try {
      await downloadIfMissing(kessDownloadUrl(fileId), destPath);
    } catch (err) {
      console.error(`[fetch-kess] FAILED year ${year}:`, err instanceof Error ? err.message : err);
      failures.push(year);
    }
  }

  const succeeded = years.filter((y) => !failures.includes(y));
  console.log(`[fetch-kess] done. succeeded: ${succeeded.join(", ") || "(none)"}`);
  if (failures.length > 0) {
    console.warn(`[fetch-kess] missing years (skipped, not fatal): ${failures.join(", ")}`);
  }
  if (succeeded.length === 0) {
    throw new Error("[fetch-kess] every year failed to download — cannot proceed");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});


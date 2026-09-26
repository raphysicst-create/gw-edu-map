import { assertLegacyPipelineDisabled } from "./gangwon/legacy-guard";
// Builds public/data/charset.json — a static list of every character the
// deck.gl scene's TextLayer instances might need to render, so their SDF
// font atlases can be generated once instead of regenerating every time a
// different 시군 is selected (see labelLayer.ts / DeckMap.tsx `characterSet`).
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { REGIONS } from "../../src/lib/geo/regions";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

const SCHOOLS_JSON_PATH = path.join(ROOT, "public/data/schools.json");
const OUTPUT_PATH = path.join(ROOT, "public/data/charset.json");

// Digits, common punctuation/units, and every Korean word the dashboard's
// static UI copy (legend, KPI labels, empty states, etc.) is expected to
// need, so labels never fall back to a missing-glyph tofu box even for
// characters that happen not to appear in any region/school name.
const FIXED_CHARACTERS =
  "0123456789.,%()/-+:·  ㎡명교급개학년증감률자료없음강원특별자치도평균순위학생수교원학급소규모특수다문화폐면지역초중고";

const ASCII_LETTERS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/**
 * Pure function: given a list of display names, returns a deduplicated,
 * sorted string containing every character from those names plus the fixed
 * digit/unit/domain-term characters and ASCII letters above.
 */
export function buildCharset(names: string[]): string {
  const chars = new Set<string>();
  for (const name of names) {
    for (const ch of name) chars.add(ch);
  }
  for (const ch of FIXED_CHARACTERS) chars.add(ch);
  for (const ch of ASCII_LETTERS) chars.add(ch);
  return Array.from(chars).sort().join("");
}

/** Reads `public/data/schools.json`'s `name` fields, if the file exists. Returns [] otherwise (T2+ generates it). */
async function readSchoolNames(): Promise<string[]> {
  if (!existsSync(SCHOOLS_JSON_PATH)) {
    console.log(
      `[build-charset] ${path.relative(ROOT, SCHOOLS_JSON_PATH)} not found yet, skipping school names`,
    );
    return [];
  }
  const raw = await readFile(SCHOOLS_JSON_PATH, "utf8");
  const parsed: unknown = JSON.parse(raw);
  const rows: unknown[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { schools?: unknown[] })?.schools)
      ? (parsed as { schools: unknown[] }).schools
      : [];
  return rows
    .map((row) => (row as { name?: unknown })?.name)
    .filter((name): name is string => typeof name === "string");
}

async function main() {
  assertLegacyPipelineDisabled();
  const regionNames = REGIONS.map((r) => r.name);
  const schoolNames = await readSchoolNames();
  const charset = buildCharset([...regionNames, ...schoolNames]);

  await writeFile(OUTPUT_PATH, JSON.stringify(charset));

  const bytes = Buffer.byteLength(JSON.stringify(charset));
  console.log(
    `[build-charset] wrote ${path.relative(ROOT, OUTPUT_PATH)}: ${charset.length} characters, ${bytes} bytes ` +
      `(regions: ${regionNames.length}, schools: ${schoolNames.length})`,
  );
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


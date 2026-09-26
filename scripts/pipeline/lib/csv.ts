/**
 * Minimal RFC4180-ish CSV parser used for `data/raw/한국교육시설안전원_초중등학교위치_*.csv`.
 * The real file never quotes a field (verified against the full 12,011-row
 * national download — no `"` byte anywhere in it), but the pipeline still
 * needs a robust parser rather than a naive `line.split(',')`: quoting is
 * part of the CSV spec, a future refresh of the source could start using it
 * (e.g. an address containing a comma), and the task brief explicitly asks
 * for quote/BOM handling to be tested. No external dependency — `xlsx`'s own
 * CSV reader is an option but a ~40-line hand-rolled parser is easier to
 * unit-test in isolation and has no surprising sheet/locale behavior.
 */

/** Strips a leading UTF-8 BOM (U+FEFF), if present. */
function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Parses CSV text into rows of raw string fields (no header mapping, no type
 * coercion). Handles:
 *  - a leading BOM
 *  - quoted fields (`"..."`), including embedded commas and newlines
 *  - `""` as an escaped literal quote inside a quoted field
 *  - both `\r\n` and bare `\n` line endings
 *  - a trailing newline at EOF (does not produce a spurious empty last row)
 *
 * Every row (including the header, if any — the caller decides) is returned
 * as `string[]`; ragged rows (fewer/more fields than the header) are
 * returned as-is, since validating column counts is the caller's job.
 */
export function parseCsv(text: string, options: { strict?: boolean } = {}): string[][] {
  const src = stripBom(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let closedQuote = false;
  let sawAnyField = false;
  const n = src.length;
  let i = 0;

  const pushField = (): void => {
    row.push(field);
    field = "";
    closedQuote = false;
  };
  const pushRow = (): void => {
    pushField();
    rows.push(row);
    row = [];
    sawAnyField = false;
  };

  while (i < n) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        closedQuote = true;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (options.strict && closedQuote && ch !== "," && ch !== "\r" && ch !== "\n") {
      throw new Error("CSV 닫힌 따옴표 뒤에 허용되지 않은 문자가 있습니다.");
    }
    if (options.strict && ch === '"' && field !== "") {
      throw new Error("CSV 인용부호는 필드의 처음에서만 열 수 있습니다.");
    }
    if (ch === '"' && field === "") {
      // Only treat a quote as field-opening at the start of a field — a
      // stray '"' mid-field (not spec-compliant CSV, but tolerate rather
      // than throw) is kept as a literal character instead.
      inQuotes = true;
      sawAnyField = true;
      i += 1;
      continue;
    }

    if (ch === ",") {
      pushField();
      sawAnyField = true;
      i += 1;
      continue;
    }

    if (ch === "\r") {
      if (src[i + 1] === "\n") i += 1;
      pushRow();
      i += 1;
      continue;
    }

    if (ch === "\n") {
      pushRow();
      i += 1;
      continue;
    }

    field += ch;
    sawAnyField = true;
    i += 1;
  }

  if (options.strict && inQuotes) throw new Error("CSV 따옴표가 닫히지 않았습니다.");
  // Trailing field/row when the file doesn't end with a newline.
  if (sawAnyField || field.length > 0) {
    pushRow();
  }

  return rows;
}

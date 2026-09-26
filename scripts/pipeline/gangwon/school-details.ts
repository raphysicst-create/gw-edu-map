/** Intake adapter for the GWE education yearbook school directories.
 *
 * Each workbook is an official table, but none exposes an official school code.
 * `recordId` is a source locator, not a school identifier. Do not join these
 * records to the separate school-overview CSV by name alone.
 */
import * as XLSX from "xlsx";
import { parseNumber, REGION_NAMES, type SourceNumber } from "./parse";

export const SCHOOL_DETAILS_PARSER_VERSION = "gwe-school-details-v1";

export const DIRECTORY_TABLES = {
  36645: { level: "elem", category: "elementary", status: 4, group: 5, classes: 6, specialClasses: 14, students: 16, specialStudents: 24, entrants: 26, graduates: 27, teachers: 29, counselors: 35, librarians: 36, classrooms: 44, siteArea: 50, buildingArea: 51 },
  36646: { level: "mid", category: "middle", status: 6, group: 7, classes: 8, specialClasses: 13, students: 15, specialStudents: 20, entrants: 22, graduates: 23, teachers: 27, counselors: 33, librarians: 34, classrooms: 42, siteArea: 48, buildingArea: 49 },
  36647: { level: "high", category: "general-high", status: 7, group: 8, classes: 9, specialClasses: 14, students: 16, specialStudents: 21, entrants: 23, graduates: 24, teachers: 25, counselors: 31, librarians: 32, classrooms: 40, siteArea: 46, buildingArea: 47 },
  36648: { level: "high", category: "vocational-high", status: 7, group: 8, classes: 9, specialClasses: 14, students: 16, specialStudents: 21, entrants: 23, graduates: 24, teachers: 25, counselors: 31, librarians: 32, classrooms: 40, siteArea: 46, buildingArea: 47 },
  36649: { level: "high", category: "alternative-high", status: 7, group: 8, classes: 9, specialClasses: 14, students: 16, specialStudents: 21, entrants: 23, graduates: 24, teachers: 25, counselors: 31, librarians: 32, classrooms: 40, siteArea: 46, buildingArea: 47 },
  36650: { level: "high", category: "special-purpose-high", status: 7, group: 8, classes: 9, specialClasses: 14, students: 16, specialStudents: 21, entrants: 23, graduates: 24, teachers: 25, counselors: 31, librarians: 32, classrooms: 40, siteArea: 46, buildingArea: 47 },
  36651: { level: "high", category: "autonomous-high", status: 7, group: 8, classes: 9, specialClasses: 14, students: 16, specialStudents: 21, entrants: 23, graduates: 24, teachers: 25, counselors: 31, librarians: 32, classrooms: 40, siteArea: 46, buildingArea: 47 },
  36652: { level: "special", category: "special-school", status: 5, group: 6, classes: 7, specialClasses: 15, students: 17, specialStudents: 25, entrants: 27, graduates: 28, teachers: 34, counselors: 41, librarians: 42, classrooms: 50, siteArea: 55, buildingArea: 56 },
} as const;

export type DirectoryTableId = keyof typeof DIRECTORY_TABLES;
export type SchoolDetailRecord = {
  recordId: string;
  sourceId: string;
  sourceSheet: string;
  sourceRow: number;
  sourceSchoolIds: Record<string, string>;
  name: string;
  regionName: string;
  level: "elem" | "mid" | "high" | "special";
  category: string;
  address: string | null;
  website: string | null;
  establishment: string | null;
  openedAt: string | null;
  rawStatus: string;
  status: "active" | "closed" | null;
  branch: boolean | null;
  branchEvidence: "literal-branch-name" | "official-column" | null;
  officialAreaType?: "시" | "읍" | "면" | "특수";
  counts: Record<string, SourceNumber>;
};

function cell(row: unknown[], index: number): string {
  return String(row[index] ?? "").trim();
}

/** Preserves raw null reasons. A printed dash is not silently converted to 0. */
export function parseSchoolDirectory(bytes: Uint8Array, tableId: DirectoryTableId): SchoolDetailRecord[] {
  const layout = DIRECTORY_TABLES[tableId];
  if (!layout) throw new Error(`Unknown GWE directory table: ${tableId}`);
  const workbook = XLSX.read(bytes, { type: "buffer" });
  const sourceSheet = "Sheet1";
  const sheet = workbook.Sheets[sourceSheet];
  if (!sheet) throw new Error(`${tableId}: Sheet1 missing`);
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true });
  if (!rows.length || !cell(rows[3] ?? [], 1).includes("학교명")) throw new Error(`${tableId}: unexpected directory headings`);
  const result: SchoolDetailRecord[] = [];
  let regionName = "";
  const numericFields = ["classes", "specialClasses", "students", "specialStudents", "entrants", "graduates", "teachers", "counselors", "librarians", "classrooms", "siteArea", "buildingArea"] as const;

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const rawRegion = cell(row, 0);
    const subtotalRegion = REGION_NAMES.find((name) => rawRegion.startsWith(`${name}\n소계`));
    if (subtotalRegion) regionName = subtotalRegion;
    if (REGION_NAMES.includes(rawRegion)) regionName = rawRegion;
    if (cell(row, layout.group) !== "계") continue;
    if (rawRegion.includes("총계") || rawRegion.includes("소계")) continue;
    const name = cell(row, 1);
    if (!name) continue;
    // Special schools repeat the school name at a page break and provide
    // process rows (kindergarten, elementary, middle, high, vocational).
    // Only the 00 total row is a school record.
    if (tableId === 36652 && cell(row, 2) !== "00.전체과정") continue;
    if (!regionName) throw new Error(`${tableId} Sheet1 row ${index + 1}: school region missing`);
    const rawStatus = cell(row, layout.status);
    const status = rawStatus === "폐교" ? "closed" : rawStatus === "기존" || rawStatus === "기존(원)교" ? "active" : null;
    const detailRow = rows[index + 1] ?? [];
    const websiteRow = rows[index + 3] ?? [];
    const address = cell(detailRow, 1);
    const website = cell(websiteRow, 1);
    const counts: Record<string, SourceNumber> = {};
    for (const field of numericFields) counts[field] = parseNumber(cell(row, layout[field]));
    result.push({
      recordId: `gwe-directory-${tableId}:Sheet1!B${index + 1}`,
      sourceId: `gwe-directory-${tableId}`,
      sourceSheet,
      sourceRow: index + 1,
      sourceSchoolIds: {},
      name,
      regionName,
      level: layout.level,
      category: layout.category,
      address: address || null,
      website: website || null,
      establishment: cell(row, layout.level === "elem" ? 3 : layout.level === "mid" ? 5 : layout.level === "special" ? 4 : 6) || null,
      openedAt: cell(row, layout.level === "elem" ? 2 : layout.level === "mid" ? 4 : layout.level === "special" ? 3 : 5) || null,
      rawStatus,
      status,
      // The lack of a branch marker is not evidence that a row is a main school.
      branch: name.includes("분교장") ? true : null,
      branchEvidence: name.includes("분교장") ? "literal-branch-name" : null,
      counts,
    });
  }
  if (!result.length) throw new Error(`${tableId}: no school records`);
  return result;
}

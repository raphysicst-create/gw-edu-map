/** Conservative, pure aggregation over reviewed GWE school-directory records.
 *
 * This does not decide whether any source may be published. Callers must attest
 * each region/level population and resolve source-record duplicates and main
 * school roles separately, with evidence in the publication gate.
 */
import { REGION_NAMES, type SourceNumber } from "./parse";
import type { SchoolDetailRecord } from "./school-details";

export const SCHOOL_INDICATOR_IDS = [
  "students_total", "schools_total", "classes_total", "students_per_class",
  "teachers_total", "students_per_teacher", "site_area_per_student",
  "classrooms_per_school", "small_schools", "small_school_share",
  "zero_entrant_schools", "rural_school_share", "special_classes",
  "special_students", "students_change_5y",
] as const;
export type SchoolIndicatorId = typeof SCHOOL_INDICATOR_IDS[number];
export type Level = SchoolDetailRecord["level"];
export const LEVELS: Level[] = ["elem", "mid", "high", "special"];
export const PROVINCE_NAME = "강원특별자치도";

export type UnavailableReason =
  | "population-unverified" | "record-count-mismatch" | "duplicate-record"
  | "unknown-status" | "unknown-main-role" | "missing-value"
  | "unknown-address-area" | "zero-denominator" | "baseline-unavailable"
  | "scope-mismatch" | "invalid-baseline-year";

/** Expected count includes the original closed records as well as active ones. */
export type CoverageAttestation = {
  regionName: string;
  level: Level;
  complete: boolean;
  expectedRecordCount: number;
};

export type SchoolPopulation = {
  rows: readonly SchoolDetailRecord[];
  year: number;
  /** Same definitions/levels/region boundaries at both observed endpoints. */
  scopeKey: string;
  coverage: readonly CoverageAttestation[];
  /** IDs individually reviewed as main schools; unknowns remain unknown. */
  mainSchoolRecordIds: ReadonlySet<string>;
};

export type AggregateInput = SchoolPopulation & { baseline?: SchoolPopulation };
export type IndicatorCell = {
  indicatorId: SchoolIndicatorId;
  regionName: string;
  level: Level | null;
  year: number;
  baselineYear: number | null;
  scopeKey: string;
  value: number | null;
  reason: UnavailableReason | null;
  sourceRecordCount: number;
};

type Metric = { value: number; reason: null } | { value: null; reason: UnavailableReason };
const ok = (value: number): Metric => ({ value, reason: null });
const missing = (reason: UnavailableReason): Metric => ({ value: null, reason });
const coverageKey = (regionName: string, level: Level) => `${regionName}|${level}`;

function includedRows(population: SchoolPopulation, regionName: string, level: Level | null) {
  return population.rows.filter((row) =>
    (regionName === PROVINCE_NAME || row.regionName === regionName) &&
    (level === null || row.level === level));
}

function populationIssue(population: SchoolPopulation, regionName: string, level: Level | null): UnavailableReason | null {
  const regions = regionName === PROVINCE_NAME ? REGION_NAMES : [regionName];
  const levels = level === null ? LEVELS : [level];
  const byKey = new Map(population.coverage.map((item) => [coverageKey(item.regionName, item.level), item]));
  for (const region of regions) for (const schoolLevel of levels) {
    const attestation = byKey.get(coverageKey(region, schoolLevel));
    if (!attestation?.complete) return "population-unverified";
    if (population.rows.filter((row) => row.regionName === region && row.level === schoolLevel).length !== attestation.expectedRecordCount)
      return "record-count-mismatch";
  }
  const rows = includedRows(population, regionName, level);
  if (new Set(rows.map((row) => row.recordId)).size !== rows.length) return "duplicate-record";
  const names = rows.map((row) => `${row.regionName}|${row.level}|${row.name}`);
  if (new Set(names).size !== names.length) return "duplicate-record";
  if (rows.some((row) => row.status === null)) return "unknown-status";
  return null;
}

function activeRows(population: SchoolPopulation, regionName: string, level: Level | null): SchoolDetailRecord[] {
  return includedRows(population, regionName, level).filter((row) => row.status === "active");
}

function number(row: SchoolDetailRecord, field: string): number | null {
  const source: SourceNumber | undefined = row.counts[field];
  return source?.value ?? null;
}

function sum(rows: readonly SchoolDetailRecord[], field: string): Metric {
  if (rows.some((row) => number(row, field) === null)) return missing("missing-value");
  return ok(rows.reduce((total, row) => total + number(row, field)!, 0));
}

function ratio(numerator: Metric, denominator: Metric, scale = 1): Metric {
  if (numerator.reason) return numerator;
  if (denominator.reason) return denominator;
  if (denominator.value === 0) return missing("zero-denominator");
  return ok(numerator.value! / denominator.value! * scale);
}

function mainRows(population: SchoolPopulation, rows: readonly SchoolDetailRecord[]): { rows: SchoolDetailRecord[]; issue: UnavailableReason | null } {
  if (rows.some((row) => row.branch === true && population.mainSchoolRecordIds.has(row.recordId)))
    return { rows: [], issue: "unknown-main-role" };
  const unknown = rows.some((row) => row.branch !== true && !population.mainSchoolRecordIds.has(row.recordId));
  if (unknown) return { rows: [], issue: "unknown-main-role" };
  return { rows: rows.filter((row) => population.mainSchoolRecordIds.has(row.recordId)), issue: null };
}

/** True only for an explicit `면` token in the original official address. */
function ruralStatus(row: SchoolDetailRecord): boolean | null {
  if (row.officialAreaType === "면") return true;
  if (row.officialAreaType === "시" || row.officialAreaType === "읍") return false;
  // `특수지역` does not establish whether the address is an 읍 or 면.
  if (!row.address) return null;
  const address = row.address.replace(/^\(\d{5}\s*\)\s*/, "").trim();
  const prefix = /^(?:강원특별자치도|강원도)?\s*([^\s]+[시군])\s+([^\s]+)/.exec(address);
  if (!prefix || prefix[1] !== row.regionName) return null;
  const subdivision = prefix[2];
  if (subdivision.endsWith("면")) return true;
  if (subdivision.endsWith("읍") || subdivision.endsWith("동")) return false;
  // City road addresses often omit the legal dong. Without an explicit
  // administrative token the rural/non-rural split is not established.
  return null;
}

function computeCurrent(id: SchoolIndicatorId, population: SchoolPopulation, regionName: string, level: Level | null): Metric {
  const issue = populationIssue(population, regionName, level);
  if (issue) return missing(issue);
  const active = activeRows(population, regionName, level);
  const main = () => mainRows(population, active);
  switch (id) {
    case "students_total": return sum(active, "students");
    case "classes_total": return sum(active, "classes");
    case "teachers_total": return sum(active, "teachers");
    case "special_classes": return sum(active, "specialClasses");
    case "special_students": return sum(active, "specialStudents");
    case "students_per_class": return ratio(sum(active, "students"), sum(active, "classes"));
    case "students_per_teacher": return ratio(sum(active, "students"), sum(active, "teachers"));
    case "site_area_per_student": return ratio(sum(active, "siteArea"), sum(active, "students"));
    case "schools_total": {
      const selected = main();
      return selected.issue ? missing(selected.issue) : ok(selected.rows.length);
    }
    case "classrooms_per_school": {
      const selected = main();
      // The registry definition uses all operating classrooms over main schools.
      // Publication review must establish that branch facilities are not duplicated.
      return selected.issue ? missing(selected.issue) : ratio(sum(active, "classrooms"), ok(selected.rows.length));
    }
    case "small_schools":
    case "small_school_share":
    case "zero_entrant_schools":
    case "rural_school_share": {
      const selected = main();
      if (selected.issue) return missing(selected.issue);
      const mainSchools = selected.rows;
      if (id === "rural_school_share") {
        const areas = mainSchools.map(ruralStatus);
        if (areas.some((area) => area === null)) return missing("unknown-address-area");
        return ratio(ok(areas.filter(Boolean).length), ok(mainSchools.length), 100);
      }
      const field = id === "zero_entrant_schools" ? "entrants" : "students";
      if (mainSchools.some((row) => number(row, field) === null)) return missing("missing-value");
      const selectedCount = mainSchools.filter((row) => id === "zero_entrant_schools" ? number(row, field) === 0 : number(row, field)! <= 60).length;
      return id === "small_school_share" ? ratio(ok(selectedCount), ok(mainSchools.length), 100) : ok(selectedCount);
    }
    case "students_change_5y": throw new Error("students_change_5y requires the baseline branch");
  }
}

function computeChange(input: AggregateInput, regionName: string, level: Level | null): Metric {
  const baseline = input.baseline;
  if (!baseline) return missing("baseline-unavailable");
  if (!Number.isInteger(baseline.year) || baseline.year >= input.year) return missing("invalid-baseline-year");
  if (baseline.scopeKey !== input.scopeKey) return missing("scope-mismatch");
  const before = computeCurrent("students_total", baseline, regionName, level);
  const after = computeCurrent("students_total", input, regionName, level);
  if (before.reason) return before;
  if (after.reason) return after;
  return ratio(ok(after.value! - before.value!), before, 100);
}

/** All 18 시군 + province, each with an all-level and four level slices. */
export function aggregateGangwonSchoolIndicators(input: AggregateInput): IndicatorCell[] {
  const cells: IndicatorCell[] = [];
  for (const regionName of [...REGION_NAMES, PROVINCE_NAME]) {
    for (const level of [null, ...LEVELS] as (Level | null)[]) {
      for (const indicatorId of SCHOOL_INDICATOR_IDS) {
        const metric = indicatorId === "students_change_5y"
          ? computeChange(input, regionName, level)
          : computeCurrent(indicatorId, input, regionName, level);
        cells.push({
          indicatorId, regionName, level, year: input.year,
          baselineYear: indicatorId === "students_change_5y" ? input.baseline?.year ?? null : null,
          scopeKey: input.scopeKey, value: metric.value, reason: metric.reason,
          sourceRecordCount: includedRows(input, regionName, level).length,
        });
      }
    }
  }
  return cells;
}

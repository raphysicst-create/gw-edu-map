/**
 * Pure TypeScript types for the indicator registry and data pipeline.
 *
 * IMPORTANT: this module (and everything under src/lib/indicators/) must stay
 * free of React/Next imports. It is imported both by client components and by
 * plain Node pipeline scripts (via tsx, using relative imports only).
 */

/** The four dashboard groupings a KPI card / legend can belong to. */
export type IndicatorGroup = "scale" | "smallSchool" | "teacherInfra" | "vulnerable";

/** Whether a higher value reads as better, worse, or neutral on the map. */
export type Polarity = "higherBetter" | "higherWorse" | "neutral";

/** School-level education stage, mapped from the KESS `학교급` column. */
export type SchoolLevel = "elem" | "mid" | "high" | "special";

/**
 * Numeric fields available on a normalized SchoolRow that an indicator's
 * `sum` / `ratio` aggregate can reference.
 */
export type SchoolField =
  | "students"
  | "classes"
  | "teachers"
  | "staff"
  | "entrants"
  | "graduates"
  | "specialClasses"
  | "specialStudents"
  | "classrooms"
  | "siteArea"
  | "isMain";

/** Boolean conditions over a SchoolRow that `count` / `share` aggregates use. */
export type SchoolPredicate = "small" | "zeroEntrants" | "ruralArea" | "isMain";

/**
 * Declarative aggregation rule. The pipeline (`scripts/pipeline/lib/aggregate.ts`)
 * turns any one of these into 14 시군 rows + a province-wide (52000) row, with no
 * indicator-specific code required.
 */
export type Aggregate =
  | { kind: "sum"; field: SchoolField }
  | { kind: "ratio"; numerator: SchoolField; denominator: SchoolField }
  | { kind: "count"; predicate: SchoolPredicate }
  | { kind: "share"; predicate: SchoolPredicate }
  | { kind: "external"; file: string; field: string };

export interface IndicatorSource {
  name: string;
  url: string;
  year: number;
}

export interface IndicatorDef {
  id: string;
  group: IndicatorGroup;
  label: string;
  shortLabel?: string;
  unit: string;
  polarity: Polarity;
  kind: "count" | "ratio";
  /** Color/height scale hint for the map layer. Defaults to 'linear'. */
  scale?: "linear" | "sqrt";
  /** Fixed value domain override. Defaults to the 14 시군 min/max (52000 excluded), floored at 0. */
  domain?: [number, number];
  /** When true, the pipeline also emits per-SchoolLevel rows (level: 'elem'|'mid'|'high'|'special'). */
  byLevel?: boolean;
  format: (value: number) => string;
  source: IndicatorSource;
  aggregate: Aggregate;
  /**
   * 1~2 sentence, policy-oriented "how to read this" caption (Task 5, Section
   * C) — shown small next to the indicator's radio in IndicatorMenu's popover
   * and in Legend. Required on every registry entry (not optional): a KPI
   * with no stated reading direction is the exact gap this task closes.
   */
  description: string;
  /**
   * Optional caveat/definition note (e.g. a threshold, an excluded
   * population, or a comparison-window clarification) — shown alongside
   * `description` wherever it renders. Omitted when the indicator needs no
   * extra caveat beyond its description.
   */
  caveat?: string;
}

/** One region's value for a single indicator/year. `level` is set only for byLevel breakdown rows. */
export interface IndicatorRow {
  regionCode: string;
  value: number | null;
  level?: SchoolLevel;
}

/** Snapshot file written to public/data/indicators/<id>.json (latest year only). */
export interface IndicatorFile {
  id: string;
  year: number;
  referenceDate: string;
  source: IndicatorSource;
  rows: IndicatorRow[];
}

/** Multi-year trend file written to public/data/series/<id>.json (all available years). */
export interface SeriesFile {
  id: string;
  rows: { regionCode: string; year: number; value: number | null }[];
}

/**
 * One entry of manifest.json's `sources[]` (Task 5, Section C) — the single
 * place Footer.tsx reads every data source's name/link/reference date from,
 * so no date string is ever hardcoded into a component. `publishedAt` is set
 * only when a source's 공공데이터포털 게시(갱신)일 differs from its own
 * referenceDate (currently: 폐교재산 현황 only — see the "날짜기준 규칙").
 */
export interface ManifestSource {
  providerName?: string;
  name: string;
  url: string;
  referenceDate: string;
  publishedAt?: string;
}

/** Written to public/data/manifest.json; tells the UI which years exist per indicator. */
export interface Manifest {
  latestYear: number;
  indicators: Record<string, { years: number[] }>;
  builtAt: string;
  /** Every named data source (KESS, 학교 위치, 폐교재산, 경계) — see ManifestSource. */
  sources: ManifestSource[];
}

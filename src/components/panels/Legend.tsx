import type { RGB } from "@/lib/colors";
import { NULL_COLOR } from "@/lib/colors";
import type { IndicatorDef } from "@/lib/indicators/types";
import {
  SCHOOL_LEVEL_COLORS,
  SCHOOL_LEVEL_LABELS,
  SCHOOL_LEVEL_ORDER,
} from "@/lib/schoolVisuals";

export interface LegendProps {
  def: IndicatorDef;
  /** Domain ends + 4 interior quantize thresholds (6 values), as returned by makeColorScale(). */
  ticks: number[];
  /** The 5 palette colors, in the same order as the buckets ticks[i]..ticks[i+1]. */
  palette: RGB[];
  hasNull: boolean;
  /**
   * The indicator file's referenceDate (e.g. "2026-04-01"). Not part of
   * IndicatorDef (that's a registry-only type; referenceDate is a per-file
   * runtime field) — Dashboard.tsx reads it off bundle.indicators[id] and
   * passes it through.
   */
  referenceDate: string;
  /** Task 4B — true whenever a 시군 is selected (the school layer is then visible on the map), adding the 4 학교급 color swatches to the legend. Defaults to false (no school layer without a selection). */
  schoolLevelsVisible?: boolean;
  /** fix round, review finding #4 — true only when the SELECTED region itself has at least one school with no coordinate (lat == null, i.e. a 특수학교 row — see School.locationMissingReason). Gates the "(특수학교는 위치 자료 없음)" caveat so it isn't shown for a region where every school actually has a point on the map. Defaults to false. */
  hasSchoolsWithoutLocation?: boolean;
  /** Task 6, Section C-추가 #5 — which bucket rule produced `ticks`/the map's actual colors (see makeColorScale's `ColorScale.colorBuckets`). Defaults to 'linear' (no note) — pass 'quantile' to add a "색 구간: 고유값 5분위" note, e.g. for a count-kind indicator's skewed 14-시군 distribution. */
  colorBuckets?: "linear" | "quantile";
}

function rgbCss([r, g, b]: readonly number[]): string {
  return `rgb(${r}, ${g}, ${b})`;
}

/** Bottom-bar legend: 5 color swatches + boundary values, a missing-data swatch, a one-line scale caveat, and the data source/reference date. When `schoolLevelsVisible`, also shows the 4 학교급 point colors (Task 4B). */
export default function Legend({
  def,
  ticks,
  palette,
  hasNull,
  referenceDate,
  schoolLevelsVisible = false,
  hasSchoolsWithoutLocation = false,
  colorBuckets = "linear",
}: LegendProps) {
  // This legend describes the statistics panel, not marker height or size.
  const notes: string[] = [
    colorBuckets === "quantile" ? "시군별 통계 색 구간" : "색 구간: 등간격",
  ];

  // Covers both of the brief's sub-conditions (an explicit def.domain override,
  // or a ratio-kind indicator whose data minimum isn't 0) with one check: in
  // either case the resulting scale's lower bound (ticks[0]) simply isn't 0.
  if (ticks[0] !== 0) notes.push("기준선 ≠ 0");
  // Task 6, Section C-추가 #5 — count-kind indicators' color buckets are
  // quantile (rank-based), not the equal-width linear split the base note
  // implies for color; this note prevents that misreading without changing
  // the (still-linear) height encoding. Fix round 2, finding 9 — reworded
  // "색 구간: 5분위" to "색 구간: 고유값 5분위" ("5분위 of DISTINCT values"): the
  // quantile split is computed over the deduplicated distinct values (see
  // colors.ts's makeColorScale doc comment), not literally 5 equal-COUNT
  // slices of the raw 14-시군 array, so the plain "5분위" wording could be
  // misread as the latter.
  if (colorBuckets === "quantile") notes.push("색 구간: 고유값 5분위");

  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-ink-muted">
      <span className="flex shrink-0 flex-col">
        <span
          className="text-sm font-semibold text-ink"
          data-testid="legend-indicator-label"
        >
          {def.label}
        </span>
        <span
          className="max-w-[280px] text-[10px] leading-snug text-ink-muted"
          data-testid="legend-description"
        >
          {def.description}
        </span>
      </span>

      <div className="flex items-end gap-0.5">
        {palette.map((rgb, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <span
              data-testid="legend-swatch"
              className="h-3 w-7 ring-1 ring-inset ring-ink/10"
              style={{ backgroundColor: rgbCss(rgb) }}
              aria-hidden
            />
            <span className="tabular-nums text-[10px] text-ink-muted">
              {def.format(ticks[i])}
            </span>
          </div>
        ))}
        <span className="pb-[18px] tabular-nums text-[10px] text-ink-muted">
          {def.format(ticks[ticks.length - 1])}
        </span>
        {hasNull && (
          <div className="ml-2 flex flex-col items-center gap-1">
            <span
              data-testid="legend-null-swatch"
              className="h-3 w-7 ring-1 ring-inset ring-ink/10"
              style={{ backgroundColor: rgbCss(NULL_COLOR) }}
              aria-hidden
            />
            <span className="text-[10px] text-ink-muted">자료 없음</span>
          </div>
        )}
      </div>

      {schoolLevelsVisible && (
        <div className="flex items-center gap-2 border-l border-line pl-4">
          <span className="shrink-0 text-[10px] text-ink-muted">학교</span>
          {SCHOOL_LEVEL_ORDER.map((level) => {
            const [r, g, b] = SCHOOL_LEVEL_COLORS[level];
            return (
              <span key={level} className="flex items-center gap-1">
                <span
                  data-testid="legend-school-swatch"
                  className="h-2.5 w-2.5 rounded-full ring-1 ring-inset ring-ink/10"
                  style={{ backgroundColor: rgbCss([r, g, b]) }}
                  aria-hidden
                />
                <span className="text-[10px] text-ink-muted">
                  {SCHOOL_LEVEL_LABELS[level]}
                </span>
              </span>
            );
          })}
          {hasSchoolsWithoutLocation && (
            <span className="text-[10px] text-ink-muted">
              (좌표 미확보 학교는 지도 점에서 제외)
            </span>
          )}
        </div>
      )}

      <p>{notes.join(" · ")}</p>

      <a
        href={def.source.url}
        target="_blank"
        rel="noreferrer"
        className="underline decoration-dotted underline-offset-2 hover:text-ink"
      >
        {def.source.name}
      </a>
      <span>기준일 {referenceDate}</span>
    </div>
  );
}

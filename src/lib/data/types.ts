/**
 * The shape of everything DataProvider loads once at startup. No React
 * import — plain data types shared by load.ts, DataProvider.tsx, and every
 * component that reads from useBundle().
 */
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";

import type { ClosedSchoolsFile } from "../closedSchools/types";
import type { RegionsFeatureCollection } from "../geo/geo";
import type { IndicatorFile, SeriesFile } from "../indicators/types";
import type { PublishedManifest } from "./release";
import type { SchoolsFile } from "../schools/types";

// Re-exported (not redefined) — `RegionFeature`/`RegionsFeatureCollection`'s
// single source of truth is src/lib/geo/geo.ts, which also hosts
// `splitRegionIslands` (Task 6, Section C.1) and needs the type itself;
// data/types.ts importing it the other way around (from geo.ts) keeps the
// dependency one-directional.
export type { RegionsFeatureCollection };

export type NeighborsFeatureCollection = FeatureCollection<
  Polygon | MultiPolygon,
  { code: string; name: string }
>;

export interface DataBundle {
  regions: RegionsFeatureCollection;
  neighbors: NeighborsFeatureCollection;
  /**
   * The raw charset string (not yet split into characters) — this is what
   * 추가 요구 #6's font gate loads/checks directly (`document.fonts.load(...,
   * bundle.charset)`). Callers that need deck.gl TextLayer's `characterSet:
   * string[]` prop (labelLayer.ts) derive it via `Array.from(bundle.charset)`
   * at the point of use (see DeckMap.tsx) rather than storing both shapes
   * here.
   */
  charset: string;
  manifest: PublishedManifest;
  /** Task 4B — 전북 학교 점 위치 + KESS 통계 (school-level layer/panel data). */
  schools: SchoolsFile;
  /** Task 5 — 전북 폐교재산 현황 row list, backing RegionPanel's 폐교 목록 section (the closed_schools* indicator files only carry aggregated counts, not row-level 폐교명/연도/급/활용현황). */
  closedSchools: ClosedSchoolsFile | null;
  indicators: Partial<Record<string, IndicatorFile>>;
  /**
   * Keyed by indicator id, but NOT guaranteed to have an entry for every
   * registry id: indicators with `aggregate.kind === 'external'` (currently
   * only students_change_5y) have no series/<id>.json file at all — see
   * build-indicators.ts, which explicitly skips writing one — so load.ts
   * doesn't fetch one either. Code that needs a specific series (e.g.
   * stats.ts's changeYearRange over series.students_total) must handle a
   * missing entry.
   */
  series: Record<string, SeriesFile>;
}

/**
 * Task 6, Section C.1 — `DataBundle` plus the once-derived main/island
 * region splits (see `splitRegionIslands` in geo.ts). `load.ts`/
 * `assertBundle` keep working with the plain `DataBundle` shape (they run
 * BEFORE this derivation) — `DataProvider.tsx` computes `regionsMain`/
 * `regionsIslands` exactly once, right after a successful load, and is what
 * actually lands in its "ready" state; `useBundle()` (and therefore every
 * consumer — DeckMap, MapFallback, etc.) receives THIS type.
 */
export interface EnrichedDataBundle extends DataBundle {
  /** Every region's largest-area part only — what the extruded `regions` layer renders. Always exactly REGION_CODES.length features, one per region, in the original order. */
  regionsMain: RegionsFeatureCollection;
  /** Every region's remaining (non-largest) parts, if any — what the flat `region-islands` layer renders. Only regions that actually have extra parts appear here at all. */
  regionsIslands: RegionsFeatureCollection;
}

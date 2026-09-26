import { FlyToInterpolator, WebMercatorViewport } from "@deck.gl/core";

import type { Bbox } from "@/lib/geo/geo";
import { GANGWON_VIEW } from "@/lib/profiles/gangwon";

// Preserve the geometry helpers used by legacy camera tests; the app uses road only.
type MapDisplayMode = "road" | "terrain";

export const OVERVIEW_PITCH = 56;
// 사용자 요구(2026-09-21): 지도는 항상 북쪽이 위 — 회전 없음. bearing 은 0 으로 고정되고
// CONTROLLER 가 drag/touch 회전을 모두 끈다(아래).
export const OVERVIEW_BEARING = 0;

export const VIEW_LIMITS = {
  minZoom: GANGWON_VIEW.minZoom,
  maxZoom: 14,
  minPitch: 0,
  maxPitch: 72,
} as const;

// deck.gl 9.4's MapController accepts `maxBounds`/`rubberBand` directly (see
// ControllerOptions in @deck.gl/core/dist/controllers/controller.d.ts) — no
// type augmentation needed.
export const CONTROLLER = {
  // 사용자 요구(2026-09-21): 좌클릭 드래그 = 이동, 스크롤 = 줌만. 회전·기울기
  // 변경은 어떤 입력으로도 불가(우클릭·Shift 드래그·두 손가락 회전·키보드).
  // 트랙패드 두 손가락 스와이프가 브라우저 뒤로가기로 새는 문제는
  // globals.css 의 overscroll-behavior 와 DeckMap 의 onContextMenu 가 막는다.
  dragPan: true,
  dragRotate: false,
  touchRotate: false,
  scrollZoom: true,
  doubleClickZoom: false,
  keyboard: false,
  inertia: 300,
  maxBounds: [
    [GANGWON_VIEW.extent[0], GANGWON_VIEW.extent[1]],
    [GANGWON_VIEW.extent[2], GANGWON_VIEW.extent[3]],
  ] as [[number, number], [number, number]],
  rubberBand: true,
};

type Size = { width: number; height: number };
type LngLat = readonly [number, number];
/**
 * A ground point for containment/projection purposes, with an OPTIONAL
 * elevation (meters, world/common space — same units as a layer's
 * `getElevation`/z coordinate). `z` defaults to 0 when omitted, so every
 * existing flat `LngLat` (a bbox corner, a label point) is already a valid
 * `FitPoint` with no call-site changes needed — see `fitOverview`, which
 * still hands `fitViewToPoints` plain 2-tuples.
 */
type FitPoint = readonly [number, number, number?];

function bboxCorners(bbox: Bbox): LngLat[] {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  return [
    [minLng, minLat],
    [maxLng, minLat],
    [maxLng, maxLat],
    [minLng, maxLat],
  ];
}

/**
 * `bboxCorners(bbox)`, repeated at each given elevation — e.g.
 * `bboxCorners3D(bbox, [0, maxElevation])` yields the 8 points (4 ground +
 * 4 top-face corners) `fitRegion` below fits the camera to, so a tall
 * region's top face is provably on-screen after selection, not just its
 * flat footprint (see `fitRegion`'s own doc comment for why).
 */
function bboxCorners3D(bbox: Bbox, elevations: readonly number[]): FitPoint[] {
  const flat = bboxCorners(bbox);
  return elevations.flatMap((z) => flat.map(([lng, lat]): FitPoint => [lng, lat, z]));
}

export interface FitViewOptions {
  pitch: number;
  bearing: number;
  /** Minimum on-screen distance (px) from every point to the canvas edge. */
  padding: number;
  minZoom: number;
  maxZoom: number;
}

type FitResult = { longitude: number; latitude: number; zoom: number };

function isContained(
  viewport: WebMercatorViewport,
  points: readonly FitPoint[],
  size: Size,
  padding: number,
): boolean {
  for (const point of points) {
    const [x, y] = viewport.project([point[0], point[1], point[2] ?? 0]);
    if (x < padding || x > size.width - padding || y < padding || y > size.height - padding) {
      return false;
    }
  }
  return true;
}

/**
 * Fits a camera to a set of ground points (e.g. a bbox's corners, plus any
 * label anchor points that must also stay on-screen) at a *fixed, non-zero*
 * pitch/bearing.
 *
 * `WebMercatorViewport.fitBounds()` is flat-only (its own type doc says
 * "Only supports non-perspective mode": it always computes for pitch 0 /
 * bearing 0, regardless of what's passed into the constructor beforehand —
 * verified directly against @deck.gl/core 9.4.0). Tilting and rotating the
 * camera afterward, uncompensated, changes what's actually visible within
 * the same frustum — corners of the flat-fit bbox can end up clipped outside
 * the canvas. This function starts from that flat fit as a reasonable
 * initial guess, then iteratively corrects for the pitch/bearing by
 * projecting every input point through a *pitched* viewport and:
 *   1. zooming out (in 0.05 steps, down to `minZoom`) until every point's
 *      projected pixel position falls within the padded frame, then
 *   2. re-centering on the pixel-space bounding-box center of the
 *      (now-contained) projected points, by unprojecting that pixel back to
 *      a ground [lng, lat] and using it as the new camera target.
 * Steps 1-2 together are one "pass"; a handful of passes converge quickly in
 * practice (re-centering shifts the projected pixel positions only a little
 * each time) — capped at 3 passes regardless.
 *
 * Task B — `points` may carry an elevation (`FitPoint`'s optional 3rd
 * element, z, meters, defaults to 0): a point with z>0 projects to a
 * DIFFERENT screen position than the ground point directly below it once
 * `pitch` is non-zero, so `fitRegion`'s top-face corners (below) genuinely
 * need their own containment check, not just the flat footprint's.
 */
export function fitViewToPoints(points: readonly FitPoint[], size: Size, opts: FitViewOptions): FitResult {
  const { pitch, bearing, padding, minZoom, maxZoom } = opts;

  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of points) {
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  }

  const flat = new WebMercatorViewport({ width: size.width, height: size.height }).fitBounds(
    [
      [minLng, minLat],
      [maxLng, maxLat],
    ],
    { padding },
  );

  let longitude = flat.longitude;
  let latitude = flat.latitude;
  let zoom = Math.min(flat.zoom, maxZoom);

  const RECENTER_PASSES = 3;
  const ZOOM_STEP = 0.05;

  for (let pass = 0; pass < RECENTER_PASSES; pass++) {
    let viewport = new WebMercatorViewport({ width: size.width, height: size.height, longitude, latitude, zoom, pitch, bearing });

    while (!isContained(viewport, points, size, padding)) {
      if (zoom <= minZoom) break;
      zoom = Math.max(minZoom, zoom - ZOOM_STEP);
      viewport = new WebMercatorViewport({ width: size.width, height: size.height, longitude, latitude, zoom, pitch, bearing });
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const point of points) {
      const [x, y] = viewport.project([point[0], point[1], point[2] ?? 0]);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    const [newLng, newLat] = viewport.unproject([(minX + maxX) / 2, (minY + maxY) / 2]);
    longitude = newLng;
    latitude = newLat;
  }

  return { longitude, latitude, zoom };
}

/** The subset of a deck.gl MapViewState this module produces. */
type OverviewViewState = {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
} & Omit<typeof VIEW_LIMITS, "maxZoom"> & { maxZoom: number };

/**
 * Computes the camera view state that frames `bbox` (e.g. `unionBbox` of all
 * 14 regions) and every region's label point in the overview camera style
 * (pitch 56 / bearing 0, 북쪽 고정), used for DeckMap's initial (uncontrolled)
 * `initialViewState`. Label points are included (not just the bbox corners)
 * because a region's tallest/farthest label can otherwise land outside the
 * frame even when the polygon bbox itself just barely fits.
 */
export function fitOverview(bbox: Bbox, labelPoints: readonly LngLat[], size: Size, mode: MapDisplayMode = "terrain"): OverviewViewState {
  const points = [...bboxCorners(bbox), ...labelPoints];
  const { longitude, latitude, zoom } = fitViewToPoints(points, size, {
    pitch: mode === "road" ? 0 : OVERVIEW_PITCH,
    bearing: OVERVIEW_BEARING,
    padding: 60,
    minZoom: VIEW_LIMITS.minZoom,
    maxZoom: VIEW_LIMITS.maxZoom,
  });
  return {
    longitude,
    latitude,
    zoom,
    pitch: mode === "road" ? 0 : OVERVIEW_PITCH,
    bearing: OVERVIEW_BEARING,
    ...VIEW_LIMITS,
    maxZoom: mode === "road" ? 18 : 14,
  };
}

type RegionViewState = OverviewViewState & {
  transitionInterpolator: FlyToInterpolator;
  transitionDuration: "auto";
};

const FIT_REGION_PITCH = 58;

export interface FitRegionOptions {
  mode?: MapDisplayMode;
  /**
   * Task B — the region top-face height CEILING (meters, same units as
   * `getElevation`) to also frame, e.g. `ELEVATION_MAX` (src/lib/scales.ts).
   * Deliberately a fixed constant, not the region's CURRENT (indicator-
   * dependent) height: `flyTo` (useCamera.ts) only re-fits the camera when
   * `selectedCode` changes, not on every indicator switch — fitting to the
   * tallest a bar can EVER get keeps the same fitted camera valid (top face
   * still on-screen) no matter which indicator the user picks afterward,
   * without needing to re-fly. Omitted/0 -> ground-only containment (the
   * pre-Task-B behavior).
   */
  maxElevation?: number;
}

/**
 * Computes the camera view state that flies to a single selected region's
 * bbox (pitch 58, closer padding, capped zoom). Wired up by useCamera.ts's
 * `flyTo`, called whenever `selectedCode` changes (or is re-selected).
 *
 * Task B — height-aware containment: checks all 8 points (the bbox's 4
 * corners at BOTH z=0 and z=`opts.maxElevation`), not just the flat 4-point
 * footprint — see `FitRegionOptions.maxElevation`'s doc comment for why a
 * ground-only fit isn't enough once the camera is pitched.
 */
export function fitRegion(bbox: Bbox, size: Size, opts?: FitRegionOptions): RegionViewState {
  const mode = opts?.mode ?? "terrain";
  const maxElevation = mode === "road" ? 0 : opts?.maxElevation ?? 0;
  const points = bboxCorners3D(bbox, [0, maxElevation]);
  const { longitude, latitude, zoom } = fitViewToPoints(points, size, {
    pitch: mode === "road" ? 0 : FIT_REGION_PITCH,
    bearing: OVERVIEW_BEARING,
    padding: 80,
    minZoom: VIEW_LIMITS.minZoom,
    maxZoom: 12,
  });
  return {
    longitude,
    latitude,
    zoom,
    pitch: mode === "road" ? 0 : FIT_REGION_PITCH,
    bearing: OVERVIEW_BEARING,
    ...VIEW_LIMITS,
    maxZoom: mode === "road" ? 18 : 14,
    transitionInterpolator: new FlyToInterpolator({ speed: 1.5 }),
    transitionDuration: "auto",
  };
}

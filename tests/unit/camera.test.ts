import { describe, expect, it } from "vitest";
import { WebMercatorViewport } from "@deck.gl/core";

import {
  CONTROLLER,
  fitOverview,
  fitRegion,
  fitViewToPoints,
  OVERVIEW_BEARING,
  OVERVIEW_PITCH,
  VIEW_LIMITS,
} from "@/components/map/camera";
import { ELEVATION_MAX } from "@/lib/scales";

// Synthetic extent spanning Gangwon's east-west and north-south range.
const GANGWON_BBOX: [number, number, number, number] = [127.0, 36.9, 129.5, 38.6];
const SIZE = { width: 1600, height: 900 };
const PADDING = 60;

function bboxCorners([minLng, minLat, maxLng, maxLat]: [number, number, number, number]) {
  return [
    [minLng, minLat],
    [maxLng, minLat],
    [maxLng, maxLat],
    [minLng, maxLat],
  ] as const;
}

/** Projects every point (optionally 3D — `[lng, lat, z]`, z defaults to 0) through a viewport built from `viewState` and asserts it's within the padded frame. */
function expectAllContained(
  points: readonly (readonly [number, number] | readonly [number, number, number])[],
  viewState: { longitude: number; latitude: number; zoom: number; pitch: number; bearing: number },
  size: typeof SIZE,
  padding: number,
) {
  const viewport = new WebMercatorViewport({
    width: size.width,
    height: size.height,
    longitude: viewState.longitude,
    latitude: viewState.latitude,
    zoom: viewState.zoom,
    pitch: viewState.pitch,
    bearing: viewState.bearing,
  });
  for (const point of points) {
    const [x, y] = viewport.project([point[0], point[1], point[2] ?? 0]);
    expect(x).toBeGreaterThanOrEqual(padding);
    expect(x).toBeLessThanOrEqual(size.width - padding);
    expect(y).toBeGreaterThanOrEqual(padding);
    expect(y).toBeLessThanOrEqual(size.height - padding);
  }
}

describe("fitViewToPoints", () => {
  it("keeps every corner of a synthetic bbox inside the padded frame at an arbitrary pitch (50) / bearing -15", () => {
    const corners = bboxCorners(GANGWON_BBOX);
    const result = fitViewToPoints(corners, SIZE, {
      pitch: 50,
      bearing: -15,
      padding: PADDING,
      minZoom: VIEW_LIMITS.minZoom,
      maxZoom: VIEW_LIMITS.maxZoom,
    });

    expect(result.zoom).toBeGreaterThanOrEqual(VIEW_LIMITS.minZoom);
    expect(result.zoom).toBeLessThanOrEqual(VIEW_LIMITS.maxZoom);
    expectAllContained(corners, { ...result, pitch: 50, bearing: -15 }, SIZE, PADDING);
  });

  it("does not exceed maxZoom even for a single (degenerate) point", () => {
    const result = fitViewToPoints([[127.1, 35.8]], SIZE, {
      pitch: 50,
      bearing: -15,
      padding: PADDING,
      minZoom: VIEW_LIMITS.minZoom,
      maxZoom: VIEW_LIMITS.maxZoom,
    });
    expect(result.zoom).toBeLessThanOrEqual(VIEW_LIMITS.maxZoom);
    expect(Number.isFinite(result.longitude)).toBe(true);
    expect(Number.isFinite(result.latitude)).toBe(true);
  });
});

describe("fitOverview", () => {
  it("returns a finite zoom within [minZoom, maxZoom]", () => {
    const viewState = fitOverview(GANGWON_BBOX, [], SIZE);
    expect(Number.isFinite(viewState.zoom)).toBe(true);
    expect(viewState.zoom).toBeGreaterThanOrEqual(VIEW_LIMITS.minZoom);
    expect(viewState.zoom).toBeLessThanOrEqual(VIEW_LIMITS.maxZoom);
  });

  it("returns finite longitude/latitude roughly centered on the bbox", () => {
    const viewState = fitOverview(GANGWON_BBOX, [], SIZE);
    expect(Number.isFinite(viewState.longitude)).toBe(true);
    expect(Number.isFinite(viewState.latitude)).toBe(true);
    expect(viewState.longitude).toBeGreaterThan(GANGWON_BBOX[0]);
    expect(viewState.longitude).toBeLessThan(GANGWON_BBOX[2]);
    expect(viewState.latitude).toBeGreaterThan(GANGWON_BBOX[1]);
    expect(viewState.latitude).toBeLessThan(GANGWON_BBOX[3]);
  });

  it("uses the fixed overview pitch/bearing and view limits", () => {
    const viewState = fitOverview(GANGWON_BBOX, [], SIZE);
    expect(viewState.pitch).toBe(OVERVIEW_PITCH);
    expect(viewState.bearing).toBe(OVERVIEW_BEARING);
    expect(viewState.minZoom).toBe(VIEW_LIMITS.minZoom);
    expect(viewState.maxZoom).toBe(VIEW_LIMITS.maxZoom);
    expect(viewState.minPitch).toBe(VIEW_LIMITS.minPitch);
    expect(viewState.maxPitch).toBe(VIEW_LIMITS.maxPitch);
  });

  it("keeps the bbox corners AND every label point inside the padded canvas (the acceptance bar: nothing clipped)", () => {
    // Synthetic label points at or near the Gangwon bbox edges.
    const labelPoints: [number, number][] = [
      [GANGWON_BBOX[0] + 0.02, GANGWON_BBOX[1] + 0.02],
      [GANGWON_BBOX[2] - 0.02, GANGWON_BBOX[3] - 0.02],
      [127.5, 38.1],
      [129.1, 37.4],
      [128.2, 37.8], // interior
    ];
    const viewState = fitOverview(GANGWON_BBOX, labelPoints, SIZE);
    expectAllContained([...bboxCorners(GANGWON_BBOX), ...labelPoints], viewState, SIZE, 60);
  });
});

describe("fitRegion", () => {
  const REGION_BBOX: [number, number, number, number] = [127.7, 37.8, 127.95, 38.0]; // synthetic ~춘천시

  it("returns a finite zoom, pitch 58, and a fly-to transition", () => {
    const viewState = fitRegion(REGION_BBOX, SIZE);
    expect(Number.isFinite(viewState.zoom)).toBe(true);
    expect(viewState.pitch).toBe(58);
    expect(viewState.transitionDuration).toBe("auto");
    expect(viewState.transitionInterpolator).toBeDefined();
  });

  it("keeps the region's ground (z=0) bbox corners inside the padded canvas at pitch 58, with no maxElevation given", () => {
    const viewState = fitRegion(REGION_BBOX, SIZE);
    expectAllContained(bboxCorners(REGION_BBOX), viewState, SIZE, 80);
  });

  // Task B — height-aware fit: a tall region's TOP face can project further
  // up-screen than its ground footprint once the camera is pitched (a
  // z>0 point projects to a different pixel than the z=0 point directly
  // beneath it) — so containment must be checked at both z=0 AND
  // z=maxElevation, not just the flat footprint. `opts.maxElevation` is a
  // CONSTANT ceiling (e.g. `ELEVATION_MAX`), not the region's current
  // (indicator-dependent) height, precisely so this same fitted camera still
  // frames the top face correctly after the user switches indicators
  // without the camera re-flying.
  it("keeps all 8 points (4 ground corners z=0 + 4 top corners z=maxElevation) inside the padded canvas", () => {
    const viewState = fitRegion(REGION_BBOX, SIZE, { maxElevation: ELEVATION_MAX });
    const ground = bboxCorners(REGION_BBOX).map(([lng, lat]) => [lng, lat, 0] as const);
    const top = bboxCorners(REGION_BBOX).map(([lng, lat]) => [lng, lat, ELEVATION_MAX] as const);
    expectAllContained([...ground, ...top], viewState, SIZE, 80);
  });

  it("still keeps the 4 top corners (z=ELEVATION_MAX) contained on their own, the ones most likely to clip at the top edge when pitched", () => {
    const viewState = fitRegion(REGION_BBOX, SIZE, { maxElevation: ELEVATION_MAX });
    const top = bboxCorners(REGION_BBOX).map(([lng, lat]) => [lng, lat, ELEVATION_MAX] as const);
    expectAllContained(top, viewState, SIZE, 80);
  });

  it("does not exceed maxZoom 12, even for a tiny bbox with a tall maxElevation", () => {
    const tinyBbox: [number, number, number, number] = [127.1, 35.8, 127.1001, 35.8001];
    const viewState = fitRegion(tinyBbox, SIZE, { maxElevation: ELEVATION_MAX });
    expect(viewState.zoom).toBeLessThanOrEqual(12);
  });
});

describe("constants", () => {
  it("CONTROLLER carries the specified interaction options", () => {
    // 2026-09-21 사용자 요구: 북쪽 고정·회전 없음, 좌클릭 드래그 = 이동, 스크롤 = 줌.
    expect(CONTROLLER.dragPan).toBe(true);
    expect(CONTROLLER.dragRotate).toBe(false);
    expect(CONTROLLER.touchRotate).toBe(false);
    expect(CONTROLLER.scrollZoom).toBe(true);
    expect(OVERVIEW_BEARING).toBe(0);
    expect(CONTROLLER.doubleClickZoom).toBe(false);
    expect(CONTROLLER.keyboard).toBe(false);
    expect(CONTROLLER.inertia).toBe(300);
    expect(CONTROLLER.maxBounds).toEqual([
      [126.8, 36.8],
      [129.7, 38.7],
    ]);
    expect(CONTROLLER.rubberBand).toBe(true);
  });

  // Task B — camera constants all change together here: a more overhead
  // overview pitch/max pitch (56/72, up from 50/60) and a slightly steeper
  // region fit pitch (58, up from 55), tuned alongside the new height-aware
  // fitRegion above.
  it("OVERVIEW_PITCH is 56 and VIEW_LIMITS.maxPitch is 72", () => {
    expect(OVERVIEW_PITCH).toBe(56);
    expect(VIEW_LIMITS.maxPitch).toBe(72);
  });
});

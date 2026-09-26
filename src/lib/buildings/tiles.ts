import { GANGWON_VIEW } from "../profiles/gangwon";
export const BUILDING_ZOOM = 16;
const N = 2 ** BUILDING_ZOOM;
const xOf = (lng: number) => Math.floor((lng + 180) / 360 * N);
const yOf = (lat: number) => Math.floor((1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * N);
// Request limits only; the display extent is not a source of building geometry.
export const TILE_RANGE = { minX: xOf(GANGWON_VIEW.extent[0]) - 1, maxX: xOf(GANGWON_VIEW.extent[2]) + 1, minY: yOf(GANGWON_VIEW.extent[3]) - 1, maxY: yOf(GANGWON_VIEW.extent[1]) + 1 };
export function validBuildingTile(z: number, x: number, y: number): boolean {
  return z === BUILDING_ZOOM && Number.isInteger(x) && Number.isInteger(y) &&
    x >= TILE_RANGE.minX && x <= TILE_RANGE.maxX && y >= TILE_RANGE.minY && y <= TILE_RANGE.maxY;
}
export function tileBounds(x: number, y: number): [number, number, number, number] {
  const lat = (row: number) => Math.atan(Math.sinh(Math.PI * (1 - 2 * row / N))) * 180 / Math.PI;
  return [x / N * 360 - 180, lat(y + 1), (x + 1) / N * 360 - 180, lat(y)];
}
const sw = tileBounds(TILE_RANGE.minX, TILE_RANGE.maxY);
const ne = tileBounds(TILE_RANGE.maxX, TILE_RANGE.minY);
export const BUILDING_EXTENT: [number, number, number, number] = [sw[0], sw[1], ne[2], ne[3]];

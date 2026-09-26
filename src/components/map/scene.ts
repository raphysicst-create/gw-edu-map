export type Scene = "city" | "flat";
export const SCENE_PREF_KEY = "edu-map:gangwon:scene:v1";
export function readScenePref(): Scene {
  try { return localStorage.getItem(SCENE_PREF_KEY) === "flat" ? "flat" : "city"; } catch { return "city"; }
}
export function writeScenePref(scene: Scene) {
  try { localStorage.setItem(SCENE_PREF_KEY, scene); } catch { /* Private browsing. */ }
}
export function scenePitch(scene: Scene, zoom: number, mobile: boolean): number {
  return scene === "flat" ? 0 : 20 + Math.min(1, Math.max(0, (zoom - 12) / 3.5)) * (mobile ? 20 : 25);
}
export function buildingsActive(scene: Scene, zoom: number, mobile: boolean): boolean {
  return scene === "city" && zoom >= (mobile ? 16 : 15.5);
}

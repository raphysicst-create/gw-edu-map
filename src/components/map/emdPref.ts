/**
 * Task E — persists whether the 읍면동 경계 toggle (DeckMap's "읍면동 경계"
 * MapOverlay item) is on, across page loads. Same pattern as
 * basemapPref.ts (kept as its own small module rather than generalizing
 * basemapPref.ts itself, per the task brief's "emdPref.ts 또는 basemapPref
 * 를 일반화" choice — a second tiny file is lower-risk than reshaping an
 * already-shipped, already-tested module and its one existing call site):
 * `localStorage` access is wrapped in try/catch because it can throw
 * synchronously in some private-browsing modes (notably older Safari) even
 * just on `getItem`/`setItem` — this module treats that exactly like
 * "nothing stored yet": default ON, write silently no-ops.
 * `typeof window === "undefined"` guards SSR/non-DOM callers (DeckMap
 * itself is client-only — see MapShell.tsx's `ssr:false` — but this module
 * makes no assumption about who calls it).
 */
const STORAGE_KEY = "edu-map:gangwon:emd:v1";

/** No stored value yet -> ON by default (matches the task brief: "기본값 ON"). */
export function readEmdPref(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return true;
    return raw === "1";
  } catch {
    return true;
  }
}

export function writeEmdPref(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    // Private mode / storage disabled / quota exceeded — the toggle still
    // works for the rest of this session, it just won't be remembered next
    // time. Not worth surfacing to the user.
  }
}

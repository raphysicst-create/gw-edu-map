import { afterEach, describe, expect, it, vi } from "vitest";

import { readEmdPref, writeEmdPref } from "@/components/map/emdPref";

/** Minimal Storage-shaped stub — good enough for `getItem`/`setItem`, which is all this module ever calls. Mirrors tests/unit/basemapPref.test.ts's own fakeStorage. */
function fakeStorage(initial: Record<string, string> = {}) {
  const store: Record<string, string> = { ...initial };
  return {
    getItem: vi.fn((k: string) => (k in store ? store[k] : null)),
    setItem: vi.fn((k: string, v: string) => {
      store[k] = v;
    }),
    _store: store,
  };
}

describe("readEmdPref/writeEmdPref", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to true (ON) when nothing is stored yet", () => {
    vi.stubGlobal("window", { localStorage: fakeStorage() });
    expect(readEmdPref()).toBe(true);
  });

  it("reads a stored '0' as false (OFF)", () => {
    vi.stubGlobal("window", { localStorage: fakeStorage({ "edu-map:gangwon:emd:v1": "0" }) });
    expect(readEmdPref()).toBe(false);
  });

  it("reads a stored '1' as true (ON)", () => {
    vi.stubGlobal("window", { localStorage: fakeStorage({ "edu-map:gangwon:emd:v1": "1" }) });
    expect(readEmdPref()).toBe(true);
  });

  it("write then read round-trips through the same 'edu-map:gangwon:emd:v1' key", () => {
    const storage = fakeStorage();
    vi.stubGlobal("window", { localStorage: storage });
    writeEmdPref(false);
    expect(storage.setItem).toHaveBeenCalledWith("edu-map:gangwon:emd:v1", "0");
    expect(readEmdPref()).toBe(false);

    writeEmdPref(true);
    expect(storage.setItem).toHaveBeenCalledWith("edu-map:gangwon:emd:v1", "1");
    expect(readEmdPref()).toBe(true);
  });

  it("defaults to true (ON) when localStorage.getItem throws (private-mode Safari etc.)", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(readEmdPref()).toBe(true);
  });

  it("writeEmdPref silently no-ops when localStorage.setItem throws", () => {
    vi.stubGlobal("window", {
      localStorage: {
        setItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(() => writeEmdPref(false)).not.toThrow();
  });

  it("defaults to true (ON) when window/localStorage is unavailable entirely (SSR-safety)", () => {
    vi.stubGlobal("window", undefined);
    expect(readEmdPref()).toBe(true);
    expect(() => writeEmdPref(false)).not.toThrow();
  });

  it("uses a DIFFERENT storage key than basemapPref.ts (no cross-toggle interference)", () => {
    const storage = fakeStorage();
    vi.stubGlobal("window", { localStorage: storage });
    writeEmdPref(false);
    expect(storage._store).toEqual({ "edu-map:gangwon:emd:v1": "0" });
    expect(storage._store["edu-map:gangwon:basemap:v1"]).toBeUndefined();
  });
});

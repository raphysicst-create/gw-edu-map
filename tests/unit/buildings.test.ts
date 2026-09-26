import { describe, expect, it, vi } from "vitest";
import { buildingProperties } from "@/lib/buildings/types";
import { fetchBuildingTile } from "@/lib/buildings/server";
import { TILE_RANGE, validBuildingTile } from "@/lib/buildings/tiles";
import { buildingsActive, scenePitch } from "@/components/map/scene";
import { WebMercatorViewport } from "@deck.gl/core";
import { BuildingTileset, makeBuildingLayer } from "@/components/map/layers/buildingLayer";
import * as transport from "@/lib/buildings/transport";
import { GET } from "@/app/api/buildings/v1/[z]/[x]/[y]/route";

// Exercise the reusable tile implementation under a synthetic reviewed-source policy.
// The actual Gangwon policy gate is checked separately without this mock.
vi.mock("@/lib/profiles/external-maps", () => ({ GANGWON_EXTERNAL_MAPS: { buildings: true } }));

const row = (id: number) => ({ type: "Feature", id, geometry: { type: "Polygon", coordinates: [[[127,35],[127.001,35],[127,35.001],[127,35]]] }, properties: { height: "0", grnd_flr: "2" } });
const page = (current = 1, total = 1, pages = 1, rows = [row(current)]) => Response.json({ response: { status: "OK", record: { total, current: rows.length }, page: { current, total: pages }, result: { featureCollection: { features: rows } } } });
const x = TILE_RANGE.minX, y = TILE_RANGE.minY;

describe("building contract", () => {
  it.each([
    [{ height: "12.5", grnd_flr: "9" }, 12.5, "provided"],
    [{ height: "0", grnd_flr: "3" }, 9, "floors"],
    [{ height: "", grnd_flr: "bad" }, 0, "missing"],
    [{ height: -1, grnd_flr: null }, 0, "missing"],
    [{ height: true, grnd_flr: Infinity }, 0, "missing"],
  ])("normalizes %j without inventing heights", (raw, height, source) => {
    expect(buildingProperties("id", raw)).toMatchObject({ displayHeight: height, heightSource: source, rawHeight: raw.height });
  });
  it("restricts coordinates to the province and one tile margin", () => {
    expect(validBuildingTile(16,x,y)).toBe(true);
    expect(validBuildingTile(15,x,y)).toBe(false);
    expect(validBuildingTile(16,x-1,y)).toBe(false);
    expect(validBuildingTile(16,x+0.1,y)).toBe(false);
  });
  it("reads all pages and preserves original geometry", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(page(1,2,2)).mockResolvedValueOnce(page(2,2,2));
    const tile = await fetchBuildingTile(x,y,{ key: "secret", fetcher });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(tile.features).toHaveLength(2);
    expect(tile.features[0].geometry).toEqual(row(1).geometry);
    expect(tile.metadata.complete).toBe(true);
    expect(JSON.stringify(tile)).not.toContain("secret");
  });
  it.each([
    () => page(1,2,1), () => page(1,9000,9),
    () => Response.json({ response: { status: "ERROR" } }),
  ])("rejects partial/over-budget/upstream failures", async (response) => {
    await expect(fetchBuildingTile(x,y,{key: "secret",fetcher: vi.fn().mockResolvedValue(response())})).rejects.toThrow();
  });
  it("rejects repeated pages", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(page(1,2,2)).mockResolvedValueOnce(page(1,2,2));
    await expect(fetchBuildingTile(x,y,{key:"secret",fetcher})).rejects.toThrow();
  });
  it("returns a complete empty tile for NOT_FOUND", async () => {
    const tile = await fetchBuildingTile(x,y,{key:"secret",fetcher:vi.fn().mockResolvedValue(Response.json({response:{status:"NOT_FOUND"}}))});
    expect(tile.features).toEqual([]);
    expect(tile.metadata.complete).toBe(true);
  });
  it("aborts the whole page sequence at the deadline", async () => {
    const fetcher = vi.fn((_url, init) => new Promise<Response>((_resolve,reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason))));
    await expect(fetchBuildingTile(x,y,{key:"secret",fetcher,timeoutMs:10})).rejects.toThrow();
  });
  it("redacts credentials from transport diagnostics", async () => {
    vi.stubEnv("VWORLD_BUILDING_KEY", "private-test-credential");
    const failed = vi.spyOn(transport, "fetchVworldPage").mockRejectedValue(new TypeError("fetch failed https://api.vworld.kr/req/data?key=private-test-credential"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const response = await GET(new Request("http://localhost/api"), {params:Promise.resolve({z:"16",x:String(x),y:String(y)})});
      expect(response.status).toBe(502);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(JSON.stringify(warn.mock.calls)).not.toContain("private-test-credential");
      expect(JSON.stringify(warn.mock.calls)).not.toContain("api.vworld.kr");
    } finally { warn.mockRestore(); failed.mockRestore(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); }
  });
  it("never caches errors or accepts arbitrary geography", async () => {
    const response = await GET(new Request("http://localhost/api"),{params:Promise.resolve({z:"16",x:"0",y:"0"})});
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
describe("city scene", () => {
  it("uses continuous pitch, mobile cap and a hard network gate", () => {
    expect(scenePitch("city",12,false)).toBe(20);
    expect(scenePitch("city",13.75,false)).toBe(32.5);
    expect(scenePitch("city",18,true)).toBe(40);
    expect(scenePitch("flat",18,false)).toBe(0);
    expect(buildingsActive("city",15.49,false)).toBe(false);
    expect(buildingsActive("city",15.5,false)).toBe(true);
    expect(buildingsActive("city",15.9,true)).toBe(false);
    expect(buildingsActive("flat",18,false)).toBe(false);
  });
  it("bounds tile cache and concurrency and excludes picking", () => {
    const layer = makeBuildingLayer({mobile:true,issueActive:false,retry:0,onStatus:vi.fn()});
    expect(layer.props).toMatchObject({ minZoom:16,maxZoom:16,visibleMinZoom:16,maxRequests:2,maxCacheSize:32,maxCacheByteSize:24*1024*1024,pickable:false });
  });
});


describe("building tile lifecycle", () => {
  const viewport = (longitude: number) => new WebMercatorViewport({width:400,height:400,longitude,latitude:35.824,zoom:16,pitch:45});
  it("cancels requests as soon as their tiles leave the viewport", async () => {
    const signals: AbortSignal[] = [];
    const tiles = new BuildingTileset({minZoom:16,maxZoom:16,maxRequests:2,getTileData: ({signal}) => new Promise((_resolve,reject) => {
      if (!signal) throw new Error("Missing cancellation signal");
      signals.push(signal);
      signal.addEventListener("abort",()=>reject(signal.reason));
    })});
    tiles.update(viewport(127.148));
    await vi.waitFor(()=>expect(signals.length).toBeGreaterThan(0));
    const old = [...signals];
    tiles.update(viewport(126.736));
    expect(old.every(signal=>signal.aborted)).toBe(true);
    tiles.finalize();
  });
  it("reuses loaded tiles on return and evicts unused tiles within the budget", async () => {
    const getTileData = vi.fn(async () => ({byteLength:1024}));
    const tiles = new BuildingTileset({minZoom:16,maxZoom:16,maxRequests:4,maxCacheSize:12,maxCacheByteSize:12*1024,getTileData});
    const first=viewport(127.148);
    tiles.update(first);
    await vi.waitFor(()=>expect(tiles.isLoaded).toBe(true));
    tiles.update(first);
    const calls=getTileData.mock.calls.length;
    tiles.update(first);
    expect(getTileData.mock.calls.length).toBe(calls);
    const second=viewport(126.736);
    tiles.update(second);
    await vi.waitFor(()=>expect(tiles.isLoaded).toBe(true));
    tiles.update(second);
    const afterMove=getTileData.mock.calls.length;
    tiles.update(first);
    await vi.waitFor(()=>expect(tiles.isLoaded).toBe(true));
    expect(getTileData.mock.calls.length).toBe(afterMove);
    for (const lng of [126.736,127.425,126.411]) {
      const view=viewport(lng); tiles.update(view);
      await vi.waitFor(()=>expect(tiles.isLoaded).toBe(true));
      tiles.update(view);
    }
    expect(tiles.tiles.length).toBeLessThanOrEqual(12);
    tiles.finalize();
  });
});

import { fetchVworldPage } from "./transport";
import type { Feature, Polygon, MultiPolygon } from "geojson";
import { buildingProperties, type BuildingTile } from "./types";
import { tileBounds } from "./tiles";
import { GANGWON_EXTERNAL_MAPS } from "../profiles/external-maps";

/** One deadline across all pages; no partial results may escape this function. */
export async function fetchBuildingTile(x: number, y: number, options: {
  key: string; domain?: string; signal?: AbortSignal; fetcher?: typeof fetch; timeoutMs?: number;
}): Promise<BuildingTile> {
  if (!GANGWON_EXTERNAL_MAPS.buildings) {
    throw new Error("Building source unavailable pending VWorld terms review");
  }
  const signal = AbortSignal.any([AbortSignal.timeout(options.timeoutMs ?? 10_000), ...(options.signal ? [options.signal] : [])]);
  const bounds = tileBounds(x, y);
  const features: BuildingTile["features"] = [];
  const seen = new Set<string>();
  let total = -1;
  let pages = 1;
  let received = 0;
  for (let page = 1; page <= pages; page++) {
    const params = new URLSearchParams({ service: "data", request: "GetFeature", version: "2.0", data: "LT_C_BLDGINFO", format: "json", crs: "EPSG:4326", size: "1000", page: String(page), geometry: "true", attribute: "true", key: options.key, geomFilter: `BOX(${bounds[0]},${bounds[1]},${bounds[2]},${bounds[3]})` });
    if (options.domain) params.set("domain", options.domain);
    const response = await (options.fetcher ?? fetchVworldPage)(`https://api.vworld.kr/req/data?${params}`, { signal, cache: "no-store", headers: options.domain ? { Referer: options.domain } : undefined });
    if (!response.ok) throw new Error("Building source HTTP failure");
    let body;
    try { body = await response.json(); } catch { throw new Error("Building source invalid JSON"); }
    const source = body?.response;
    signal.throwIfAborted();
    if (source?.status === "NOT_FOUND" && page === 1) break;
    if (source?.status !== "OK") {
      const code = source?.error?.code;
      throw new Error(code === "INVALID_KEY" ? "Building source invalid key"
        : code === "INVALID_DOMAIN" ? "Building source invalid domain" : "Building source unavailable");
    }
    const count = Number(source.record?.total);
    const pageCount = Number(source.page?.total);
    const rows = source.result?.featureCollection?.features as Feature<Polygon | MultiPolygon>[];
    if (!Number.isInteger(count) || count < 0 || !Number.isInteger(pageCount) || pageCount < 1 || pageCount > 8 ||
        Number(source.page?.current) !== page || !Array.isArray(rows) || Number(source.record?.current) !== rows.length ||
        (page > 1 && (count !== total || pageCount !== pages))) throw new Error("Incomplete building source");
    total = count;
    pages = pageCount;
    received += rows.length;
    for (const row of rows) {
      if (!row.geometry || !["Polygon", "MultiPolygon"].includes(row.geometry.type) || row.id == null) throw new Error("Invalid building geometry");
      const id = String(row.id);
      if (seen.has(id)) throw new Error("Repeated building page");
      seen.add(id);
      features.push({ type: "Feature", id, geometry: row.geometry, properties: buildingProperties(id, row.properties ?? {}) });
    }
  }
  if (total >= 0 && received !== total) throw new Error("Incomplete building source");
  return { type: "FeatureCollection", features, metadata: { source: "국토교통부·브이월드 GIS건물통합정보", fetchedAt: new Date().toISOString(), complete: true } };
}

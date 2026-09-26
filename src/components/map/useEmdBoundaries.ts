"use client";
import { useCallback, useEffect, useState } from "react";
import type { FeatureCollection } from "geojson";
import { isRegionCode } from "@/lib/geo/regions";
import type { ReleaseManifest } from "@/lib/data/release";
import { fetchReleaseFile } from "@/lib/data/load";

const cache = new Map<string, FeatureCollection>();
type State = { key: string | null; data: FeatureCollection | null; error: string | null };

/** Cache belongs to a release and municipality, never to a municipality alone. */
export function useEmdBoundaries(code: string | null, enabled: boolean, manifest: ReleaseManifest) {
  const available = manifest.features.emd;
  const activeCode = enabled && code && isRegionCode(code) && available.status === "available" ? code : null;
  const key = activeCode ? `${manifest.dataVersion}/${activeCode}` : null;
  const [state, setState] = useState<State>({ key, data: key ? cache.get(key) ?? null : null, error: null });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => { setAttempt(n => n + 1); }, []);
  useEffect(() => {
    if (!key || !activeCode || cache.has(key)) return;
    const controller = new AbortController();
    fetchReleaseFile<FeatureCollection>(manifest, `emd/${activeCode}.geojson`, fetch, controller.signal)
      .then(data => {
        if (data.type !== "FeatureCollection" || !Array.isArray(data.features)) throw new Error("행정동 경계 형식이 올바르지 않습니다.");
        if (!controller.signal.aborted) {
          cache.set(key, data);
          setState({ key, data, error: null });
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setState({ key, data: null, error: error instanceof Error ? error.message : "행정동 경계를 불러오지 못했습니다." });
      });
    return () => controller.abort();
  }, [key, activeCode, manifest, attempt]);
  return {
    data: key ? cache.get(key) ?? (state.key === key ? state.data : null) : null,
    error: enabled && available.status === "unavailable" ? available.reason : state.key === key ? state.error : null,
    retry,
  };
}

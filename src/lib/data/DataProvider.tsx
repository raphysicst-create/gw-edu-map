"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { splitRegionIslands } from "../geo/geo";
import { assertBundle, loadBundle } from "./load";
import { DataPreparationError, type ReleaseManifest } from "./release";
import type { EnrichedDataBundle } from "./types";

type DataState =
  | { status: "loading" }
  | { status: "ready"; bundle: EnrichedDataBundle }
  | { status: "preparing"; manifest: ReleaseManifest }
  | { status: "error"; error: string };

const DataContext = createContext<DataState>({ status: "loading" });
/** Re-triggers the load effect below (see DataProvider's `retryTick` state) — a no-op default so useRetry() is always safely callable even outside a real DataProvider (e.g. a test rendering a consumer in isolation). */
const RetryContext = createContext<() => void>(() => {});

/**
 * Loads the whole dashboard's data bundle once on mount (via loadBundle +
 * assertBundle), derives `regionsMain`/`regionsIslands` exactly once (Task
 * 6, Section C.1 — see splitRegionIslands's doc comment for why this lives
 * here rather than load.ts), and makes the result available to descendants
 * through useData()/useBundle(). Loading/error UI is the caller's
 * responsibility (Dashboard.tsx switches on useData().status) — this
 * component only holds the fetch state.
 */
export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DataState>({ status: "loading" });
  // Task 6, Section A.5 — bumped by retry() to re-run the load effect below
  // (a plain dependency, not read for its value) after a fetch failure;
  // "다시 시도" re-attempts the SAME load from scratch rather than trying to
  // resume/patch whatever partially loaded.
  const [retryTick, setRetryTick] = useState(0);
  // The loading-state reset happens HERE, inside this event-handler-
  // triggered callback itself (not synchronously inside the effect body
  // below, which eslint-plugin-react-hooks' set-state-in-effect rule flags
  // — an effect should synchronize with external systems, not translate one
  // state into another) — retry() is only ever invoked from a real click
  // handler (the error UI's "다시 시도" button), so setting state here is the
  // ordinary, expected React pattern, not the anti-pattern that rule guards
  // against.
  const retry = useCallback(() => {
    setState({ status: "loading" });
    setRetryTick((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadBundle()
      .then((bundle) => {
        assertBundle(bundle);
        const { main, islands } = splitRegionIslands(bundle.regions);
        if (!cancelled) {
          setState({ status: "ready", bundle: { ...bundle, regionsMain: main, regionsIslands: islands } });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState(err instanceof DataPreparationError ? { status: "preparing", manifest: err.manifest } : { status: "error", error: err instanceof Error ? err.message : String(err) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [retryTick]);

  return (
    <DataContext.Provider value={state}>
      <RetryContext.Provider value={retry}>{children}</RetryContext.Provider>
    </DataContext.Provider>
  );
}

/** Raw load state — never throws. Use when the caller needs to render its own loading/error UI. */
export function useData(): DataState {
  return useContext(DataContext);
}

/** Re-attempts DataProvider's load from scratch (Task 6, Section A.5 — the error UI's "다시 시도" button). Safe to call unconditionally; a no-op outside a real DataProvider. */
export function useRetry(): () => void {
  return useContext(RetryContext);
}

/** The loaded (and Section-C.1-enriched) bundle. Throws if called before status is 'ready' — callers must gate on useData().status first (or only render this subtree once ready, as Dashboard.tsx does). */
export function useBundle(): EnrichedDataBundle {
  const state = useContext(DataContext);
  if (state.status !== "ready") {
    throw new Error("useBundle() called before data is ready — check useData().status first");
  }
  return state.bundle;
}

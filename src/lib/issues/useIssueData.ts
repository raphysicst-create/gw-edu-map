"use client";
import { useCallback, useEffect, useState } from "react";
import type { SchoolsFile } from "../schools/types";
import { assertIssueData } from "./validate";
import type { EducationIssuesFile } from "./types";
import type { ReleaseManifest } from "../data/release";
import { fetchReleaseFile } from "../data/load";

type State =
  | { status: "idle" | "loading" }
  | { status: "ready"; data: EducationIssuesFile; dataVersion: string }
  | { status: "unavailable"; message: string }
  | { status: "error"; message: string; dataVersion: string };
export function useIssueData(enabled: boolean, schools: SchoolsFile, manifest: ReleaseManifest) {
  const [requested, setRequested] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State>({ status: "idle" });
  if (enabled && !requested) setRequested(true);
  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);
  useEffect(() => {
    if (!requested || manifest.features.educationIssues.status !== "available") return;
    const controller = new AbortController();
    fetchReleaseFile<unknown>(manifest, "education-issues.json", fetch, controller.signal)
      .then((data) => {
        assertIssueData(data, schools, manifest);
        return data;
      })
      .then((data) => {
        if (!controller.signal.aborted) setState({ status: "ready", data, dataVersion: manifest.dataVersion });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setState({
            status: "error",
            dataVersion: manifest.dataVersion,
            message:
              error instanceof Error
                ? error.message
                : "교육문제 자료를 불러오지 못했습니다.",
          });
      });
    return () => controller.abort();
  }, [requested, attempt, schools, manifest]);
  const availability = manifest.features.educationIssues;
  const current: State = (state.status === "ready" || state.status === "error") && state.dataVersion !== manifest.dataVersion ? { status: "loading" } : state;
  return { state: availability.status === "unavailable" ? { status: "unavailable" as const, message: availability.reason } : current, retry };
}

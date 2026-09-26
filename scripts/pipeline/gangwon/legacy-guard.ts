import { ACTIVE_PROFILE } from "../../../src/lib/profiles";

/** Legacy pure transforms remain reusable; their old I/O must never publish Gangwon. */
export function assertLegacyPipelineDisabled(): void {
  if (ACTIVE_PROFILE.id === "gangwon") throw new Error("기존 전북 원본·중간자료 경로는 강원에서 사용할 수 없습니다. npm run data:build 를 사용하세요.");
}

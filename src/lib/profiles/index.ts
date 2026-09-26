import { gangwonProfile } from "./gangwon";
import type { RegionProfile } from "./types";

export const PROFILES: Readonly<Record<string, RegionProfile>> = { gangwon: gangwonProfile };

function requestedProfileId(): string {
  const arg = typeof process !== "undefined"
    ? process.argv.find((value) => value.startsWith("--profile="))?.slice("--profile=".length)
    : undefined;
  const requested = [arg, process.env.NEXT_PUBLIC_EDU_MAP_PROFILE, process.env.EDU_MAP_PROFILE].filter(Boolean);
  if (requested.some((id) => id !== "gangwon")) throw new Error("이 저장소는 강원 전용입니다. profile을 gangwon으로 설정해 주세요.");
  return "gangwon";
}

export const ACTIVE_PROFILE_ID = requestedProfileId();
export const ACTIVE_PROFILE = PROFILES[ACTIVE_PROFILE_ID];

if (!ACTIVE_PROFILE) {
  throw new Error(`Unknown region profile ${JSON.stringify(ACTIVE_PROFILE_ID)}. Available: ${Object.keys(PROFILES).join(", ")}`);
}

export type { RegionEntry, RegionProfile } from "./types";

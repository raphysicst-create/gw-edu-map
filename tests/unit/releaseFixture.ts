import { readFileSync } from "node:fs";
import type { ReleaseManifest } from "@/lib/data/release";

export const releaseManifest: ReleaseManifest = JSON.parse(readFileSync("public/data/manifest.json", "utf8"));

export function readReleased<T>(logical: string): T {
  const entry = releaseManifest.files[logical];
  if (!entry) throw new Error(`Missing release fixture: ${logical}`);
  return JSON.parse(readFileSync(`public/data/${entry.path}`, "utf8")) as T;
}

import { ACTIVE_PROFILE } from "../profiles";
import { INDICATOR_IDS } from "../indicators/registry";
import type { Manifest, ManifestSource } from "../indicators/types";

export interface DatasetIdentity { profileId: "gangwon"; schemaVersion: 2; dataVersion: string }
export type Availability =
  | { status: "available"; sourceIds: string[]; referenceDate: string; scope: string }
  | { status: "unavailable"; reason: string; sourceIds: string[] };
export type IndicatorAvailability = Availability & { years: number[] };
export interface ReleaseFile { path: string; sha256: string; sourceIds: string[] }
export interface ReleaseManifest extends DatasetIdentity {
  releaseStatus: "preparing" | "limited" | "complete";
  latestYear: number | null;
  builtAt: string;
  indicators: Record<string, IndicatorAvailability>;
  issues: Record<string, Availability>;
  features: Record<"schools" | "regions" | "neighbors" | "emd" | "closedSchools" | "educationIssues", Availability>;
  sources: (ManifestSource & { sourceId: string; providerName: string })[];
  files: Record<string, ReleaseFile>;
}
export type PublishedManifest = Manifest & ReleaseManifest;

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const date = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

export function assertDatasetIdentity(value: unknown, expected?: DatasetIdentity): asserts value is DatasetIdentity {
  if (!record(value) || value.profileId !== ACTIVE_PROFILE.id || value.schemaVersion !== 2 || typeof value.dataVersion !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,80}$/.test(value.dataVersion)) {
    throw new Error("강원 자료와 화면의 버전이 맞지 않습니다. 새로고침해 주세요.");
  }
  if (expected && value.dataVersion !== expected.dataVersion) throw new Error("서로 다른 버전의 자료가 감지되었습니다. 새로고침해 주세요.");
}

export function assertReleaseManifest(value: unknown): asserts value is ReleaseManifest {
  assertDatasetIdentity(value);
  const manifest = value as unknown as Record<string, unknown>;
  if (!["preparing", "limited", "complete"].includes(String(manifest.releaseStatus)) || !record(manifest.indicators) || !record(manifest.issues) || !record(manifest.features) || !record(manifest.files) || !Array.isArray(manifest.sources)) throw new Error("강원 자료 목록 형식이 올바르지 않습니다.");
  if (typeof manifest.builtAt !== "string" || !Number.isFinite(Date.parse(manifest.builtAt))) throw new Error("자료 생성일이 누락되었습니다.");
  if (manifest.latestYear !== null && (!Number.isInteger(manifest.latestYear) || Number(manifest.latestYear) < 1900)) throw new Error("자료 기준연도가 올바르지 않습니다.");
  const ids = new Set<string>();
  for (const source of manifest.sources) {
    if (!record(source) || typeof source.sourceId !== "string" || ids.has(source.sourceId) || !source.name || !source.providerName || !date(source.referenceDate) || typeof source.url !== "string" || !source.url.startsWith("https://")) throw new Error("공개 자료의 출처·기준일이 누락되었습니다.");
    ids.add(source.sourceId);
  }
  const assertAvailability = (entry: unknown, id: string) => {
    if (!record(entry) || !["available", "unavailable"].includes(String(entry.status)) || !Array.isArray(entry.sourceIds)) throw new Error(`${id}: 자료 제공 상태가 누락되었습니다.`);
    if (entry.status === "available" && (!entry.sourceIds.length || entry.sourceIds.some((sourceId) => !ids.has(sourceId)) || !date(entry.referenceDate) || typeof entry.scope !== "string" || !entry.scope.trim())) throw new Error(`${id}: 공개 근거가 누락되었습니다.`);
    if (entry.status === "unavailable" && (typeof entry.reason !== "string" || !entry.reason.trim())) throw new Error(`${id}: 미제공 사유가 누락되었습니다.`);
    if (manifest.releaseStatus === "complete" && entry.status !== "available") throw new Error("일부 자료가 미제공 상태여서 전체 완료로 표시할 수 없습니다.");
  };
  for (const id of INDICATOR_IDS) {
    const entry = manifest.indicators[id]; assertAvailability(entry, id);
    if (!record(entry) || !Array.isArray(entry.years) || entry.years.some((year) => !Number.isInteger(year) || year < 1900) || (entry.status === "unavailable" && entry.years.length) || (entry.status === "available" && !entry.years.length)) throw new Error(`${id}: 제공 연도가 올바르지 않습니다.`);
  }
  for (const issue of ACTIVE_PROFILE.policy.issues) assertAvailability(manifest.issues[issue.id], issue.id);
  for (const feature of ["schools", "regions", "neighbors", "emd", "closedSchools", "educationIssues"]) assertAvailability(manifest.features[feature], feature);
  for (const [logical, file] of Object.entries(manifest.files)) {
    if (!/^[a-z0-9/_-]+\.(json|geojson)$/.test(logical) || !record(file) || typeof file.path !== "string" || file.path !== `releases/${value.dataVersion}/${logical}` || typeof file.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(file.sha256) || !Array.isArray(file.sourceIds) || !file.sourceIds.length || file.sourceIds.some((id) => !ids.has(id))) throw new Error(`자료 경로 또는 출처가 올바르지 않습니다: ${logical}`);
  }
  if (manifest.releaseStatus === "preparing" && (Object.keys(manifest.files).length || [manifest.indicators, manifest.issues, manifest.features].some(entries => Object.values(entries).some(entry => record(entry) && entry.status === "available")))) throw new Error("준비 중인 자료에 공개 파일이 섞여 있습니다.");
  if (manifest.releaseStatus !== "preparing") {
    if (manifest.latestYear === null || !record(manifest.features.schools) || manifest.features.schools.status !== "available" || !record(manifest.features.regions) || manifest.features.regions.status !== "available") throw new Error("학교·경계 핵심 자료가 준비되지 않았습니다.");
    const required = ["regions.geojson", "schools.json", "charset.json"];
    for (const [feature, logical] of [["neighbors", "neighbors.geojson"], ["closedSchools", "closed-schools.json"], ["educationIssues", "education-issues.json"]]) if (record(manifest.features[feature]) && manifest.features[feature].status === "available") required.push(logical);
    if (record(manifest.features.emd) && manifest.features.emd.status === "available") for (const region of ACTIVE_PROFILE.regions) required.push(`emd/${region.code}.geojson`);
    for (const [id, entry] of Object.entries(manifest.indicators)) if (record(entry) && entry.status === "available") required.push(`indicators/${id}.json`);
    for (const key of required) if (!(key in manifest.files)) throw new Error(`공개 파일 목록 누락: ${key}`);
  }
}

export function releaseFileUrl(manifest: ReleaseManifest, logical: string): string {
  const file = manifest.files[logical];
  if (!file) throw new Error(`자료 목록에 파일이 없습니다: ${logical}`);
  return `/data/${file.path}`;
}

export class DataPreparationError extends Error {
  constructor(public readonly manifest: ReleaseManifest) { super("강원 자료를 준비하고 있습니다."); }
}

import { createHash } from "node:crypto";
import path from "node:path";

export type ReviewStatus = "candidate" | "page-verified" | "acquired" | "validated" | "publishable";
export interface SourceRecord {
  sourceId: string;
  profileId: "gangwon";
  providerName: string;
  providerType: "education-office" | "province" | "national-agency";
  title: string;
  landingUrl: string;
  downloadUrl: string | null;
  officialEvidenceUrl: string;
  referenceDate: string | null;
  publishedAt: string | null;
  retrievedAt: string | null;
  scope: string;
  coveredRegions: string[];
  schoolLevels: string[];
  fields: string[];
  license: string | null;
  redistribution: "allowed" | "unverified";
  storagePolicy: "allowed" | "unverified";
  sha256: string | null;
  localPath: string | null;
  parserVersion: string | null;
  reviewStatus: ReviewStatus;
  providerReview: { status: "verified" | "pending"; evidence: string };
  limitations: string[];
  publicationReview?: { reviewer: string; reviewedAt: string; evidence: string };
  downloadMethod?: "GET" | "POST";
  requiresSession?: boolean;
  downloadBody?: Record<string, string>;
  requestHeaders?: { Referer?: string };
}
export interface SourceRegister {
  schemaVersion: 1;
  profileId: "gangwon";
  sources: SourceRecord[];
}

const REVIEW_STATUSES = ["candidate", "page-verified", "acquired", "validated", "publishable"];
// An explicit institution review is also required. A .go.kr URL or data.go.kr
// distribution does not make a public corporation a national agency.
const PROVIDERS: Record<SourceRecord["providerType"], readonly string[]> = {
  "education-office": ["강원특별자치도교육청"],
  province: ["강원특별자치도"],
  "national-agency": ["교육부", "행정안전부", "국토교통부", "국가데이터처", "통계청"],
};
const PROVIDER_DOMAINS: Record<string, string[]> = {
  강원특별자치도교육청: ["gwe.go.kr"], 강원특별자치도: ["state.gwd.go.kr"],
  교육부: ["moe.go.kr"], 행정안전부: ["mois.go.kr", "code.go.kr", "juso.go.kr"],
  국토교통부: ["molit.go.kr", "vworld.kr"], 국가데이터처: ["mods.go.kr"], 통계청: ["kostat.go.kr"],
};

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function sourcePath(root: string, relative: string): string {
  const base = path.resolve(root, "data/raw/gangwon");
  const resolved = path.resolve(root, relative);
  const inside = path.relative(base, resolved);
  if (!inside || inside.startsWith("..") || path.isAbsolute(inside)) {
    throw new Error(`강원 원본 경로 밖의 파일: ${relative}`);
  }
  return resolved;
}

export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export function assertSourceRegister(register: SourceRegister): void {
  if (register.schemaVersion !== 1 || register.profileId !== "gangwon" || !Array.isArray(register.sources)) {
    throw new Error("강원 출처 등록부의 profile/schema가 올바르지 않습니다.");
  }
  const ids = new Set<string>();
  for (const source of register.sources) {
    const fail = (message: string): never => { throw new Error(`${source.sourceId}: ${message}`); };
    if (!/^[a-z0-9-]+$/.test(source.sourceId) || ids.has(source.sourceId)) fail("출처 ID 누락 또는 중복");
    ids.add(source.sourceId);
    if (source.profileId !== "gangwon") fail("다른 지역 출처");
    if (!PROVIDERS[source.providerType]?.includes(source.providerName)) fail("허용 제공기관이 아님");
    if (!REVIEW_STATUSES.includes(source.reviewStatus)) fail("알 수 없는 검토 상태");
    if (source.requiresSession !== undefined && typeof source.requiresSession !== "boolean") fail("다운로드 세션 설정이 올바르지 않음");
    for (const value of [source.landingUrl, source.officialEvidenceUrl, source.downloadUrl, source.requestHeaders?.Referer].filter(Boolean)) {
      const url = new URL(value!);
      if (url.protocol !== "https:" || url.username || url.password) fail("유효한 HTTPS 출처 URL 필요");
      const allowed = ["data.go.kr", ...(PROVIDER_DOMAINS[source.providerName] ?? [])];
      if (!allowed.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`))) fail("제공기관과 연결되지 않은 출처 도메인");
    }
    if (!source.landingUrl || !source.officialEvidenceUrl || !source.scope || !source.title) fail("출처 근거·범위 누락");
    if (source.referenceDate !== null && !validDate(source.referenceDate)) fail("기준일 오류");
    if (source.publishedAt !== null && !validDate(source.publishedAt)) fail("게시일 오류");
    const acquired = ["acquired", "validated", "publishable"].includes(source.reviewStatus);
    if (acquired) {
      if (!source.retrievedAt || !Number.isFinite(Date.parse(source.retrievedAt))) fail("실제 취득일 누락");
      if (!source.sha256 || !/^[a-f0-9]{64}$/.test(source.sha256)) fail("SHA-256 누락");
      if (!source.localPath || !source.downloadUrl) fail("원본 취득 경로 누락");
      sourcePath(process.cwd(), source.localPath!);
    } else if (source.sha256 || source.retrievedAt || source.localPath) {
      fail("미취득 출처에 취득 메타데이터가 있음");
    }
    if (source.reviewStatus === "publishable") {
      if (source.providerReview?.status !== "verified" || !source.providerReview.evidence) fail("제공기관 심사 미완료");
      if (!source.referenceDate || !source.parserVersion || !source.fields.length) fail("공개 기준일·파서·필드 누락");
      if (!source.license || source.redistribution !== "allowed" || source.storagePolicy !== "allowed") fail("저장·재배포 조건 미확인");
    }
  }
}

export function assertSourceBytes(source: SourceRecord, bytes: Uint8Array): void {
  if (!source.sha256 || sha256(bytes) !== source.sha256) {
    throw new Error(`${source.sourceId}: 원본 체크섬 불일치. 변경된 원본은 새로 심사해야 합니다.`);
  }
}

export function assertPublishable(register: SourceRegister, ids: readonly string[]): void {
  assertSourceRegister(register);
  if (!ids.length) throw new Error("공개할 자료의 출처 ID가 없습니다.");
  for (const id of ids) {
    const source = register.sources.find((entry) => entry.sourceId === id);
    if (source?.reviewStatus !== "publishable") throw new Error(`${id}: 공개 가능한 출처가 아닙니다.`);
  }
}

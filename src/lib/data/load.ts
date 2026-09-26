import { isRegionCode, PROVINCE_CODE, REGION_CODES } from "../geo/regions";
import { INDICATORS } from "../indicators/registry";
import type { IndicatorFile, SeriesFile } from "../indicators/types";
import { valueMap } from "../stats";
import { assertDatasetIdentity, assertReleaseManifest, DataPreparationError, releaseFileUrl, type PublishedManifest, type ReleaseManifest } from "./release";
import type { DataBundle } from "./types";

type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;

/** Files are immutable; the manifest is revalidated before any data request. */
export async function fetchReleaseFile<T>(manifest: ReleaseManifest, logical: string, fetchImpl: FetchImpl = fetch, signal?: AbortSignal): Promise<T> {
  const response = await fetchImpl(releaseFileUrl(manifest, logical), { signal });
  if (!response.ok) throw new Error(`자료를 불러오지 못했습니다: ${logical} (HTTP ${response.status})${response.status === 404 ? ". 자료 버전이 갱신되었을 수 있습니다. 새로고침해 주세요." : ""}`);
  const data: unknown = await response.json();
  assertDatasetIdentity(data, manifest);
  return data as T;
}

export async function loadBundle(fetchImpl: FetchImpl = fetch): Promise<DataBundle> {
  const response = await fetchImpl("/data/manifest.json", { cache: "no-cache" });
  if (!response.ok) throw new Error(`자료 목록을 불러오지 못했습니다 (HTTP ${response.status}).`);
  const manifest: unknown = await response.json();
  assertReleaseManifest(manifest);
  if (manifest.releaseStatus === "preparing") throw new DataPreparationError(manifest);
  const read = <T>(logical: string) => fetchReleaseFile<T>(manifest, logical, fetchImpl);
  const indicatorIds = INDICATORS.filter(d => manifest.indicators[d.id].status === "available").map(d => d.id);
  const seriesIds = indicatorIds.filter(id => `series/${id}.json` in manifest.files);
  const [regions, neighbors, charsetFile, schools, closedSchools, indicatorFiles, seriesFiles] = await Promise.all([
    read<DataBundle["regions"]>("regions.geojson"),
    manifest.features.neighbors.status === "available" ? read<DataBundle["neighbors"]>("neighbors.geojson") : Promise.resolve({ type: "FeatureCollection" as const, features: [] }),
    read<{ charset: string }>("charset.json"),
    read<DataBundle["schools"]>("schools.json"),
    manifest.features.closedSchools.status === "available" ? read<NonNullable<DataBundle["closedSchools"]>>("closed-schools.json") : Promise.resolve(null),
    Promise.all(indicatorIds.map(id => read<IndicatorFile>(`indicators/${id}.json`))),
    Promise.all(seriesIds.map(id => read<SeriesFile>(`series/${id}.json`))),
  ]);
  return {
    manifest: manifest as PublishedManifest, regions, neighbors, charset: charsetFile.charset, schools, closedSchools,
    indicators: Object.fromEntries(indicatorIds.map((id, i) => [id, indicatorFiles[i]])),
    series: Object.fromEntries(seriesIds.map((id, i) => [id, seriesFiles[i]])),
  };
}

export function assertBundle(bundle: DataBundle): void {
  assertReleaseManifest(bundle.manifest);
  const problems: string[] = [];
  for (const def of INDICATORS) {
    const availability = bundle.manifest.indicators[def.id];
    const file = bundle.indicators[def.id];
    if (availability.status === "unavailable") {
      if (file) problems.push(`미제공 지표에 파일이 있습니다: ${def.id}`);
      continue;
    }
    if (!file) { problems.push(`지표 파일 누락: ${def.id}`); continue; }
    assertDatasetIdentity(file, bundle.manifest);
    const map = valueMap(file);
    if (file.id !== def.id || !availability.years.includes(file.year) || file.referenceDate !== availability.referenceDate) problems.push(`지표 식별자·기준일 불일치: ${def.id}`);
    const expected = [...REGION_CODES, PROVINCE_CODE];
    if (expected.some(code => !map.has(code)) || file.rows.some(row => !expected.includes(row.regionCode) || (row.value !== null && !Number.isFinite(row.value)))) problems.push(`시군·값 오류: ${def.id}`);
    if (new Set(file.rows.map(row => `${row.regionCode}/${row.level ?? "all"}`)).size !== file.rows.length) problems.push(`중복 지표 행: ${def.id}`);
  }
  const codes = bundle.regions.features.map(f => f.properties.code);
  if (codes.length !== REGION_CODES.length || new Set(codes).size !== REGION_CODES.length || codes.some(code => !isRegionCode(code))) problems.push("강원 18개 시군 경계가 일치하지 않습니다.");
  if (typeof bundle.charset !== "string" || !bundle.charset.length) problems.push("지도 글꼴 문자 목록이 없습니다.");
  const schools = bundle.schools.schools;
  if (!schools.length || new Set(schools.map(s => s.id)).size !== schools.length) problems.push("학교가 없거나 식별자가 중복됩니다.");
  if (schools.some(s => !isRegionCode(s.regionCode))) problems.push("강원 밖 학교가 포함되어 있습니다.");
  if (schools.some(s => (s.lat === null) !== (s.lng === null) || (s.lat !== null && (!Number.isFinite(s.lat) || s.lat < 33 || s.lat > 39 || !Number.isFinite(s.lng) || s.lng! < 124 || s.lng! > 132)))) problems.push("학교 좌표의 결측 또는 좌표계가 올바르지 않습니다.");
  if (schools.some(s => [s.students, s.classes, s.teachers].some(value => value !== null && (!Number.isFinite(value) || value < 0)))) problems.push("학교 통계에 유효하지 않은 수가 있습니다.");
  for (const [id, series] of Object.entries(bundle.series)) {
    assertDatasetIdentity(series, bundle.manifest);
    const years = bundle.manifest.indicators[id]?.years ?? [];
    if (series.id !== id || series.rows.some(row => (!isRegionCode(row.regionCode) && row.regionCode !== PROVINCE_CODE) || !years.includes(row.year) || (row.value !== null && !Number.isFinite(row.value))) || new Set(series.rows.map(row => `${row.regionCode}/${row.year}`)).size !== series.rows.length) problems.push(`시계열 지역·연도·중복 오류: ${id}`);
  }
  if (bundle.closedSchools?.rows.some(s => !isRegionCode(s.regionCode))) problems.push("강원 밖 폐교가 포함되어 있습니다.");
  if (problems.length) throw new Error(`강원 자료 정합성 오류:\n${problems.join("\n")}`);
}

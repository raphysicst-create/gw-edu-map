import { INDICATOR_IDS } from "../../src/lib/indicators/registry";
import { ACTIVE_PROFILE } from "../../src/lib/profiles";
import type { PublishedManifest, ReleaseManifest } from "../../src/lib/data/release";

export const TEST_DATA_VERSION = "gangwon-synthetic-test";
export const TEST_SOURCE_ID = "synthetic-official-source";
export const TEST_SHA256 = "a".repeat(64);
export const testIdentity = () => ({ profileId: "gangwon" as const, schemaVersion: 2 as const, dataVersion: TEST_DATA_VERSION });

export const testUnavailable = () => ({ status: "unavailable" as const, reason: "검증된 원본 미확보", sourceIds: [] });
export const testAvailable = () => ({
  status: "available" as const, sourceIds: [TEST_SOURCE_ID], referenceDate: "2026-04-01", scope: "검사 전용 합성 자료",
});

export function preparingManifest(): ReleaseManifest {
  return {
    ...testIdentity(), releaseStatus: "preparing", latestYear: null, builtAt: "2026-09-26T00:00:00.000Z",
    indicators: Object.fromEntries(INDICATOR_IDS.map((id) => [id, { ...testUnavailable(), years: [] }])),
    issues: Object.fromEntries(ACTIVE_PROFILE.policy.issues.map((issue) => [issue.id, testUnavailable()])),
    features: {
      schools: testUnavailable(), regions: testUnavailable(), neighbors: testUnavailable(),
      emd: testUnavailable(), closedSchools: testUnavailable(), educationIssues: testUnavailable(),
    },
    sources: [], files: {},
  };
}

export function limitedManifest(): ReleaseManifest {
  const value = preparingManifest();
  value.releaseStatus = "limited";
  value.latestYear = 2026;
  value.features.schools = testAvailable();
  value.features.regions = testAvailable();
  value.sources = [{
    sourceId: TEST_SOURCE_ID, providerName: "강원특별자치도교육청",
    name: "검사용 합성 출처", url: "https://www.data.go.kr/data/15106701/fileData.do", referenceDate: "2026-04-01",
  }];
  for (const logical of ["regions.geojson", "schools.json", "charset.json"]) {
    value.files[logical] = { path: `releases/${TEST_DATA_VERSION}/${logical}`, sha256: TEST_SHA256, sourceIds: [TEST_SOURCE_ID] };
  }
  return value;
}

/** A synthetic, structurally valid UI fixture. Values themselves live in each component test. */
export function publishedManifest(indicatorIds: readonly string[] = []): PublishedManifest {
  const value = limitedManifest();
  for (const id of indicatorIds) {
    const referenceDate = id.startsWith("closed_schools") ? "2026-07-16" : "2026-04-01";
    value.indicators[id] = { ...testAvailable(), referenceDate, years: [2026] };
    value.files[`indicators/${id}.json`] = {
      path: `releases/${TEST_DATA_VERSION}/indicators/${id}.json`, sha256: TEST_SHA256, sourceIds: [TEST_SOURCE_ID],
    };
  }
  return value as PublishedManifest;
}

import { test as base, expect, type Page } from "@playwright/test";
import { ACTIVE_PROFILE } from "../src/lib/profiles";
import { INDICATORS } from "../src/lib/indicators/registry";
import { EDUCATION_ISSUES } from "../src/lib/issues/registry";
import { PROVINCE_CODE, REGION_CODES } from "../src/lib/geo/regions";

// A minimal valid 1x1 PNG (68 bytes, signature-verified) — stands in for
// every real VWorld WMTS tile response below. Real VWorld tiles are
// publicly reachable with no key validation at the CORS layer (bad keys
// return 200 + an XML ExceptionReport, not a 4xx — see task-C-brief.md's
// "검증된 사실"), but e2e should never depend on the network OR on
// `.env.local`'s real key existing in whatever environment runs this suite.
const PNG_1X1_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const PNG_1X1 = Buffer.from(PNG_1X1_BASE64, "base64");

const DATA_VERSION = "gangwon-e2e-synthetic-v1";
const SOURCE_IDS = { stats: "e2e-stats", schools: "e2e-schools", regions: "e2e-regions", extras: "e2e-extras" } as const;
const DATA_IDENTITY = { profileId: "gangwon", schemaVersion: 2, dataVersion: DATA_VERSION };
const releaseSources = [
  { sourceId: SOURCE_IDS.stats, providerName: "합성 교육통계", name: "Gangwon e2e synthetic statistics", url: "https://example.test/stats", referenceDate: "2026-04-01" },
  { sourceId: SOURCE_IDS.schools, providerName: "합성 학교자료", name: "Gangwon e2e synthetic schools", url: "https://example.test/schools", referenceDate: "2026-04-01" },
  { sourceId: SOURCE_IDS.regions, providerName: "합성 경계자료", name: "Gangwon e2e synthetic boundaries", url: "https://example.test/regions", referenceDate: "2026-04-01" },
  { sourceId: SOURCE_IDS.extras, providerName: "강원 합성자료", name: "합성 폐교재산 및 교육자원", url: "https://example.test/resources", referenceDate: "2026-07-16", publishedAt: "2026-07-20" },
];
const sha256 = "a".repeat(64);
const available = (sourceId: string, referenceDate = "2026-04-01") => ({
  status: "available" as const, sourceIds: [sourceId], referenceDate, scope: "테스트 전용 합성 자료",
});
const regionFeatures = ACTIVE_PROFILE.regions.map((region, index) => {
  const column = index % 3;
  const row = Math.floor(index / 3);
  const minLng = 127.15 + column * 0.67;
  const minLat = 36.92 + row * 0.27;
  const maxLng = minLng + 0.62;
  const maxLat = minLat + 0.24;
  return {
    type: "Feature" as const,
    properties: { code: region.code, name: region.name, bbox: [minLng, minLat, maxLng, maxLat], labelPoint: [(minLng + maxLng) / 2, (minLat + maxLat) / 2] },
    geometry: { type: "Polygon" as const, coordinates: [[[minLng, minLat], [maxLng, minLat], [maxLng, maxLat], [minLng, maxLat], [minLng, minLat]]] },
  };
});
const regionCenter = (code: string) => {
  const index = REGION_CODES.indexOf(code);
  const feature = regionFeatures[index < 0 ? 0 : index];
  return feature.properties.labelPoint;
};
const schools = [...Array.from({ length: 47 }, (_, index) => {
  const [lng, lat] = regionCenter("51110");
  const name = index === 0 ? "강원테스트초등학교" : `강원합성학교${String(index + 1).padStart(2, "0")}`;
  const students = index < 6 ? 1607 - index * 90 : index >= 43 ? 60 - (index - 43) * 10 : 900 - (index - 6) * 19;
  return {
    id: `e2e-school-${String(index + 1).padStart(2, "0")}`, name, level: index % 3 === 0 ? "elem" : index % 3 === 1 ? "mid" : "high",
    status: "운영", branch: index === 46, lat: lat + 0.012 + (index % 10) * 0.002, lng: lng + 0.01 + (index % 10) * 0.002,
    regionCode: "51110", students, classes: 8, teachers: 12, studentsPerClass: students / 8, small: students <= 60,
    kediCode: `e2e-kedi-${String(index + 1).padStart(3, "0")}`, sourceSchoolIds: { kess: `e2e-kess-${index + 1}` }, address: "강원특별자치도 춘천시 테스트로 1",
  };
}), ...Array.from({ length: 11 }, (_, index) => {
  const code = REGION_CODES[(index + 1) % REGION_CODES.length];
  const [lng, lat] = regionCenter(code);
  const name = index === 0 ? "강원합성특수학교" : `강원합성특수학교${index + 1}`;
  return {
    id: `e2e-special-${String(index + 1).padStart(2, "0")}`, name, level: "special", status: "운영", branch: false,
    lat: lat + 0.08, lng: lng + 0.08, regionCode: code, students: 30 + index, classes: 5, teachers: 10,
    studentsPerClass: 6, small: true, kediCode: `e2e-special-kedi-${index + 1}`, address: `강원특별자치도 ${ACTIVE_PROFILE.regions[(index + 1) % REGION_CODES.length].name} 테스트로 1`,
    locationSource: { address: `강원특별자치도 ${ACTIVE_PROFILE.regions[(index + 1) % REGION_CODES.length].name} 테스트로 1`, url: "https://example.test/school", verifiedAt: "2026-09-26", method: "Playwright synthetic map fixture", mapUrl: `https://example.test/map?name=${encodeURIComponent(name)}` },
  };
})];
const closedSchools = Array.from({ length: 14 }, (_, index) => ({
  regionCode: "51130", name: `강원 합성 폐교 ${String(index + 1).padStart(2, "0")}`, year: 2013 + index,
  level: index % 2 ? "mid" : "elem", usage: index < 9 ? "미활용" : "자체활용", buildingArea: 100 + index, siteArea: 200 + index,
  address: "강원특별자치도 원주시 테스트로 1",
}));
const issueResources = EDUCATION_ISSUES.flatMap(issue => issue.metrics.filter(metric => ["basic-centers", "libraries", "care-pilots", "care-centers", "wee-centers", "career-regions", "ai-focus-schools"].includes(metric)).flatMap(metric => {
  const amount = metric === "care-centers" ? 154 : metric === "care-pilots" ? 7 : 18;
  return Array.from({ length: amount }, (_, index) => {
    const regionCode = REGION_CODES[index % REGION_CODES.length];
    const [lng, lat] = regionCenter(regionCode);
    const linkedSchool = metric === "ai-focus-schools" ? schools[index % 47] : null;
    return { issue: issue.id, metric, name: `합성 ${issue.title} 자원 ${index + 1}`,
      regionCode: linkedSchool?.regionCode ?? regionCode, address: "강원특별자치도 테스트로 1",
      phone: null, schoolId: linkedSchool?.id ?? null, detail: "테스트 전용 합성 자료",
      lat: linkedSchool?.lat ?? lat, lng: linkedSchool?.lng ?? lng, referenceDate: "2026-04-01" };
  });
}));
const issueFacts = Object.fromEntries(schools.map((school, index) => [school.id, {
  kediCode: school.kediCode, isMain: !school.branch, status: "기존", entrants: index === 1 ? 0 : 12,
  specialClasses: school.level === "special" ? 0 : index === 0 ? 559 : 0,
  specialStudents: school.level === "special" ? 0 : index === 0 ? 800 : 0,
  librarianTeachers: 0, counselorTeachers: 0,
}]));
const regionsByDesignation = Object.fromEntries(REGION_CODES.map((code, index) => [code, index < 10 ? "decline" : index === 10 ? "attention" : "none"]));
const resourceMetrics = [...new Set(issueResources.map(resource => resource.metric!))];
const testFiles: Record<string, unknown> = {};
function addFile(logical: string, value: Record<string, unknown>, sourceIds: string[]) {
  testFiles[logical] = { ...DATA_IDENTITY, ...value };
  (testManifest.files as Record<string, unknown>)[logical] = {
    path: `releases/${DATA_VERSION}/${logical}`, sha256, sourceIds,
  };
}
const testManifest = {
  ...DATA_IDENTITY, releaseStatus: "complete", latestYear: 2026, builtAt: "2026-09-26T00:00:00.000Z",
  sources: releaseSources,
  indicators: Object.fromEntries(INDICATORS.map(def => [def.id, {
    ...available(def.id.startsWith("closed_schools") ? SOURCE_IDS.extras : SOURCE_IDS.stats, def.id.startsWith("closed_schools") ? "2026-07-16" : "2026-04-01"),
    years: def.id === "students_total" ? [2022, 2026] : [2026],
  }])),
  issues: Object.fromEntries(EDUCATION_ISSUES.map(issue => [issue.id, available(SOURCE_IDS.extras)])),
  features: {
    schools: available(SOURCE_IDS.schools), regions: available(SOURCE_IDS.regions), neighbors: available(SOURCE_IDS.regions),
    emd: available(SOURCE_IDS.regions), closedSchools: available(SOURCE_IDS.extras, "2026-07-16"), educationIssues: available(SOURCE_IDS.extras),
  },
  files: {} as Record<string, unknown>,
};
for (const def of INDICATORS) {
  const provinceValue = def.id === "students_total" ? 165958 : def.id === "special_classes" ? 800 : def.id === "small_schools" ? 310 : def.id.startsWith("closed_schools") ? (def.id === "closed_schools" ? 14 : 9) : def.id === "students_change_5y" ? -12.5 : 42;
  const rows: { regionCode: string; value: number | null; level?: string }[] = [...REGION_CODES.map((regionCode, index) => ({ regionCode, value: regionCode === "51110" && def.id === "students_total" ? 1607 : index + 1 })), { regionCode: PROVINCE_CODE, value: provinceValue }];
  if (def.byLevel) for (const level of ["elem", "mid", "high", "special"]) rows.push(...REGION_CODES.map((regionCode, index) => ({ regionCode, level, value: index + 1 })), { regionCode: PROVINCE_CODE, level, value: 1 });
  addFile(`indicators/${def.id}.json`, { id: def.id, year: 2026, referenceDate: def.id.startsWith("closed_schools") ? "2026-07-16" : "2026-04-01", source: { name: "Gangwon e2e synthetic data", url: "https://example.test/stats", year: 2026 }, rows }, [def.id.startsWith("closed_schools") ? SOURCE_IDS.extras : SOURCE_IDS.stats]);
}
const seriesRows = REGION_CODES.flatMap(regionCode => [{ regionCode, year: 2022, value: regionCode === PROVINCE_CODE ? 189666 : 100 }, { regionCode, year: 2026, value: regionCode === PROVINCE_CODE ? 165958 : 87.5 }]);
seriesRows.push({ regionCode: PROVINCE_CODE, year: 2022, value: 189666 }, { regionCode: PROVINCE_CODE, year: 2026, value: 165958 });
addFile("series/students_total.json", { id: "students_total", rows: seriesRows }, [SOURCE_IDS.stats]);
addFile("regions.geojson", { type: "FeatureCollection", features: regionFeatures }, [SOURCE_IDS.regions]);
addFile("neighbors.geojson", { type: "FeatureCollection", features: [] }, [SOURCE_IDS.regions]);
addFile("charset.json", { charset: "강원교육지도 춘천시 원주시 학교 학생수 0123456789" }, [SOURCE_IDS.regions]);
addFile("schools.json", {
  referenceDate: { location: "2026-04-01", stats: "2026-04-01" },
  source: { location: { name: "Gangwon e2e synthetic schools", url: "https://example.test/schools", referenceDate: "2026-04-01" }, stats: { name: "Gangwon e2e synthetic statistics", url: "https://example.test/stats", referenceDate: "2026-04-01" } }, schools,
}, [SOURCE_IDS.schools]);
addFile("closed-schools.json", { referenceDate: "2026-07-16", publishedAt: "2026-07-20", source: { name: "Gangwon e2e synthetic closed-school data", url: "https://example.test/closed", year: 2026 }, rows: closedSchools }, [SOURCE_IDS.extras]);
const specialTrends = REGION_CODES.flatMap((regionCode, index) => [2022, 2026].map(year => ({
  regionCode, year,
  regularStudents: year === 2022 ? 100 : 88,
  regularClasses: year === 2022 ? 23 + Number(index < 8) : 31 + Number(index === 0),
  specialStudents: year === 2022 ? 8 : 10,
  specialClasses: year === 2022 ? 2 : 3,
})));
specialTrends.push(
  { regionCode: PROVINCE_CODE, year: 2022, regularStudents: 1800, regularClasses: 422, specialStudents: 144, specialClasses: 36 },
  { regionCode: PROVINCE_CODE, year: 2026, regularStudents: 1584, regularClasses: 559, specialStudents: 180, specialClasses: 54 },
);
addFile("education-issues.json", {
  version: 1, statsReferenceDate: "2026-04-01",
  sources: [{ name: "합성 교육문제 자료", url: "https://example.test/issues", referenceDate: "2026-04-01" }],
  designations: regionsByDesignation, schools: issueFacts,
  resourceSources: Object.fromEntries([
    ...EDUCATION_ISSUES.filter(issue => ["basic-learning", "reading", "care", "wellbeing", "career", "ai-education"].includes(issue.id)).map(issue => issue.id),
    ...resourceMetrics,
  ].map(key => [key, { name: "합성 지역자료", url: "https://example.test/resources", referenceDate: "2026-04-01", scope: "합성 테스트 범위", coveredRegions: REGION_CODES.slice(0, key === "care-centers" ? 7 : REGION_CODES.length) }])),
  resources: issueResources,
  specialTrends,
}, [SOURCE_IDS.extras]);
for (const region of ACTIVE_PROFILE.regions) {
  const [lng, lat] = regionCenter(region.code);
  addFile(`emd/${region.code}.geojson`, {
    type: "FeatureCollection", features: [{ type: "Feature", properties: { code: `${region.code}000001`, name: "합성 읍면동" }, geometry: { type: "Polygon", coordinates: [[[lng - 0.05, lat - 0.05], [lng + 0.05, lat - 0.05], [lng + 0.05, lat + 0.05], [lng - 0.05, lat + 0.05], [lng - 0.05, lat - 0.05]]] } }],
  }, [SOURCE_IDS.regions]);
}

/** Stub road tiles so browser tests do not depend on VWorld availability or keys. */
export const test = base.extend<object>({
  page: async ({ page }, use) => {
    await page.route("**/api.vworld.kr/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "image/png",
        headers: { "access-control-allow-origin": "*" },
        body: PNG_1X1,
      }),
    );
    if (process.env.LIVE_BUILDINGS !== "1") {
      await page.route("**/api/buildings/**", route => route.fulfill({ json: {
        type: "FeatureCollection", features: [], metadata: { complete: true, fetchedAt: "2026-09-22T00:00:00Z", source: "test" },
      } }));
    }
    // The live Gangwon release intentionally withholds unverified 2022 school
    // coordinates. Legacy UX scenarios use an explicit, local-only synthetic
    // release so map-point/HUD behavior remains covered without publishing
    // those coordinates or intercepting deployed-site checks.
    const isLocal = (url: string) => ["localhost", "127.0.0.1"].includes(new URL(url).hostname);
    await page.route("**/data/manifest.json", async route => {
      if (!isLocal(route.request().url())) return route.continue();
      await route.fulfill({ json: testManifest });
    });
    await page.route("**/data/releases/**", async route => {
      if (!isLocal(route.request().url())) return route.continue();
      const logical = decodeURIComponent(new URL(route.request().url()).pathname.split(`/releases/${DATA_VERSION}/`)[1] ?? "");
      const data = testFiles[logical];
      if (!data) return route.fulfill({ status: 404, json: { error: `Unknown synthetic fixture: ${logical}` } });
      await route.fulfill({ json: data });
    });
    // A few diagnostics fetch these historical flat paths directly instead
    // of going through the release loader. Keep them on the same synthetic
    // contract, without restoring any flat public data files.
    for (const [path, logical] of [["charset.json", "charset.json"], ["schools.json", "schools.json"]] as const) {
      await page.route(`**/data/${path}`, async route => {
        if (!isLocal(route.request().url())) return route.continue();
        await route.fulfill({ json: testFiles[logical] });
      });
    }
    // Playwright's own fixture-callback convention — this `use` is the
    // fixture-teardown callback (Playwright's `TestFixture` param), not a
    // React hook; eslint-plugin-react-hooks flags it purely because of the
    // name.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(page);
  },
});

export { expect };
export { testManifest, testFiles };

/**
 * Diagnostic screenshot for local runs only. On CI (headless Chromium on
 * swiftshader software GL) a full-page WebGL capture costs ~10 s each —
 * trace analysis of run 35578948946 showed two of them consuming 20–22 s of
 * a test's 30 s budget, which is what actually made select-region flake
 * (not the Escape assertion). CI already keeps `screenshot: "only-on-failure"`
 * and records a trace from the first retry onward (playwright.config.ts
 * `trace: "on-first-retry"`), so nothing is lost there.
 */
export async function docShot(page: Page, name: string): Promise<void> {
  if (process.env.CI) return;
  await page.screenshot({ path: `test-results/${name}.png` });
}

/** Panels/settings now start collapsed to give the thematic map room. */
export async function openPanel(page: Page) {
  await expect(page.locator('[data-map-ready="true"]')).toBeAttached({ timeout: 20000 });
  if (await page.locator('aside[aria-label="학교 탐색 및 시군 통계"]').isVisible()) return;
  const opener = page.getByRole("button", { name: "학교·통계", exact: true });
  if (await opener.isVisible()) await opener.click();
}
export async function openMapSettings(page: Page) {
  const summary = page.locator("summary").filter({ hasText: "지도 설정" });
  if (await summary.locator("..").evaluate(el => el.hasAttribute("open"))) return;
  await expect(summary).toBeVisible();
  if (!(await summary.locator("..").getAttribute("open"))) {
    // Boolean open attributes serialize as an empty string; use DOM presence.
    if (!(await summary.locator("..").evaluate(el => el.hasAttribute("open")))) await summary.click();
  }
}

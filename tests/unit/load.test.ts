import { describe, expect, it, vi } from "vitest";

import { assertBundle, loadBundle } from "@/lib/data/load";
import type { DataBundle } from "@/lib/data/types";
import { INDICATORS, INDICATOR_IDS } from "@/lib/indicators/registry";
import { PROVINCE_CODE, REGION_CODES } from "@/lib/geo/regions";
import type { IndicatorFile, SeriesFile } from "@/lib/indicators/types";
import type { SchoolsFile } from "@/lib/schools/types";
import type { ClosedSchoolsFile } from "@/lib/closedSchools/types";
import { publishedManifest, testAvailable, testIdentity, TEST_DATA_VERSION, TEST_SHA256, TEST_SOURCE_ID } from "../fixtures/gangwon-release";

const tagged = <T extends object>(data: T) => ({ ...testIdentity(), ...data });
const released = (logical: string) => `/data/releases/${TEST_DATA_VERSION}/${logical}`;

function regionsFixture() {
  return tagged({
    type: "FeatureCollection",
    features: REGION_CODES.map((code) => ({
      type: "Feature",
      properties: { code, name: code, bbox: [0, 0, 1, 1], labelPoint: [0.5, 0.5] },
      geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
    })),
  });
}

function neighborsFixture() {
  return tagged({ type: "FeatureCollection", features: [] });
}

const CHARSET = "가나다0123456789";

function indicatorFileFixture(id: string): IndicatorFile {
  const def = INDICATORS.find((d) => d.id === id)!;
  return tagged({
    id,
    year: 2026,
    referenceDate: id.startsWith("closed_schools") ? "2026-07-16" : "2026-04-01",
    source: def.source,
    rows: [...REGION_CODES.map((code) => ({ regionCode: code, value: 1 })), { regionCode: PROVINCE_CODE, value: 18 }],
  });
}

function seriesFileFixture(id: string): SeriesFile {
  return tagged({
    id,
    rows: [2022, 2023, 2024, 2025, 2026].flatMap((year) => [
      ...REGION_CODES.map((code) => ({ regionCode: code, year, value: 1 })),
      { regionCode: PROVINCE_CODE, year, value: 18 },
    ]),
  });
}

function manifestFixture() {
  const manifest = publishedManifest(INDICATOR_IDS);
  manifest.features.neighbors = testAvailable();
  manifest.features.closedSchools = testAvailable();
  for (const logical of ["neighbors.geojson", "closed-schools.json", ...INDICATORS.filter((def) => def.aggregate.kind !== "external").map((def) => `series/${def.id}.json`)]) {
    manifest.files[logical] = { path: `releases/${TEST_DATA_VERSION}/${logical}`, sha256: TEST_SHA256, sourceIds: [TEST_SOURCE_ID] };
  }
  for (const id of INDICATOR_IDS) manifest.indicators[id].years = [2022, 2023, 2024, 2025, 2026];
  return manifest;
}

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 404) {
  return { ok, status, json: async () => body } as Response;
}

function schoolsFixture(): SchoolsFile {
  return tagged({
    referenceDate: { location: "2026-03-20", stats: "2026-04-01" },
    source: {
      location: { name: "검사용 합성 위치", url: "https://example.com/location", referenceDate: "2026-03-20" },
      stats: { name: "검사용 합성 통계", url: "https://example.com/stats", referenceDate: "2026-04-01" },
    },
    schools: REGION_CODES.map((code, i) => ({
      id: `S${i}`,
      name: `학교${i}`,
      level: "elem",
      status: "운영",
      branch: false,
      lat: 35.8,
      lng: 127.1,
      regionCode: code,
      students: 100,
      classes: 5,
      teachers: 10,
      studentsPerClass: 20,
      small: false,
    })),
  });
}

function closedSchoolsFixture(): ClosedSchoolsFile {
  return tagged({
    referenceDate: "2026-07-16",
    publishedAt: "2026-07-20",
    source: { name: "검사용 합성 폐교자료", url: "https://example.com/closed-schools", year: 2026 },
    rows: REGION_CODES.map((code, i) => ({
      regionCode: code,
      name: `폐교${i}`,
      year: 2020,
      level: "elem",
      usage: "미활용",
      buildingArea: 100,
      siteArea: 200,
      address: "강원특별자치도 검사용 주소",
    })),
  });
}

/** A fetchImpl that resolves every URL this app's DataProvider is expected to request. */
function fullFakeFetch() {
  const calls: string[] = [];
  const impl = vi.fn(async (url: string) => {
    calls.push(url);
    if (url === released("regions.geojson")) return jsonResponse(regionsFixture());
    if (url === released("neighbors.geojson")) return jsonResponse(neighborsFixture());
    if (url === released("charset.json")) return jsonResponse(tagged({ charset: CHARSET }));
    if (url === "/data/manifest.json") return jsonResponse(manifestFixture());
    if (url === released("schools.json")) return jsonResponse(schoolsFixture());
    if (url === released("closed-schools.json")) return jsonResponse(closedSchoolsFixture());
    const indicatorMatch = /^\/data\/releases\/[^/]+\/indicators\/(.+)\.json$/.exec(url);
    if (indicatorMatch) return jsonResponse(indicatorFileFixture(indicatorMatch[1]));
    const seriesMatch = /^\/data\/releases\/[^/]+\/series\/(.+)\.json$/.exec(url);
    if (seriesMatch) return jsonResponse(seriesFileFixture(seriesMatch[1]));
    throw new Error(`unexpected url ${url}`);
  });
  return { impl, calls };
}

describe("loadBundle", () => {
  it("fetches regions/neighbors/charset/manifest + every indicator/series file, returning a DataBundle", async () => {
    const { impl } = fullFakeFetch();
    const bundle = await loadBundle(impl);

    expect(bundle.regions.features).toHaveLength(18);
    expect(bundle.neighbors.type).toBe("FeatureCollection");
    expect(bundle.charset).toBe(CHARSET);
    expect(bundle.manifest.latestYear).toBe(2026);
    expect(bundle.schools.schools.length).toBe(REGION_CODES.length);
    expect(bundle.schools.referenceDate.location).toBe("2026-03-20");
    expect(bundle.closedSchools!.rows.length).toBe(REGION_CODES.length);
    expect(bundle.closedSchools!.referenceDate).toBe("2026-07-16");
    for (const id of INDICATOR_IDS) {
      expect(bundle.indicators[id]).toBeTruthy();
      expect(bundle.indicators[id]!.id).toBe(id);
    }
  });

  it("skips fetching a series file for external-kind indicators (students_change_5y)", async () => {
    const { impl, calls } = fullFakeFetch();
    const bundle = await loadBundle(impl);

    expect(calls).not.toContain(released("series/students_change_5y.json"));
    expect(bundle.series.students_change_5y).toBeUndefined();
    // But a normal (sum/ratio/count/share) indicator's series IS fetched.
    expect(calls).toContain(released("series/students_total.json"));
    expect(bundle.series.students_total).toBeTruthy();
  });

  it("rejects a manifest with a missing indicator before fetching release files", async () => {
    const manifest = manifestFixture();
    const missingId = INDICATOR_IDS[0];
    delete manifest.indicators[missingId];
    const calls: string[] = [];
    const impl = vi.fn(async (url: string) => {
      calls.push(url);
      if (url === released("regions.geojson")) return jsonResponse(regionsFixture());
      if (url === released("neighbors.geojson")) return jsonResponse(neighborsFixture());
      if (url === released("charset.json")) return jsonResponse(tagged({ charset: CHARSET }));
      if (url === "/data/manifest.json") return jsonResponse(manifest);
      if (url === released("schools.json")) return jsonResponse(schoolsFixture());
      if (url === released("closed-schools.json")) return jsonResponse(closedSchoolsFixture());
      const indicatorMatch = /^\/data\/releases\/[^/]+\/indicators\/(.+)\.json$/.exec(url);
      if (indicatorMatch) return jsonResponse(indicatorFileFixture(indicatorMatch[1]));
      const seriesMatch = /^\/data\/releases\/[^/]+\/series\/(.+)\.json$/.exec(url);
      if (seriesMatch) return jsonResponse(seriesFileFixture(seriesMatch[1]));
      throw new Error(`unexpected url ${url}`);
    });
    let caught: Error | undefined;
    try {
      await loadBundle(impl);
    } catch (err) {
      caught = err as Error;
    }

    expect(caught).toBeDefined();
    expect(caught?.message).toContain(missingId);
    expect(calls).toEqual(["/data/manifest.json"]);
  });

  it("does not throw when the manifest lists extra ids beyond the registry (registry ⊆ manifest is the only requirement)", async () => {
    const manifest = manifestFixture();
    manifest.indicators["some_retired_indicator"] = { status: "unavailable", reason: "폐지된 합성 지표", sourceIds: [], years: [] };
    const impl = vi.fn(async (url: string) => {
      if (url === released("regions.geojson")) return jsonResponse(regionsFixture());
      if (url === released("neighbors.geojson")) return jsonResponse(neighborsFixture());
      if (url === released("charset.json")) return jsonResponse(tagged({ charset: CHARSET }));
      if (url === "/data/manifest.json") return jsonResponse(manifest);
      if (url === released("schools.json")) return jsonResponse(schoolsFixture());
      if (url === released("closed-schools.json")) return jsonResponse(closedSchoolsFixture());
      const indicatorMatch = /^\/data\/releases\/[^/]+\/indicators\/(.+)\.json$/.exec(url);
      if (indicatorMatch) return jsonResponse(indicatorFileFixture(indicatorMatch[1]));
      const seriesMatch = /^\/data\/releases\/[^/]+\/series\/(.+)\.json$/.exec(url);
      if (seriesMatch) return jsonResponse(seriesFileFixture(seriesMatch[1]));
      throw new Error(`unexpected url ${url}`);
    });

    await expect(loadBundle(impl)).resolves.toBeTruthy();
  });

  it("rejects when any request fails", async () => {
    const impl = vi.fn(async (url: string) => {
      if (url === released("regions.geojson")) return jsonResponse(null, false);
      if (url === released("neighbors.geojson")) return jsonResponse(neighborsFixture());
      if (url === released("charset.json")) return jsonResponse(tagged({ charset: CHARSET }));
      if (url === "/data/manifest.json") return jsonResponse(manifestFixture());
      if (url === released("schools.json")) return jsonResponse(schoolsFixture());
      if (url === released("closed-schools.json")) return jsonResponse(closedSchoolsFixture());
      const indicatorMatch = /^\/data\/releases\/[^/]+\/indicators\/(.+)\.json$/.exec(url);
      if (indicatorMatch) return jsonResponse(indicatorFileFixture(indicatorMatch[1]));
      const seriesMatch = /^\/data\/releases\/[^/]+\/series\/(.+)\.json$/.exec(url);
      if (seriesMatch) return jsonResponse(seriesFileFixture(seriesMatch[1]));
      throw new Error(`unexpected url ${url}`);
    });
    await expect(loadBundle(impl)).rejects.toThrow();
  });
});

describe("assertBundle", () => {
  async function validBundle(): Promise<DataBundle> {
    const { impl } = fullFakeFetch();
    return loadBundle(impl);
  }

  it("does not throw for a fully valid bundle", async () => {
    const bundle = await validBundle();
    expect(() => assertBundle(bundle)).not.toThrow();
  });

  it("throws listing a missing indicator file for a registered id", async () => {
    const bundle = await validBundle();
    delete bundle.indicators[INDICATOR_IDS[0]];
    expect(() => assertBundle(bundle)).toThrow(new RegExp(INDICATOR_IDS[0]));
  });

  it("throws when an indicator file is missing a 시군 row", async () => {
    const bundle = await validBundle();
    const id = INDICATOR_IDS[0];
    bundle.indicators[id] = {
      ...bundle.indicators[id]!,
      rows: bundle.indicators[id]!.rows.filter((r) => r.regionCode !== REGION_CODES[0]),
    };
    expect(() => assertBundle(bundle)).toThrow(new RegExp(id));
  });

  it("throws when an indicator file is missing the 51000 (강원 전체) row", async () => {
    const bundle = await validBundle();
    const id = INDICATOR_IDS[0];
    bundle.indicators[id] = {
      ...bundle.indicators[id]!,
      rows: bundle.indicators[id]!.rows.filter((r) => r.regionCode !== PROVINCE_CODE),
    };
    expect(() => assertBundle(bundle)).toThrow(new RegExp(id));
  });

  it("throws when regions has fewer than 18 features", async () => {
    const bundle = await validBundle();
    bundle.regions = { ...bundle.regions, features: bundle.regions.features.slice(0, 17) };
    expect(() => assertBundle(bundle)).toThrow(/18/);
  });

  it("throws when charset is empty", async () => {
    const bundle = await validBundle();
    bundle.charset = "";
    expect(() => assertBundle(bundle)).toThrow(/글꼴 문자/);
  });

  it("throws when schools.json has 0 schools", async () => {
    const bundle = await validBundle();
    bundle.schools = { ...bundle.schools, schools: [] };
    expect(() => assertBundle(bundle)).toThrow(/학교가 없거나/);
  });

  it("throws when a school's regionCode is outside the 18 시군", async () => {
    const bundle = await validBundle();
    bundle.schools = {
      ...bundle.schools,
      schools: [{ ...bundle.schools.schools[0], regionCode: "99999" }],
    };
    expect(() => assertBundle(bundle)).toThrow(/강원 밖 학교/);
  });

  it("throws when a closed-schools row's regionCode is outside the 18 시군", async () => {
    const bundle = await validBundle();
    bundle.closedSchools = {
      ...bundle.closedSchools!,
      rows: [{ ...bundle.closedSchools!.rows[0], regionCode: "99999" }],
    };
    expect(() => assertBundle(bundle)).toThrow(/강원 밖 폐교/);
  });

  it("does not throw when closed-schools.json has 0 rows (a legitimate, if surprising, all-zero dataset)", async () => {
    const bundle = await validBundle();
    bundle.closedSchools = { ...bundle.closedSchools!, rows: [] };
    expect(() => assertBundle(bundle)).not.toThrow();
  });

  it("reports multiple missing items in a single error", async () => {
    const bundle = await validBundle();
    delete bundle.indicators[INDICATOR_IDS[0]];
    delete bundle.indicators[INDICATOR_IDS[1]];
    try {
      assertBundle(bundle);
      throw new Error("expected assertBundle to throw");
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toMatch(new RegExp(INDICATOR_IDS[0]));
      expect(message).toMatch(new RegExp(INDICATOR_IDS[1]));
    }
  });
});

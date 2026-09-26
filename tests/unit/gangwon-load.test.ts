import { describe, expect, it, vi } from "vitest";
import { assertBundle, loadBundle } from "../../src/lib/data/load";
import { DataPreparationError } from "../../src/lib/data/release";
import type { DataBundle } from "../../src/lib/data/types";
import { REGION_CODES } from "../../src/lib/geo/regions";
import { limitedManifest, preparingManifest, testIdentity, TEST_DATA_VERSION } from "../fixtures/gangwon-release";

const response = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;
const tagged = <T extends object>(body: T) => ({ ...testIdentity(), ...body });
const regions = () => tagged({
  type: "FeatureCollection", features: REGION_CODES.map((code) => ({
    type: "Feature", properties: { code, name: code, bbox: [0, 0, 1, 1], labelPoint: [0.5, 0.5] },
    geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
  })),
});
const schools = () => tagged({
  referenceDate: { location: "2026-04-01", stats: "2026-04-01" },
  source: {
    location: { name: "검사용 합성 자료", url: "https://www.data.go.kr", referenceDate: "2026-04-01" },
    stats: { name: "검사용 합성 자료", url: "https://www.data.go.kr", referenceDate: "2026-04-01" },
  },
  schools: [{
    id: "synthetic-school", name: "검사용학교", level: "elem", status: "운영", branch: false,
    lat: 37.8, lng: 127.7, regionCode: REGION_CODES[0], students: 12, classes: 1,
    teachers: 1, studentsPerClass: 12, small: true,
  }],
});
const files = () => ({
  "regions.geojson": regions(),
  "schools.json": schools(),
  "charset.json": tagged({ charset: "강원0123456789" }),
});

function fakeFetch(manifest: unknown, contents: Record<string, unknown> = files()) {
  const calls: string[] = [];
  const fetchImpl = vi.fn(async (url: string) => {
    calls.push(url);
    if (url === "/data/manifest.json") return response(manifest);
    const logical = url.replace(`/data/releases/${TEST_DATA_VERSION}/`, "");
    if (logical in contents) return response(contents[logical]);
    return response(null, 404);
  });
  return { fetchImpl, calls };
}

describe("강원 release 로딩", () => {
  it("manifest가 준비 중이면 다른 파일을 요청하기 전에 준비 상태를 반환한다", async () => {
    const { fetchImpl, calls } = fakeFetch(preparingManifest());
    await expect(loadBundle(fetchImpl)).rejects.toBeInstanceOf(DataPreparationError);
    expect(calls).toEqual(["/data/manifest.json"]);
  });

  it("전북 manifest를 받으면 다른 파일을 요청하지 않는다", async () => {
    const manifest = { ...limitedManifest(), profileId: "jeonbuk" };
    const { fetchImpl, calls } = fakeFetch(manifest);
    await expect(loadBundle(fetchImpl)).rejects.toThrow("버전");
    expect(calls).toEqual(["/data/manifest.json"]);
  });

  it("제한 공개는 버전 경로의 선언된 파일만 읽고 보류 지표를 요청하지 않는다", async () => {
    const { fetchImpl, calls } = fakeFetch(limitedManifest());
    const bundle = await loadBundle(fetchImpl);
    expect(() => assertBundle(bundle)).not.toThrow();
    expect(bundle.regions.features).toHaveLength(18);
    expect(bundle.indicators).toEqual({});
    expect(bundle.closedSchools).toBeNull();
    expect(calls[0]).toBe("/data/manifest.json");
    expect(calls.slice(1).sort()).toEqual([
      "charset.json", "regions.geojson", "schools.json",
    ].map((name) => `/data/releases/${TEST_DATA_VERSION}/${name}`).sort());
  });

  it("manifest와 다른 dataVersion의 파일이 섞이면 거부한다", async () => {
    const contents = files();
    contents["schools.json"] = { ...schools(), dataVersion: "other-version" };
    const { fetchImpl } = fakeFetch(limitedManifest(), contents);
    await expect(loadBundle(fetchImpl)).rejects.toThrow("서로 다른 버전");
  });

  it("빠진 파일의 HTTP 오류를 표시한다", async () => {
    const { fetchImpl } = fakeFetch(limitedManifest(), { "regions.geojson": regions(), "charset.json": tagged({ charset: "강원" }) });
    await expect(loadBundle(fetchImpl)).rejects.toThrow("schools.json");
  });

  it("경계 시군 누락과 학교의 타 지역 코드를 검사한다", async () => {
    const { fetchImpl } = fakeFetch(limitedManifest());
    const bundle = await loadBundle(fetchImpl);
    bundle.regions.features.pop();
    bundle.schools.schools[0].regionCode = "99999";
    expect(() => assertBundle(bundle)).toThrow(/경계/);
    try { assertBundle(bundle); } catch (error) {
      expect(String(error)).toContain("강원 밖 학교");
    }
  });

  it("보류 지표에 파일을 끼워 넣으면 정합성 검사에서 거부한다", async () => {
    const { fetchImpl } = fakeFetch(limitedManifest());
    const bundle = await loadBundle(fetchImpl);
    bundle.indicators.students_total = tagged({
      id: "students_total", year: 2026, referenceDate: "2026-04-01", source: { name: "검사용 합성 자료", url: "https://www.data.go.kr", year: 2026 }, rows: [],
    }) as DataBundle["indicators"][string];
    expect(() => assertBundle(bundle)).toThrow("미제공 지표");
  });
});

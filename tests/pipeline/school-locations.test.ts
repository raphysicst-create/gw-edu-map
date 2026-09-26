import { describe, expect, it, vi } from "vitest";
import { supplementSchoolLocations, type VerifiedSchoolLocation } from "../../scripts/pipeline/lib/school-locations";
import type { School } from "../../src/lib/schools/types";

// These checks exercise the legacy pure supplement transform with a small
// synthetic fixture. They do not depend on a legacy public release.
vi.mock("../../src/lib/profiles", () => ({
  ACTIVE_PROFILE: {
    id: "jeonbuk-test",
    province: { name: "전북특별자치도", shortName: "전북", aggregateCode: "52000" },
    regions: [
      { code: "52110", name: "전주시" }, { code: "52130", name: "군산시" },
      { code: "52140", name: "익산시" }, { code: "52180", name: "정읍시" },
      { code: "52190", name: "남원시" }, { code: "52210", name: "김제시" },
      { code: "52710", name: "완주군" }, { code: "52720", name: "진안군" },
      { code: "52730", name: "무주군" }, { code: "52740", name: "장수군" },
      { code: "52750", name: "임실군" }, { code: "52770", name: "순창군" },
      { code: "52790", name: "고창군" }, { code: "52800", name: "부안군" },
    ],
    schoolData: { kessSidoNames: ["전북"], educationOfficeCodes: [], addressPrefixes: ["전북특별자치도"] },
    files: { manualDir: "data/manual", closedSchoolsCsvPrefix: "전북특별자치도교육청_폐교재산 현황_" },
  },
}));

const locations: VerifiedSchoolLocation[] = [
  {
    kediCode: "450000001",
    name: "샘물학교",
    regionCode: "52110",
    lat: 35.82,
    lng: 127.09,
    locationSource: {
      address: "전북특별자치도 전주시 완산구 샘물로 1",
      url: "https://school.jbedu.kr/saem/M0101/",
      verifiedAt: "2026-09-22",
      method: "학교 공식 홈페이지 지도 좌표",
      mapUrl: "https://school.jbedu.kr/_mdl/tplMap/map?lat=35.82&lng=127.09&name=샘물학교",
    },
  },
];

const originals: School[] = [
  {
    id: "kedi:450000001",
    name: "샘물학교",
    level: "special",
    status: "기존",
    branch: false,
    lat: null,
    lng: null,
    regionCode: "52110",
    students: 80,
    classes: 8,
    teachers: 12,
    studentsPerClass: 10,
    small: false,
    kediCode: "450000001",
    locationMissingReason: "표준자료에 없음",
  },
];

describe("verified special-school locations", () => {
  it("fills a verified location while preserving the school's identity and statistics", () => {
    const [enriched] = supplementSchoolLocations(originals, locations);
    expect(enriched).toMatchObject({
      id: originals[0].id,
      name: originals[0].name,
      level: originals[0].level,
      status: originals[0].status,
      regionCode: originals[0].regionCode,
      students: originals[0].students,
      classes: originals[0].classes,
      teachers: originals[0].teachers,
      studentsPerClass: originals[0].studentsPerClass,
      small: originals[0].small,
      lat: 35.82,
      lng: 127.09,
      locationSource: locations[0].locationSource,
    });
    expect(enriched.locationMissingReason).toBeUndefined();
  });

  it("preserves the coordinates and school name encoded in the official map URL", () => {
    const url = new URL(locations[0].locationSource.mapUrl);
    expect(url.origin).toBe("https://school.jbedu.kr");
    expect(Number(url.searchParams.get("lat"))).toBe(locations[0].lat);
    expect(Number(url.searchParams.get("lng"))).toBe(locations[0].lng);
    expect(url.searchParams.get("name")).toBe(locations[0].name);
  });

  it("leaves unverified schools missing instead of guessing", () => {
    expect(supplementSchoolLocations(originals, [])[0].lat).toBeNull();
  });

  it.each([
    { kediCode: "unknown" }, { name: "동명이교" }, { regionCode: "52130" },
    { lat: 0 }, { lng: Number.NaN },
    { locationSource: { ...locations[0].locationSource, address: "서울특별시 종로구" } },
    { locationSource: { ...locations[0].locationSource, url: "https://example.com" } },
  ])("rejects invalid coordinates or identity/source drift: %j", (change) => {
    expect(() => supplementSchoolLocations(originals, [{ ...locations[0], ...change }])).toThrow();
  });

  it("rejects duplicates and refuses to overwrite existing standard-source coordinates", () => {
    expect(() => supplementSchoolLocations(originals, [locations[0], locations[0]])).toThrow();
    expect(() => supplementSchoolLocations([{ ...originals[0], lat: 35.82, lng: 127.09 }], locations)).toThrow();
  });
});

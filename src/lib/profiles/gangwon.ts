import type { RegionProfile } from "./types";
import { EDUCATION_ISSUES, POLICY_SOURCE } from "./gangwon/issues";

/** 2026 MOLIT legal-dong 시군 keys, explicitly distinct from SGIS geometry codes. */
export const gangwonProfile: RegionProfile = {
  id: "gangwon",
  province: { name: "강원특별자치도", shortName: "강원", aggregateCode: "51000" },
  regions: [
    { code: "51110", name: "춘천시" }, { code: "51130", name: "원주시" },
    { code: "51150", name: "강릉시" }, { code: "51170", name: "동해시" },
    { code: "51190", name: "태백시" }, { code: "51210", name: "속초시" },
    { code: "51230", name: "삼척시" }, { code: "51720", name: "홍천군" },
    { code: "51730", name: "횡성군" }, { code: "51750", name: "영월군" },
    { code: "51760", name: "평창군" }, { code: "51770", name: "정선군" },
    { code: "51780", name: "철원군" }, { code: "51790", name: "화천군" },
    { code: "51800", name: "양구군" }, { code: "51810", name: "인제군" },
    { code: "51820", name: "고성군" }, { code: "51830", name: "양양군" },
  ],
  boundary: {
    sourceCodeSystem: "sgis",
    sidoCode: "32",
    neighborSidoCodes: ["31", "33", "37"],
    internalCodeSystem: "legal-dong",
    internalSidoCode: "51",
    internalNeighborSidoCodes: ["41", "43", "47"],
  },
  schoolData: { kessSidoNames: ["강원", "강원도", "강원특별자치도"], educationOfficeCodes: [], addressPrefixes: ["강원특별자치도", "강원도"] },
  files: { manualDir: "data/manual/gangwon", closedSchoolsCsvPrefix: "강원특별자치도교육청_" },
  policy: { source: POLICY_SOURCE, issues: EDUCATION_ISSUES },
};

// Display constraints, not geographic source data or school coordinates.
export const GANGWON_VIEW = {
  extent: [126.8, 36.8, 129.7, 38.7] as [number, number, number, number],
  latitude: 37.75,
  minZoom: 6.4,
};

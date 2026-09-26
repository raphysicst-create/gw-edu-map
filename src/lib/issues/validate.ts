import { PROVINCE_CODE, REGION_CODES } from "../geo/regions";
import { PUBLISHED_ISSUES } from "./registry";
import type { SchoolsFile } from "../schools/types";
import type { EducationIssuesFile } from "./types";
import type { ReleaseManifest } from "../data/release";
import { EDUCATION_ISSUES } from "./registry";

/** Validate cached/network data before exposing it to a map. */
export function assertIssueData(
  value: unknown,
  schools: SchoolsFile,
  manifest?: ReleaseManifest,
): asserts value is EducationIssuesFile {
  const fail = () => {
    throw new Error(
      "교육문제 자료가 갱신 중이거나 올바르지 않습니다. 다시 시도해 주세요.",
    );
  };
  if (!value || typeof value !== "object") return fail();
  const data = value as EducationIssuesFile;
  const published = manifest ? EDUCATION_ISSUES.filter(issue => manifest.issues[issue.id].status === "available") : PUBLISHED_ISSUES;
  if (
    data.version !== 1 ||
    data.statsReferenceDate !== schools.referenceDate.stats ||
    !data.designations ||
    !data.schools ||
    !Array.isArray(data.sources) ||
    data.sources.length < 1
  )
    return fail();
  for (const source of data.sources) {
    if (
      !source ||
      typeof source !== "object" ||
      typeof source.name !== "string" ||
      !source.name ||
      !/^https:\/\//.test(source.url) ||
      !(source.referenceDate || source.checkedAt)
    )
      return fail();
  }
  if (Object.keys(data.designations).length !== REGION_CODES.length)
    return fail();
  for (const code of REGION_CODES) {
    if (
      !["decline", "attention", "none", null].includes(data.designations[code])
    )
      return fail();
  }
  if (Object.keys(data.schools).length !== schools.schools.length)
    return fail();
  const seen = new Set<string>();
  for (const school of schools.schools) {
    const facts = data.schools[school.id];
    if (
      !facts ||
      typeof facts.isMain !== "boolean" ||
      !["기존", "신설", "휴교"].includes(facts.status)
    )
      return fail();
    const locator = facts.sourceRecord;
    const key = facts.kediCode ? `kedi:${facts.kediCode}` : locator ? `${locator.sourceId}:${locator.sheet}:${locator.row}` : null;
    if (!key || seen.has(key)) return fail();
    if (facts.kediCode && facts.kediCode !== school.kediCode) return fail();
    if (!facts.kediCode && (!locator?.sourceId || !locator.sheet || !Number.isInteger(locator.row) || locator.row < 1 || JSON.stringify(locator) !== JSON.stringify(school.sourceRecord))) return fail();
    if (facts.isMain === school.branch) return fail();
    seen.add(key);
    for (const n of [
      facts.entrants,
      facts.specialClasses,
      facts.specialStudents,
      facts.librarianTeachers,
      facts.counselorTeachers,
    ]) {
      if (n !== undefined && n !== null && (!Number.isInteger(n) || n < 0)) return fail();
    }
    if (published.some((issue) => issue.metrics.includes("librarian-schools")) && facts.librarianTeachers === undefined) return fail();
    if (published.some((issue) => issue.metrics.includes("counselor-schools")) && facts.counselorTeachers === undefined) return fail();
  }
  if (data.specialTrends !== undefined) {
    if (!Array.isArray(data.specialTrends)) return fail();
    const keys = new Set<string>();
    for (const row of data.specialTrends) {
      if (!row || ![PROVINCE_CODE, ...REGION_CODES].includes(row.regionCode) ||
        !Number.isInteger(row.year) || row.year < 1900 || row.year > Number(data.statsReferenceDate.slice(0, 4))) return fail();
      const key = `${row.regionCode}:${row.year}`;
      if (keys.has(key)) return fail();
      keys.add(key);
      for (const n of [row.regularStudents, row.regularClasses, row.specialStudents, row.specialClasses])
        if (n !== null && (!Number.isInteger(n) || n < 0)) return fail();
    }
    for (const year of new Set(data.specialTrends.map(r => r.year)))
      for (const code of [PROVINCE_CODE, ...REGION_CODES])
        if (!keys.has(`${code}:${year}`)) return fail();
  }

  const resourceIssues = published.filter((issue) =>
    ["basic-learning", "reading", "care", "wellbeing", "career", "ai-education"].includes(issue.id),
  );
  if (resourceIssues.length) {
    if (!data.resourceSources || !Array.isArray(data.resources)) return fail();
    for (const issue of resourceIssues) {
      const source = data.resourceSources[issue.id];
      if (!source || !source.name || !/^https:\/\//.test(source.url) ||
        !(source.referenceDate || source.checkedAt) || !source.scope ||
        !data.resources.some((resource) => resource.issue === issue.id)) return fail();
      for (const metric of issue.metrics) {
        const metricSource = data.resourceSources[metric] ?? source;
        if (!metricSource || !metricSource.scope ||
          (metricSource.coveredRegions &&
            (!Array.isArray(metricSource.coveredRegions) || metricSource.coveredRegions.some((code) => !REGION_CODES.includes(code))))) return fail();
      }
    }
    const schoolIds = new Set(schools.schools.map((school) => school.id));
    const names = new Set<string>();
    for (const resource of data.resources) {
      if (!resource || !data.resourceSources[resource.issue] || !resource.name ||
        (resource.regionCode !== null && !REGION_CODES.includes(resource.regionCode)) ||
        (resource.schoolId !== null && !schoolIds.has(resource.schoolId))) return fail();
      if (resource.metric && !published.find((issue) => issue.id === resource.issue)?.metrics.includes(resource.metric)) return fail();
      if ([resource.capacity, resource.enrolled].some((n) => n !== undefined && n !== null && (!Number.isInteger(n) || n < 0))) return fail();
      if ((resource.lat != null || resource.lng != null) &&
        (resource.lat == null || resource.lng == null || !Number.isFinite(resource.lat) || !Number.isFinite(resource.lng))) return fail();
      const key = `${resource.issue}:${resource.metric ?? "default"}:${resource.regionCode}:${resource.name}:${resource.address}`;
      if (names.has(key)) return fail();
      names.add(key);
      if (resource.issue === "ai-education" &&
        (!resource.schoolId || schools.schools.find((school) => school.id === resource.schoolId)?.regionCode !== resource.regionCode)) return fail();
    }
  }

}

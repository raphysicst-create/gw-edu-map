import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { loadBundle } from "@/lib/data/load";
import type { DataBundle } from "@/lib/data/types";
import type { EducationIssuesFile } from "@/lib/issues/types";
import { assertIssueData } from "@/lib/issues/validate";
import { buildIssueModel, issueValue, studentChange } from "@/lib/issues/model";
import {
  EDUCATION_ISSUES,
  issueById,
  PUBLISHED_ISSUES,
  METRIC_LABELS,
} from "@/lib/issues/registry";
import { createLoader } from "nuqs/server";
import { mapQueryParsers } from "@/lib/state/urlState";
import { readReleased } from "./releaseFixture";
import { PROVINCE_CODE, REGION_CODES } from "@/lib/geo/regions";

let bundle: DataBundle;
let data: EducationIssuesFile;
beforeAll(async () => {
  bundle = await loadBundle(
    async (url) => new Response(readFileSync(`public${url}`, "utf8")),
  );
  data = readReleased<EducationIssuesFile>("education-issues.json");
});
const regional = () => issueById("regional-sustainability")!;
const special = () => issueById("special-education")!;

describe("policy-linked education issues", () => {
  it("names every planned metric, including each default, for visible and accessible controls", () => {
    for (const issue of EDUCATION_ISSUES) for (const metric of issue.metrics) {
      expect(METRIC_LABELS[metric], `${issue.id}/${metric}`).toBeTypeOf("string");
      expect(METRIC_LABELS[metric].trim()).not.toBe("");
    }
  });
  it("keeps all ten questions planned until their required evidence is publishable", () => {
    expect(EDUCATION_ISSUES).toHaveLength(10);
    expect(PUBLISHED_ISSUES).toHaveLength(0);
    expect(issueById("reading")).not.toBeNull();
    expect(EDUCATION_ISSUES.every(i => i.status === "planned" && i.policyPage === null)).toBe(true);
    expect(EDUCATION_ISSUES.every(i => bundle.manifest.issues[i.id].status === "unavailable")).toBe(true);
  });
  it("validates exact identity and date alignment for every school", () => {
    expect(() => assertIssueData(data, bundle.schools)).not.toThrow();
    for (const change of [
      (d: EducationIssuesFile) => {
        d.statsReferenceDate = "2025-04-01";
      },
      (d: EducationIssuesFile) => {
        d.schools[bundle.schools.schools[0].id].kediCode = "wrong";
      },
      (d: EducationIssuesFile) => {
        delete d.schools[bundle.schools.schools[0].id];
      },
      (d: EducationIssuesFile) => {
        d.schools[bundle.schools.schools[0].id].entrants = -1;
      },
    ]) {
      const copy = structuredClone(data);
      change(copy);
      expect(() => assertIssueData(copy, bundle.schools)).toThrow();
    }
  });
  it("leaves unsupported designations missing but preserves three-category formatting with synthetic values", () => {
    expect(REGION_CODES.every(code => data.designations[code] === null)).toBe(true);
    const copy = structuredClone(data);
    copy.designations["51110"] = "decline";
    copy.designations["51130"] = "attention";
    copy.designations["51150"] = "none";
    const model = buildIssueModel(bundle, copy, regional(), "designation");
    expect(model.regions.find(r => r.code === "51110")?.text).toBe("인구감소지역");
    expect(model.regions.find(r => r.code === "51130")?.text).toBe("관심지역");
    expect(model.regions.find(r => r.code === "51150")?.text).toBe("해당 지정 없음");
    expect(model.regions.find(r => r.code === "51170")?.text).toBe("자료 없음");
  });
  it("separates general-school special classes from special schools", () => {
    const regular = bundle.schools.schools.filter(s => s.level !== "special");
    expect(issueValue(bundle, data, "special-classes", PROVINCE_CODE)).toBe(regular.reduce((n, s) => n + (data.schools[s.id].specialClasses ?? 0), 0));
    expect(issueValue(bundle, data, "special-students", PROVINCE_CODE)).toBe(regular.reduce((n, s) => n + (data.schools[s.id].specialStudents ?? 0), 0));
    expect(issueValue(bundle, data, "special-schools", PROVINCE_CODE)).toBe(bundle.schools.schools.filter(s => s.level === "special" && !s.branch).length);
    const general = buildIssueModel(bundle, data, special(), "special-classes");
    expect(general.schools.length).toBeGreaterThan(0);
    expect(general.schools.every((s) => s.level !== "special")).toBe(true);
    const specialized = buildIssueModel(
      bundle,
      data,
      special(),
      "special-schools",
    );
    expect(specialized.schools).toHaveLength(bundle.schools.schools.filter(s => s.level === "special" && !s.branch).length);
    expect(specialized.schools.every((s) => s.lat === null && s.lng === null)).toBe(true);
  });
  it("matches existing main-school counts including suspended schools but excluding branches", () => {
    const small = buildIssueModel(bundle, data, regional(), "small-share");
    expect(small.schools).toHaveLength(252);
    expect(small.schools.every((s) => !s.branch)).toBe(true);
    expect(
      buildIssueModel(bundle, data, regional(), "zero-entrants").schools,
    ).toHaveLength(bundle.schools.schools.filter(s => !s.branch && data.schools[s.id].entrants === 0).length);
    const suspended = structuredClone(data);
    suspended.schools[small.schools[0].id].status = "휴교";
    expect(buildIssueModel(bundle, suspended, regional(), "small-share").schools.some(s => s.id === small.schools[0].id)).toBe(true);
  });
  it("includes 60 students and excludes 61 regardless of stale small flag", () => {
    const copy = structuredClone(bundle);
    const school = copy.schools.schools.find((s) => !s.branch)!;
    school.students = 60;
    school.small = false;
    expect(
      buildIssueModel(copy, data, regional(), "small-share").schools.some(
        (s) => s.id === school.id,
      ),
    ).toBe(true);
    school.students = 61;
    school.small = true;
    expect(
      buildIssueModel(copy, data, regional(), "small-share").schools.some(
        (s) => s.id === school.id,
      ),
    ).toBe(false);
  });
  it("distinguishes missing data from zero and refuses partial sums", () => {
    const copy = structuredClone(data);
    const school = bundle.schools.schools.find((s) => s.level !== "special")!;
    copy.schools[school.id].specialClasses = null;
    expect(
      issueValue(bundle, copy, "special-classes", school.regionCode),
    ).toBeNull();
    copy.schools[school.id].specialClasses = 0;
    expect(
      issueValue(bundle, copy, "special-classes", school.regionCode),
    ).not.toBeNull();
    copy.designations["51110"] = null;
    const model = buildIssueModel(bundle, copy, regional(), "designation");
    expect(model.regions.find((r) => r.code === "51110")?.text).toBe(
      "자료 없음",
    );
    expect(model.legend.some((l) => l.label === "자료 없음")).toBe(true);
  });
  it("does not infer change from one released year and rejects missing or zero synthetic baselines", () => {
    const copy = structuredClone(bundle);
    const model = buildIssueModel(bundle, data, regional(), "student-change");
    expect(model.title).toContain("2022→2022");
    expect(REGION_CODES.every(code => studentChange(bundle, code) === null)).toBe(true);
    const existing = copy.series.students_total.rows.find(r => r.regionCode === "51110" && r.year === 2022)!;
    copy.series.students_total.rows.push({ ...existing, year: 2021, value: 100 });
    expect(studentChange(copy, "51110")).toBeCloseTo(existing.value! - 100);
    copy.series.students_total.rows.find(
      (r) => r.regionCode === "51110" && r.year === 2021,
    )!.value = 0;
    expect(studentChange(copy, "51110")).toBeNull();
    copy.series.students_total.rows.find(
      (r) => r.regionCode === "51110" && r.year === 2021,
    )!.value = null;
    expect(studentChange(copy, "51110")).toBeNull();
  });
  it("resolves unsupported metric URLs to the issue default and keeps legacy URLs", () => {
    expect(
      buildIssueModel(bundle, data, regional(), "special-classes").metric,
    ).toBe("decline-small");
    const load = createLoader(mapQueryParsers);
    expect(load("?indicator=students_total&region=51720").view).toBe("schools");
    const q = load(
      "?view=issues&issue=regional-sustainability&issueMetric=designation&region=51720",
    );
    expect(q.issue).toBe("regional-sustainability");
    expect(q.region).toBe("51720");
    expect(load("?view=issues&issue=reading").issue).toBe("reading");
  });
});

describe("planned resource questions", () => {
  it("returns missing for six unverified inventories and does not project their counts onto schools", () => {
    for (const [id, metric] of [
      ["basic-learning", "basic-centers"], ["reading", "libraries"],
      ["care", "care-pilots"], ["wellbeing", "wee-centers"],
      ["career", "career-regions"], ["ai-education", "ai-focus-schools"],
    ] as const) {
      const model = buildIssueModel(bundle, data, issueById(id)!, metric);
      expect(issueValue(bundle, data, metric, PROVINCE_CODE)).toBeNull();
      expect(model.sources).toHaveLength(0);
      expect(model.regions).toHaveLength(18);
      expect(model.regions.every(r => r.value === null)).toBe(true);
      expect(model.schools).toHaveLength(0);
    }
  });
  it("rejects an AI operating school with a wrong school or district", () => {
    const copy = structuredClone(data);
    const school = bundle.schools.schools[0];
    copy.resourceSources = { "ai-education": { name: "synthetic source", url: "https://example.test/source", referenceDate: "2022-04-01", scope: "synthetic" } };
    copy.resources = [{ issue: "ai-education", name: "synthetic school", regionCode: "51130", address: null, phone: null, schoolId: school.id, detail: null }];
    const manifest = structuredClone(bundle.manifest);
    manifest.issues["ai-education"] = { status: "available" } as typeof manifest.issues["ai-education"];
    expect(() => assertIssueData(copy, bundle.schools, manifest)).toThrow();
  });
});

describe("expanded issue evidence", () => {
  it("compares school sizes within a level without branches or invented capacity labels", () => {
    const model = buildIssueModel(bundle, data, issueById("school-size")!, null);
    const chuncheon = model.schools.filter(s => s.regionCode === "51110");
    expect(chuncheon.length).toBeGreaterThan(0);
    expect(chuncheon).toEqual(bundle.schools.schools.filter(s => s.regionCode === "51110" && s.level === "elem" && !s.branch).sort((a, b) => a.name.localeCompare(b.name, "ko")));
    expect(model.schools.every(s => s.level === "elem" && !s.branch)).toBe(true);
    const middle = buildIssueModel(bundle, data, issueById("school-size")!, null, "mid");
    expect(middle.schools.every(s => s.level === "mid")).toBe(true);
    expect(issueValue(bundle, data, "school-size", "51110", "mid")).toBe(bundle.schools.schools.filter(s => s.regionCode === "51110" && s.level === "mid" && !s.branch).length);
  });
  it("combines regional change and small-school locations without assigning regional rates to schools", () => {
    const model = buildIssueModel(bundle, data, regional(), "decline-small");
    expect(model.regionOverlay).toBe(true);
    expect(model.schools).toHaveLength(252);
    expect(model.regions.find(r => r.code === "51110")?.value).toBe(studentChange(bundle, "51110"));
    expect(model.regions.every(r => r.value === null)).toBe(true);
  });
  it("counts only recorded unused assets and leaves empty-region percentages undefined", () => {
    expect(issueValue(bundle, data, "unused-count", PROVINCE_CODE)).toBeNull();
    expect(issueValue(bundle, data, "unused-share", PROVINCE_CODE)).toBeNull();
    const model = buildIssueModel(bundle, data, issueById("closed-assets")!, "unused-share");
    expect(model.schools).toHaveLength(0);
    expect(model.regions.find(r => r.code === "51720")?.text).toBe("해당 없음");
  });
  it("keeps optional special trends absent until verified and validates a complete synthetic series", () => {
    expect(data.specialTrends).toBeUndefined();
    const copy = structuredClone(data);
    expect(() => assertIssueData(copy, bundle.schools)).not.toThrow();
    const year = 2022;
    copy.specialTrends = [PROVINCE_CODE, ...REGION_CODES].map(regionCode => ({ regionCode, year, regularStudents: 2, regularClasses: 1, specialStudents: 1, specialClasses: 1 }));
    expect(() => assertIssueData(copy, bundle.schools)).not.toThrow();
    copy.specialTrends.push({ ...copy.specialTrends[0] });
    expect(() => assertIssueData(copy, bundle.schools)).toThrow();
  });
  it("parses comparison, school level and zero-entry highlighting in shared URLs", () => {
    const load = createLoader(mapQueryParsers);
    expect(load("?issue=school-size&issueLevel=high&region=51110&compareRegion=51130&zeroEntrants=on")).toMatchObject({ issue: "school-size", issueLevel: "high", region: "51110", compareRegion: "51130", zeroEntrants: "on" });
  });
});

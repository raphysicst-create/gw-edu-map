import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { loadBundle } from "@/lib/data/load";
import type { DataBundle } from "@/lib/data/types";
import type { EducationIssuesFile } from "@/lib/issues/types";
import { buildMapMetric, MISSING_COLOR, ZERO_COLOR } from "@/lib/mapMetrics";
import { INDICATORS } from "@/lib/indicators/registry";
import { EDUCATION_ISSUES, issueById } from "@/lib/issues/registry";
import { buildIssueModel } from "@/lib/issues/model";
import { makeDensityLayer, supportsDensity } from "@/components/map/layers/metricLayers";
import { hasCoordinates } from "@/components/map/layers/schoolLayers";
import type { Device } from "@luma.gl/core";
import { readReleased } from "./releaseFixture";

let bundle: DataBundle;
let facts: EducationIssuesFile;
beforeAll(async () => {
  bundle = await loadBundle(async (url) => new Response(readFileSync(`public${url}`, "utf8")));
  facts = readReleased<EducationIssuesFile>("education-issues.json");
});
const withLocation = () => {
  const copy = structuredClone(bundle);
  copy.schools.schools[0].lat = 37.8813;
  copy.schools.schools[0].lng = 127.7298;
  return copy;
};

describe("Gangwon education map metrics", () => {
  it("formats released province values once and marks missing indicators unavailable", () => {
    expect(buildMapMetric(bundle, "students_total", null, facts).summary).toBe("강원 전체 147,101명");
    expect(buildMapMetric(bundle, "small_school_share", null, facts).summary).toBe("강원 전체 39.7%");
    expect(buildMapMetric(bundle, "site_area_per_student", null, facts).summary).toBe("강원 전체 84㎡");
    expect(buildMapMetric(bundle, "rural_school_share", null, facts).summary).toBe("강원 전체 자료 없음");
    for (const id of ["students_change_5y", "classrooms_per_school", "closed_schools"]) {
      const model = buildMapMetric(bundle, id, null, facts);
      expect(model.summary).toBe("자료 미제공");
      expect(model.unavailableReason).toBeTruthy();
    }
  });

  it("covers every indicator and falls back to regional rendering until school coordinates are publishable", () => {
    expect(INDICATORS).toHaveLength(18);
    expect(bundle.schools.schools.every(s => !hasCoordinates(s))).toBe(true);
    for (const def of INDICATORS) expect(buildMapMetric(bundle, def.id, null, facts).kind).toBe("region");
    const located = withLocation();
    expect(buildMapMetric(located, "students_total", null, facts).kind).toBe("density");
    expect(buildMapMetric(located, "schools_total", null, facts).kind).toBe("category");
    expect(buildMapMetric(located, "students_per_class", null, facts).kind).toBe("value");
    expect(buildMapMetric(located, "site_area_per_student", null, facts).kind).toBe("region");
  });

  it("covers every unavailable policy question without projecting it onto school values", () => {
    expect(EDUCATION_ISSUES).toHaveLength(10);
    for (const issue of EDUCATION_ISSUES) {
      const model = buildMapMetric(bundle, "students_total", null, facts, issue.id);
      expect(model.kind).toBe("region");
      expect(model.summary).toBe("자료 미제공");
      expect(model.unavailableReason).toBeTruthy();
      expect(bundle.schools.schools.every(s => model.value(s) === null)).toBe(true);
    }
  });

  it("keeps all-school special totals separate from general-school issue populations", () => {
    const issue = issueById("special-education")!;
    for (const [indicator, metric] of [["special_classes", "special-classes"], ["special_students", "special-students"]] as const) {
      const total = buildMapMetric(bundle, indicator, null, facts);
      const general = buildMapMetric(withLocation(), indicator, buildIssueModel(bundle, facts, issue, metric), facts);
      const sum = (model: typeof total) => bundle.schools.schools.reduce((n, s) => n + (model.value(s) ?? 0), 0);
      expect(sum(total)).toBeGreaterThanOrEqual(sum(general));
      expect(sum(general)).toBe(bundle.schools.schools.filter(s => s.level !== "special")
        .reduce((n, s) => n + (metric === "special-classes" ? facts.schools[s.id].specialClasses ?? 0 : facts.schools[s.id].specialStudents ?? 0), 0));
      expect(total.title).toContain("특수학교 포함");
      expect(general.specialEducation).toBe(true);
    }
  });

  it("distinguishes zero, missing values and a zero denominator when a school can be drawn", () => {
    const model = buildMapMetric(withLocation(), "students_per_class", null, facts);
    const sample = bundle.schools.schools[0];
    expect(model.color({ ...sample, students: 0, classes: 1 })).toEqual(ZERO_COLOR);
    expect(model.color({ ...sample, students: null })).toEqual(MISSING_COLOR);
    expect(model.color({ ...sample, classes: 0 })).toEqual(MISSING_COLOR);
    expect(model.legend.some(item => item.label === "자료 없음")).toBe(true);
  });

  it("excludes branches from small-school counts and preserves the 60-student boundary", () => {
    const model = buildMapMetric(bundle, "small_schools", null, facts);
    const rows = bundle.schools.schools;
    expect(rows.reduce((sum, s) => sum + (model.value(s) ?? 0), 0)).toBe(252);
    expect(model.value({ ...rows[0], branch: true, small: true, students: 60 })).toBe(0);
    expect(model.value({ ...rows[0], branch: false, small: true, students: 60 })).toBe(1);
  });

  it("shares the full province scale across filtered synthetic heatmaps and checks device precision", () => {
    const located = withLocation();
    const model = buildMapMetric(located, "students_total", null, facts);
    const schools = located.schools.schools.filter(hasCoordinates);
    const all = makeDensityLayer(schools, model, false);
    const one = makeDensityLayer(schools.slice(0, 1), model, true);
    expect(all.props.colorDomain).toEqual(one.props.colorDomain);
    expect(model.maximum).toBe(1299);
    expect(supportsDensity({ features: new Set() } as unknown as Device)).toBe(false);
    expect(supportsDensity({ features: new Set(["float32-renderable-webgl", "texture-blend-float-webgl"]) } as unknown as Device)).toBe(true);
  });

  it("uses missing regional colors for unavailable change data and keeps a signed scale with synthetic values", () => {
    const unavailable = buildMapMetric(bundle, "students_change_5y", null, facts);
    expect(unavailable.kind).toBe("region");
    expect(unavailable.legend).toEqual([{ label: "자료 미제공", color: MISSING_COLOR }]);
    expect(unavailable.regionColor("51110")).toEqual(MISSING_COLOR);

    const copy = structuredClone(bundle);
    copy.manifest.indicators.students_change_5y = { status: "available" } as typeof copy.manifest.indicators.students_change_5y;
    const students = copy.indicators.students_total;
    if (!students) throw new Error("The released students_total indicator is required by this fixture");
    copy.indicators.students_change_5y = { ...students, id: "students_change_5y",
      rows: students.rows.map(row => ({ ...row, value: row.regionCode === "51110" ? -10 : row.regionCode === "51130" ? 10 : null })) };
    const signed = buildMapMetric(copy, "students_change_5y", null, facts);
    expect(signed.legend[1].label).toBe("0%");
    expect(signed.regionColor("unknown")).toEqual(MISSING_COLOR);
    expect(signed.regionColor("51110")).not.toEqual(signed.regionColor("51130"));
  });
});

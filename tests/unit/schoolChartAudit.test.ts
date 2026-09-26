import { describe, expect, it } from "vitest";
import { readReleased } from "./releaseFixture";
import { INDICATORS } from "@/lib/indicators/registry";
import { ISSUE_METRICS } from "@/lib/issues/registry";
import { schoolChartMetric, chartMaximum, chartHeight } from "@/lib/schools/chart";
import type { School } from "@/lib/schools/types";
import type { EducationIssuesFile } from "@/lib/issues/types";

const schools: School[] = readReleased<{ schools: School[] }>("schools.json").schools;
const facts: EducationIssuesFile = readReleased<EducationIssuesFile>("education-issues.json");
const counts = ["schools_total", "small_schools", "zero_entrant_schools"];
const proportional = ["students_total", "classes_total", "teachers_total", "students_per_class", "students_per_teacher", "special_classes", "special_students"];
const dots = ["site_area_per_student", "classrooms_per_school", "small_school_share", "rural_school_share", "students_change_5y", "closed_schools", "closed_schools_unused", "closed_schools_recent"];
const issueCounts = ["zero-entrants", "special-schools", "librarian-schools", "counselor-schools"];
const issueProportional = ["special-classes", "special-students", "school-size", "decline-small"];
const issueDots = ["designation", "student-change", "small-share", "unused-count", "unused-share", "basic-centers", "libraries", "care-pilots", "care-centers", "wee-centers", "career-regions", "ai-focus-schools"];

describe("all selectable school chart metrics", () => {
  it("requires an explicit rendering expectation for every registered indicator and issue metric", () => {
    expect([...counts, ...proportional, ...dots].sort()).toEqual(INDICATORS.map(d => d.id).sort());
    expect([...issueCounts, ...issueProportional, ...issueDots].sort()).toEqual([...ISSUE_METRICS].sort());
  });
  for (const [ids, mode, issue] of [
    [counts, "school-count", false], [proportional, "proportional", false], [dots, "dots", false],
    [issueCounts, "school-count", true], [issueProportional, "proportional", true], [issueDots, "dots", true],
  ] as const) {
    it.each(ids)(`%s uses ${mode} with finite, bounded heights`, id => {
      const metric = schoolChartMetric(issue ? "students_total" : id, issue ? id : undefined, facts);
      if (mode === "dots") {
        expect(metric).toBeNull();
        return;
      }
      expect(metric).not.toBeNull();
      expect(metric!.heightMode ?? "proportional").toBe(mode);
      const max = chartMaximum(schools, metric!);
      const values = schools.map(metric!.value).filter((v): v is number => v !== null);
      expect(values.every(v => Number.isFinite(v) && v >= 0)).toBe(true);
      if (mode === "school-count") expect(values.every(v => v === 0 || v === 1)).toBe(true);
      else expect(new Set(values.filter(v => v > 0)).size).toBeGreaterThan(1);
      for (const zoom of [10, 16, 18]) {
        const fullHeight = chartHeight(max, max, zoom);
        for (const value of [...values, null]) {
          const height = chartHeight(value, max, zoom, metric!.heightMode);
          expect(Number.isFinite(height)).toBe(true);
          expect(height).toBeGreaterThanOrEqual(0);
          expect(height).toBeLessThanOrEqual(fullHeight);
          if (value === null || value === 0) expect(height).toBe(0);
          else expect(height / fullHeight).toBeCloseTo(mode === "school-count" ? 12 / 150 : value / max, 10);
        }
      }
    });
  }
  it.each(["students_per_class", "students_per_teacher"])("%s leaves a zero or missing denominator unplotted", id => {
    const metric = schoolChartMetric(id)!;
    for (const denominator of [0, null]) {
      expect(metric.value({ ...schools[0], classes: denominator, teachers: denominator })).toBeNull();
    }
  });
});

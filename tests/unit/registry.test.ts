import { describe, expect, it } from "vitest";
import {
  CLOSED_SCHOOLS_AGGREGATE_FILE,
  DEFAULT_INDICATOR_ID,
  INDICATOR_IDS,
  INDICATORS,
  indicatorById,
} from "../../src/lib/indicators/registry";
import type { IndicatorGroup } from "../../src/lib/indicators/types";

describe("INDICATORS registry", () => {
  it("defines exactly 18 indicators (15 KESS + 3 폐교, Task 5)", () => {
    expect(INDICATORS).toHaveLength(18);
  });

  it("has unique ids", () => {
    const ids = INDICATORS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("exposes INDICATOR_IDS matching the registry ids", () => {
    expect(INDICATOR_IDS).toEqual(INDICATORS.map((d) => d.id));
  });

  it("covers all 4 indicator groups", () => {
    const groups = new Set(INDICATORS.map((d) => d.group));
    const expected: IndicatorGroup[] = ["scale", "smallSchool", "teacherInfra", "vulnerable"];
    for (const g of expected) {
      expect(groups.has(g)).toBe(true);
    }
  });

  it("gives every def a format function, source, aggregate rule, and description", () => {
    for (const def of INDICATORS) {
      expect(typeof def.format).toBe("function");
      expect(def.source).toBeTruthy();
      expect(def.source.name.length).toBeGreaterThan(0);
      expect(def.aggregate).toBeTruthy();
      expect(typeof def.description).toBe("string");
      expect(def.description.length).toBeGreaterThan(0);
    }
  });

  it("sources every school-statistics indicator from the Gangwon education office", () => {
    for (const def of INDICATORS) {
      if (def.aggregate.kind === "external" && def.aggregate.file !== "series/students_total.json") continue; // 폐교 지표 — a different source, see the next test
      expect(def.source.name).toContain("강원특별자치도교육청 교육통계");
    }
  });

  it("sources the 3 폐교 지표 from the Gangwon education office, not KESS", () => {
    for (const id of ["closed_schools", "closed_schools_unused", "closed_schools_recent"]) {
      const def = indicatorById(id);
      expect(def?.source.name).toContain("강원특별자치도교육청 폐교 자료");
      expect(def?.source.name).not.toContain("KESS");
    }
  });

  it("gives every indicator a non-empty description, and only the documented ones a caveat", () => {
    const idsWithCaveat = new Set([
      "small_schools",
      "small_school_share",
      "special_classes",
      "special_students",
      "students_change_5y",
      "closed_schools",
      "closed_schools_unused",
      "closed_schools_recent",
    ]);
    for (const def of INDICATORS) {
      expect(def.description.length).toBeGreaterThan(0);
      if (idsWithCaveat.has(def.id)) {
        expect(def.caveat, `${def.id} should have a caveat`).toBeTruthy();
      }
    }
  });

  it("formats a representative value for every indicator without throwing", () => {
    for (const def of INDICATORS) {
      expect(() => def.format(42.5)).not.toThrow();
      expect(typeof def.format(42.5)).toBe("string");
    }
  });

  it("sets DEFAULT_INDICATOR_ID to students_total, and it exists in the registry", () => {
    expect(DEFAULT_INDICATOR_ID).toBe("students_total");
    expect(INDICATOR_IDS).toContain(DEFAULT_INDICATOR_ID);
  });

  it("marks students_total, schools_total, and teachers_total as byLevel", () => {
    // teachers_total needs byLevel even though the brief's registry table only
    // annotates students_total/schools_total explicitly: validate.ts's own
    // check (3) requires province/<level> teacher values to compare against the
    // official per-level figures (8,116/4,935/5,377/482), which only exist if
    // this indicator produces level-tagged rows.
    expect(indicatorById("students_total")?.byLevel).toBe(true);
    expect(indicatorById("schools_total")?.byLevel).toBe(true);
    expect(indicatorById("teachers_total")?.byLevel).toBe(true);
  });

  it("indicatorById returns undefined for an unknown id", () => {
    expect(indicatorById("does_not_exist")).toBeUndefined();
  });

  it("gives students_change_5y an external aggregate pointing at the students_total series", () => {
    const def = indicatorById("students_change_5y");
    expect(def?.aggregate).toEqual({
      kind: "external",
      file: "series/students_total.json",
      field: "change5y",
    });
  });

  it("gives schools_total a count aggregate over the isMain predicate", () => {
    expect(indicatorById("schools_total")?.aggregate).toEqual({
      kind: "count",
      predicate: "isMain",
    });
  });

  it("gives students_per_class a ratio aggregate of students over classes", () => {
    expect(indicatorById("students_per_class")?.aggregate).toEqual({
      kind: "ratio",
      numerator: "students",
      denominator: "classes",
    });
  });

  describe("Task 5 — 폐교 지표(closed_schools*)", () => {
    it("registers all 3 폐교 지표 in the smallSchool group with higherWorse/count", () => {
      for (const id of ["closed_schools", "closed_schools_unused", "closed_schools_recent"]) {
        const def = indicatorById(id);
        expect(def?.group).toBe("smallSchool");
        expect(def?.polarity).toBe("higherWorse");
        expect(def?.kind).toBe("count");
        expect(def?.unit).toBe("교");
      }
    });

    it("gives closed_schools the exact label '폐교 수(등재)' and shortLabel '폐교 수' (label pinned by the e2e test too)", () => {
      expect(indicatorById("closed_schools")?.label).toBe("폐교 수(등재)");
      expect(indicatorById("closed_schools")?.shortLabel).toBe("폐교 수");
    });

    it("gives each 폐교 지표 an external aggregate over CLOSED_SCHOOLS_AGGREGATE_FILE with a distinct field", () => {
      expect(indicatorById("closed_schools")?.aggregate).toEqual({
        kind: "external",
        file: CLOSED_SCHOOLS_AGGREGATE_FILE,
        field: "count",
      });
      expect(indicatorById("closed_schools_unused")?.aggregate).toEqual({
        kind: "external",
        file: CLOSED_SCHOOLS_AGGREGATE_FILE,
        field: "unused",
      });
      expect(indicatorById("closed_schools_recent")?.aggregate).toEqual({
        kind: "external",
        file: CLOSED_SCHOOLS_AGGREGATE_FILE,
        field: "recent",
      });
    });
  });
});

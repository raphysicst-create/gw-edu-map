import { describe, expect, it } from "vitest";

import { nextRegion, regionRankList, selectionAnnouncement } from "@/lib/selection";
import { REGION_CODES } from "@/lib/geo/regions";

describe("nextRegion", () => {
  const codes = ["a", "b", "c"];

  it("moves forward to the next code", () => {
    expect(nextRegion(codes, "a", 1)).toBe("b");
  });

  it("moves backward to the previous code", () => {
    expect(nextRegion(codes, "b", -1)).toBe("a");
  });

  it("cycles from the last code back to the first (forward wrap)", () => {
    expect(nextRegion(codes, "c", 1)).toBe("a");
  });

  it("cycles from the first code back to the last (backward wrap)", () => {
    expect(nextRegion(codes, "a", -1)).toBe("c");
  });

  it("when nothing is selected, forward (→) lands on rank 1 (the first code)", () => {
    expect(nextRegion(codes, null, 1)).toBe("a");
  });

  it("when nothing is selected, backward (←) lands on the last code", () => {
    expect(nextRegion(codes, null, -1)).toBe("c");
  });

  it("treats a current code that isn't in the list the same as null (defensive fallback)", () => {
    expect(nextRegion(codes, "not-in-list", 1)).toBe("a");
    expect(nextRegion(codes, "not-in-list", -1)).toBe("c");
  });

  it("returns null for an empty code list, regardless of current/dir", () => {
    expect(nextRegion([], "a", 1)).toBeNull();
    expect(nextRegion([], null, 1)).toBeNull();
  });

  it("wraps correctly across multiple successive forward steps", () => {
    let code: string | null = "a";
    code = nextRegion(codes, code, 1); // b
    code = nextRegion(codes, code, 1); // c
    code = nextRegion(codes, code, 1); // a (wrap)
    expect(code).toBe("a");
  });
});

describe("regionRankList", () => {
  it("orders the Gangwon 시군 codes present in the map by descending value (rank 1 first)", () => {
    const map = new Map<string, number | null>([
      ["51110", 30],
      ["51130", 10],
      ["51150", 20],
    ]);
    const list = regionRankList(map);
    expect(list[0]).toBe("51110");
    expect(list[1]).toBe("51150");
    expect(list[2]).toBe("51130");
  });

  it("always returns all REGION_CODES, even when the map only has some of them", () => {
    const map = new Map<string, number | null>([["51110", 100]]);
    const list = regionRankList(map);
    expect(list).toHaveLength(REGION_CODES.length);
    expect(new Set(list)).toEqual(new Set(REGION_CODES));
  });

  it("puts ranked (non-null) codes before unranked (null-value) codes", () => {
    const map = new Map<string, number | null>([
      ["51110", null],
      ["51130", 5],
    ]);
    const list = regionRankList(map);
    expect(list.indexOf("51130")).toBeLessThan(list.indexOf("51110"));
  });

  it("keeps unranked codes in REGION_CODES order among themselves (stable fallback)", () => {
    const map = new Map<string, number | null>(); // nothing ranked at all
    const list = regionRankList(map);
    expect(list).toEqual(REGION_CODES);
  });

  it("gives tied values the same rank, keeping their REGION_CODES relative order (stable sort)", () => {
    const map = new Map<string, number | null>([
      ["51110", 10],
      ["51130", 10],
    ]);
    const list = regionRankList(map);
    // Both rank 1 (tie) — REGION_CODES lists 51110 before 51130, stable sort preserves that.
    expect(list.indexOf("51110")).toBeLessThan(list.indexOf("51130"));
  });
});

describe("selectionAnnouncement", () => {
  it("matches the brief's example format", () => {
    expect(
      selectionAnnouncement({ name: "춘천시", label: "학생수", valueText: "70,851명", rank: 1, total: REGION_CODES.length }),
    ).toBe(`춘천시 선택됨, 학생수 70,851명, ${REGION_CODES.length}개 시군 중 1위`);
  });

  it("falls back to '순위 없음' when rank is null (no data for this region)", () => {
    expect(
      selectionAnnouncement({ name: "춘천시", label: "학생수", valueText: "자료 없음", rank: null, total: REGION_CODES.length }),
    ).toBe("춘천시 선택됨, 학생수 자료 없음, 순위 없음");
  });
});

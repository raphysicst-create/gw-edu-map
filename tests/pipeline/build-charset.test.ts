import { describe, expect, it } from "vitest";

import { buildCharset } from "../../scripts/pipeline/build-charset";

describe("buildCharset", () => {
  it("includes every character from the given names", () => {
    const charset = buildCharset(["춘천시", "원주시"]);
    for (const ch of "춘천시원주") {
      expect(charset).toContain(ch);
    }
  });

  it("includes the fixed digit / unit / punctuation characters", () => {
    const charset = buildCharset(["춘천시"]);
    for (const ch of "0123456789.,%()/-+:·") {
      expect(charset).toContain(ch);
    }
    expect(charset).toContain("㎡");
    expect(charset).toContain(" ");
  });

  it("includes the fixed domain-term characters", () => {
    const charset = buildCharset(["춘천시"]);
    for (const ch of "명교급개학년증감률자료없음강원평균순위학생수교원소규모특수다문화폐면지역초중고") {
      expect(charset).toContain(ch);
    }
  });

  it("includes English upper and lower case letters", () => {
    const charset = buildCharset(["춘천시"]);
    for (const ch of "ABCXYZabcxyz") {
      expect(charset).toContain(ch);
    }
  });

  it("has no duplicate characters, even when names repeat characters", () => {
    const charset = buildCharset(["춘천시", "춘천시", "원주시"]);
    const seen = new Set<string>();
    for (const ch of charset) {
      expect(seen.has(ch)).toBe(false);
      seen.add(ch);
    }
  });

  it("is sorted", () => {
    const charset = buildCharset(["다바가"]);
    expect(Array.from(charset)).toEqual(Array.from(charset).sort());
  });

  it("returns a plain string, not a JSON-encoded one", () => {
    const charset = buildCharset(["춘천시"]);
    expect(typeof charset).toBe("string");
    expect(charset.startsWith('"')).toBe(false);
  });
});

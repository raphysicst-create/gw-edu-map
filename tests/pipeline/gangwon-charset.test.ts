import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildCharset } from "../../scripts/pipeline/build-charset";

describe("강원 지도 글꼴 문자셋", () => {
  it("학교명 밖의 숫자·단위·지도 공통 문구 글리프를 보존한다", () => {
    const charset = buildCharset(["춘천시", "강원초등학교"]);
    for (const char of "0123456789.,%()/-+:·㎡명교급개학년강원특별자치도평균순위학생수자료없음") {
      expect(charset).toContain(char);
    }
    expect(charset).toContain("A");
    expect(charset).toContain("z");
  });

  it("실제 공개 문자셋에 학교·시군·인접 시도·행정동 이름을 모두 넣는다", () => {
    const manifest = JSON.parse(readFileSync("public/data/manifest.json", "utf8"));
    if (manifest.releaseStatus !== "limited") return;
    const file = (logical: string) => JSON.parse(readFileSync(`public/data/${manifest.files[logical].path}`, "utf8"));
    const charset = file("charset.json").charset as string;
    const names = [
      ...file("schools.json").schools.map((school: { name: string }) => school.name),
      ...file("regions.geojson").features.map((feature: { properties: { name: string } }) => feature.properties.name),
      ...file("neighbors.geojson").features.map((feature: { properties: { name: string } }) => feature.properties.name),
      ...Object.keys(manifest.files).filter((logical: string) => logical.startsWith("emd/")).flatMap((logical: string) =>
        file(logical).features.map((feature: { properties: { name: string } }) => feature.properties.name)),
    ];
    for (const name of names) for (const char of name) expect(charset).toContain(char);
    expect(charset).toContain("㎡");
    expect(charset).toContain("0");
  });
});

import { describe, expect, it } from "vitest";
import { assertDatasetIdentity, assertReleaseManifest, type ReleaseManifest } from "../../src/lib/data/release";
import { INDICATOR_IDS } from "../../src/lib/indicators/registry";
import { ACTIVE_PROFILE } from "../../src/lib/profiles";
import { limitedManifest, preparingManifest } from "../fixtures/gangwon-release";

const manifest = (): ReleaseManifest => preparingManifest();

describe("강원 공개 자료 계약", () => {
  it("18개 시군·18개 지표·10개 주제를 각각 추적하는 준비 상태를 받는다", () => {
    const value = manifest();
    expect(ACTIVE_PROFILE.id).toBe("gangwon");
    expect(ACTIVE_PROFILE.regions).toHaveLength(18);
    expect(INDICATOR_IDS).toHaveLength(18);
    expect(ACTIVE_PROFILE.policy.issues).toHaveLength(10);
    expect(() => assertReleaseManifest(value)).not.toThrow();
  });

  it("다른 지역, 이전 스키마, 섞인 데이터 버전을 거부한다", () => {
    const value = manifest();
    expect(() => assertDatasetIdentity({ ...value, profileId: "jeonbuk" })).toThrow();
    expect(() => assertDatasetIdentity({ ...value, schemaVersion: 1 })).toThrow();
    expect(() => assertDatasetIdentity({ ...value, dataVersion: "../jeonbuk" })).toThrow();
    expect(() => assertDatasetIdentity(value, { profileId: "gangwon", schemaVersion: 2, dataVersion: "other-version" })).toThrow();
  });

  it("지표 또는 교육문제의 제공 상태·보류 사유가 빠지면 거부한다", () => {
    const value = manifest();
    delete value.indicators[INDICATOR_IDS[0]];
    expect(() => assertReleaseManifest(value)).toThrow(INDICATOR_IDS[0]);
    const other = manifest();
    delete other.issues[ACTIVE_PROFILE.policy.issues[0].id];
    expect(() => assertReleaseManifest(other)).toThrow(ACTIVE_PROFILE.policy.issues[0].id);
    const third = manifest();
    third.features.schools = { status: "unavailable", reason: "", sourceIds: [] };
    expect(() => assertReleaseManifest(third)).toThrow("미제공 사유");
  });

  it("준비 중인 자료를 전체 완료나 공개 값으로 표시하지 못한다", () => {
    const complete = manifest();
    complete.releaseStatus = "complete";
    expect(() => assertReleaseManifest(complete)).toThrow("전체 완료");
    const available = manifest();
    available.indicators[INDICATOR_IDS[0]] = {
      status: "available", sourceIds: ["unknown"], referenceDate: "2026-04-01", scope: "전국", years: [2026],
    };
    expect(() => assertReleaseManifest(available)).toThrow("공개 근거");
  });

  it("공개 파일에는 추적 가능한 공식 출처가 연결되어야 한다", () => {
    const value = limitedManifest();
    value.files["regions.geojson"].sourceIds = [];
    expect(() => assertReleaseManifest(value)).toThrow("출처");
  });
});

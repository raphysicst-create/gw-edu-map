import { describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/buildings/v1/[z]/[x]/[y]/route";
import { TILE_RANGE } from "@/lib/buildings/tiles";

describe("강원 건물 지도 공개 경계", () => {
  it("키가 있어도 이용 조건 심사 중에는 외부 요청 없이 503을 반환한다", async () => {
    vi.stubEnv("VWORLD_BUILDING_KEY", "private-test-credential");
    vi.stubEnv("BUILDINGS_ENABLED", "true");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    try {
      const response = await GET(new Request("http://localhost/api"), {
        params: Promise.resolve({ z: "16", x: String(TILE_RANGE.minX), y: String(TILE_RANGE.minY) }),
      });
      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(fetcher).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });
});

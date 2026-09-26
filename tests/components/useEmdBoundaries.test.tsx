import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { FeatureCollection } from "geojson";
import { useEmdBoundaries } from "@/components/map/useEmdBoundaries";
import { REGION_CODES } from "@/lib/geo/regions";
import { publishedManifest, testAvailable, testIdentity, TEST_DATA_VERSION, TEST_SHA256, TEST_SOURCE_ID } from "../fixtures/gangwon-release";

const manifest = publishedManifest();
manifest.features.emd = testAvailable();
for (const code of REGION_CODES) manifest.files[`emd/${code}.geojson`] = {
  path: `releases/${TEST_DATA_VERSION}/emd/${code}.geojson`, sha256: TEST_SHA256, sourceIds: [TEST_SOURCE_ID],
};
function Harness({ code, enabled, version = manifest }: { code: string | null; enabled: boolean; version?: typeof manifest }) {
  const { data, error, retry } = useEmdBoundaries(code, enabled, version);
  return <div><span data-testid="result">{data === null ? "null" : String(data.features.length)}</span>
    <span data-testid="error">{error ?? ""}</span><button onClick={retry}>다시 시도</button></div>;
}
function fc(count: number): FeatureCollection {
  return { type: "FeatureCollection", features: Array.from({ length: count }, (_, index) => ({
    type: "Feature", properties: { code: String(index), name: `검사용행정동${index}` },
    geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
  })) };
}
const ok = (count: number) => ({ ok: true, json: async () => ({ ...testIdentity(), ...fc(count) }) }) as Response;
const url = (code: string) => `/data/releases/${TEST_DATA_VERSION}/emd/${code}.geojson`;

describe("useEmdBoundaries", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("비활성, 미선택, 강원 밖 코드에서는 요청하지 않는다", () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    render(<><Harness code={REGION_CODES[0]} enabled={false} /><Harness code={null} enabled /><Harness code="99999" enabled /></>);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getAllByTestId("result").every((node) => node.textContent === "null")).toBe(true);
  });
  it("미제공 행정동 경계는 사유를 보여주고 요청하지 않는다", () => {
    const unavailable = publishedManifest();
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    render(<Harness code={REGION_CODES[1]} enabled version={unavailable} />);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("error")).toHaveTextContent("검증된 원본 미확보");
  });
  it("버전 경로에서 가져온 경계를 같은 버전·시군에 재사용한다", async () => {
    const code = REGION_CODES[2];
    const fetchMock = vi.fn(async () => ok(3)); vi.stubGlobal("fetch", fetchMock);
    const first = render(<Harness code={code} enabled />);
    await waitFor(() => expect(screen.getByTestId("result")).toHaveTextContent("3"));
    expect(fetchMock).toHaveBeenCalledWith(url(code), expect.objectContaining({ signal: expect.any(AbortSignal) }));
    first.unmount();
    render(<Harness code={code} enabled />);
    expect(screen.getByTestId("result")).toHaveTextContent("3");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("선택이 바뀐 뒤 늦게 온 응답은 현재 시군을 덮어쓰지 않는다", async () => {
    const a = REGION_CODES[3]; const b = REGION_CODES[4];
    const resolvers = new Map<string, (response: Response) => void>();
    vi.stubGlobal("fetch", vi.fn((path: string) => new Promise<Response>((resolve) => { resolvers.set(path, resolve); })));
    const view = render(<Harness code={a} enabled />);
    await waitFor(() => expect(resolvers.has(url(a))).toBe(true));
    view.rerender(<Harness code={b} enabled />);
    await waitFor(() => expect(resolvers.has(url(b))).toBe(true));
    resolvers.get(url(b))!(ok(2));
    await waitFor(() => expect(screen.getByTestId("result")).toHaveTextContent("2"));
    resolvers.get(url(a))!(ok(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByTestId("result")).toHaveTextContent("2");
  });
  it("언마운트된 요청은 캐시하지 않고 재선택하면 다시 요청한다", async () => {
    const code = REGION_CODES[5];
    let resolveFirst!: (response: Response) => void;
    const fetchMock = vi.fn().mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveFirst = resolve; })).mockImplementation(async () => ok(4));
    vi.stubGlobal("fetch", fetchMock);
    const first = render(<Harness code={code} enabled />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    first.unmount(); resolveFirst(ok(1));
    render(<Harness code={code} enabled />);
    await waitFor(() => expect(screen.getByTestId("result")).toHaveTextContent("4"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("HTTP 오류를 노출하고 다시 시도로 복구한다", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 503 }).mockResolvedValue(ok(2));
    vi.stubGlobal("fetch", fetchMock);
    render(<Harness code={REGION_CODES[6]} enabled />);
    await waitFor(() => expect(screen.getByTestId("error")).toHaveTextContent("503"));
    screen.getByRole("button", { name: "다시 시도" }).click();
    await waitFor(() => expect(screen.getByTestId("result")).toHaveTextContent("2"));
  });
  it("다른 release의 경계 응답을 차단한다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ ...fc(1), ...testIdentity(), dataVersion: "old-version" }) })));
    render(<Harness code={REGION_CODES[7]} enabled />);
    await waitFor(() => expect(screen.getByTestId("error")).toHaveTextContent("서로 다른 버전"));
    expect(screen.getByTestId("result")).toHaveTextContent("null");
  });
});

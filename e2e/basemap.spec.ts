import { openPanel, openMapSettings, expect, test } from "./fixtures";

test("배경지도 이용조건 검토 중에는 저장된 선택과 관계없이 타일을 요청하지 않는다", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("edu-map:gangwon:basemap:v1", "satellite"));
  let vworldRequests = 0;
  page.on("request", request => { if (request.url().includes("api.vworld.kr")) vworldRequests++; });
  await page.goto("/");
  await expect(page.locator('[data-map-ready="true"]')).toBeAttached({ timeout: 20000 });
  await openMapSettings(page);
  await expect(page.getByText("배경지도·건물 미제공 · VWorld API 저장·캐시 이용조건 검토 중")).toBeVisible();
  await expect(page.getByRole("radio", { name: "위성" })).toHaveCount(0);
  await expect(page.getByRole("radio", { name: "야간" })).toHaveCount(0);
  expect(await page.evaluate(() => window.__jbmap!.deck.props.layers?.flat().some(layer =>
    layer && "id" in layer && layer.id === "basemap",
  ))).toBe(false);
  expect(vworldRequests).toBe(0);
  await page.reload();
  await expect(page.locator('[data-map-ready="true"]')).toBeAttached({ timeout: 20000 });
  await openMapSettings(page);
  await expect(page.getByRole("radio", { name: "위성" })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("edu-map:gangwon:basemap:v1"))).toBe("satellite");
  expect(vworldRequests).toBe(0);
});

test("과거 지도 설정을 무시하고 입체 현황판을 표시하며 지형을 요청하지 않는다", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("jbmap.mapMode.v1", "terrain");
    localStorage.setItem("jbmap.basemap", "satellite");
  });
  let terrainRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/terrain/")) terrainRequests++;
  });
  await page.goto("/");
  await openPanel(page);
  await openMapSettings(page);
  for (let visit = 0; visit < 2; visit++) {
    await expect(page.locator('[data-map-ready="true"]')).toBeAttached({ timeout: 20000 });
    await expect(page.getByRole("radiogroup", { name: "지도 모드" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "발표 모드" })).toHaveCount(0);
    if (visit === 0) expect(await page.evaluate(() => (window.__jbmap!.deck.getViewports()[0] as import("@deck.gl/core").WebMercatorViewport).pitch)).toBe(20);
    await page.getByRole("searchbox", { name: "학교명 검색" }).fill("강원테스트초등학교");
    await page.locator('[data-testid^="school-row-"]').first().click();
    await expect(page.getByRole("heading", { name: "강원테스트초등학교" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__jbmap!.deck.getViewports()[0].zoom)).toBeCloseTo(16, 2);
    expect(terrainRequests).toBe(0);
    await expect(page).toHaveURL(/school=e2e-school-01/);
    await page.getByRole("radio", { name: "평면", exact: true }).click();
    await expect(page).toHaveURL(/scene=flat/);
    await expect.poll(() => page.evaluate(() => window.__jbmap!.deck.getViewports()[0].zoom)).toBeCloseTo(16, 2);
    await expect(page.getByRole("heading", { name: "강원테스트초등학교" })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("radio", { name: "입체 현황판" })).toHaveAttribute("aria-checked", "true");
    if (visit === 0) await page.reload();
  await openPanel(page);
  await openMapSettings(page);
  }
});

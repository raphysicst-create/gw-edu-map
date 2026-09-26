import { openMapSettings, test, expect } from "./fixtures";
import type { WebMercatorViewport } from "@deck.gl/core";
import type { Page } from "@playwright/test";

async function move(page: Page, zoom: number) {
  await page.evaluate(zoom => {
    const deck = window.__jbmap!.deck;
    const old = deck.getViewports()[0] as WebMercatorViewport;
    (deck as unknown as { _onViewStateChange: (args: unknown) => void })._onViewStateChange({
      viewId: old.id, interactionState: {},
      viewState: { longitude: 127.73, latitude: 37.88, zoom, pitch: old.pitch, bearing: 0, minZoom: 7.5, maxZoom: 18, transitionDuration: 0 },
    });
  }, zoom);
}

async function hasBuildingLayer(page: Page) {
  return page.evaluate(() => window.__jbmap!.deck.props.layers?.flat().some(layer =>
    layer && "id" in layer && String(layer.id).startsWith("buildings-"),
  ) ?? false);
}

test("건물 출처 검토 중에는 고배율·장면 전환에도 타일을 요청하지 않는다", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/buildings/**", route => { requests++; return route.fulfill({ status: 503, body: "{}" }); });
  await page.goto("/?scene=city");
  await openMapSettings(page);
  await expect(page.locator("#school-map")).toHaveAttribute("data-map-ready", "true");
  await expect(page.getByText("배경지도·건물 미제공 · VWorld API 저장·캐시 이용조건 검토 중")).toBeVisible();
  await move(page, 16);
  await expect.poll(() => page.evaluate(() => window.__jbmap!.deck.getViewports()[0].zoom)).toBeCloseTo(16, 2);
  expect(requests).toBe(0);
  expect(await hasBuildingLayer(page)).toBe(false);
  await page.getByRole("radio", { name: "평면", exact: true }).click();
  await expect(page).toHaveURL(/scene=flat/);
  await expect.poll(() => page.evaluate(() => (window.__jbmap!.deck.getViewports()[0] as WebMercatorViewport).pitch)).toBe(0);
  await page.getByRole("radio", { name: "입체 현황판" }).click();
  await expect(page).toHaveURL(/scene=city/);
  await expect.poll(() => page.evaluate(() => (window.__jbmap!.deck.getViewports()[0] as WebMercatorViewport).pitch)).toBe(45);
  expect(requests).toBe(0);
  expect(await hasBuildingLayer(page)).toBe(false);
});

test("모바일에서도 건물 요청은 차단되고 평면 선택은 새로고침 후 유지된다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let requests = 0;
  await page.route("**/api/buildings/**", route => { requests++; return route.fulfill({ status: 503, body: "{}" }); });
  await page.goto("/?scene=city");
  await openMapSettings(page);
  await expect(page.locator("#school-map")).toHaveAttribute("data-map-ready", "true");
  await move(page, 16);
  await expect.poll(() => page.evaluate(() => window.__jbmap!.deck.getViewports()[0].zoom)).toBeCloseTo(16, 2);
  expect(requests).toBe(0);
  expect(await hasBuildingLayer(page)).toBe(false);
  await page.getByRole("radio", { name: "평면", exact: true }).click();
  await page.getByRole("radio", { name: "입체 현황판" }).click();
  await expect.poll(() => page.evaluate(() => (window.__jbmap!.deck.getViewports()[0] as WebMercatorViewport).pitch)).toBe(40);
  await page.getByRole("radio", { name: "평면", exact: true }).click();
  await expect(page).toHaveURL(/scene=flat/);
  await page.reload();
  await openMapSettings(page);
  await expect(page.getByRole("radio", { name: "평면", exact: true })).toHaveAttribute("aria-checked", "true");
  expect(requests).toBe(0);
});

import { test, expect } from "@playwright/test";
import { preparingManifest } from "../tests/fixtures/gangwon-release";

for (const [name, width, height] of [
  ["desktop", 1440, 900], ["laptop", 1024, 768],
  ["tablet", 768, 1024], ["mobile", 390, 844],
] as const) {
  test(`Gangwon preparing release at ${name}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.route("**/data/manifest.json", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(preparingManifest()) }));
    await page.goto("/?region=52110&indicator=closed_schools&view=issues&issue=school-size");
    await expect(page.getByRole("heading", { name: "강원 교육지도 자료 준비 중" })).toBeVisible();
    await expect(page.getByRole("region", { name: "지표 제공 상태" }).locator("li")).toHaveCount(18);
    await expect(page.getByRole("region", { name: "교육문제 제공 상태" }).locator("li")).toHaveCount(10);
    await expect(page.getByRole("region", { name: "지표 제공 상태" }).locator("li", { hasText: "폐교 수(등재)" })).toContainText("미제공");
    await expect(page.locator("body")).not.toContainText("전북");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    await page.screenshot({ path: `test-results/gangwon-preparing-${name}.png`, fullPage: true });
  });
}

test("manifest error gives a retry that returns to the preparing state", async ({ page }) => {
  let calls = 0;
  await page.route("**/data/manifest.json", async route => {
    calls++;
    if (calls === 1) await route.fulfill({ status: 503, body: "temporarily unavailable" });
    else await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(preparingManifest()) });
  });
  await page.goto("/");
  await expect(page.getByText("데이터를 불러오지 못했습니다.")).toBeVisible();
  await page.getByRole("button", { name: "다시 시도" }).click();
  await expect(page.getByRole("heading", { name: "강원 교육지도 자료 준비 중" })).toBeVisible();
  expect(calls).toBeGreaterThanOrEqual(2);
});

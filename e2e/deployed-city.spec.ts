import { test, expect } from "@playwright/test";

test("deployed city view handles unlocated Gangwon schools and unavailable issue data", async ({ page }) => {
  const site = process.env.DEPLOYMENT_URL;
  test.skip(!site, "Requires a deployed site URL");
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("response", response => {
    if (response.url().includes("/api/buildings/") && response.status() >= 400) errors.push(`Building API ${response.status()}`);
  });

  // The public 2022 school file intentionally contains no verified school
  // coordinates. Selecting a school in city mode must keep its data visible
  // without inventing a building location or making a building request.
  await page.goto(`${site}/?scene=city&school=kedi-420041050`);
  await expect(page.getByRole("heading", { name: "강원대학교사범대학부설고등학교" })).toBeVisible();
  await expect(page.getByText("위치 자료 없음 · 지도에 표시할 수 없습니다.")).toBeVisible();
  await expect(page.getByText(/건물 조회:/)).toHaveCount(0);
  await expect(page.locator("#school-map")).toHaveAttribute("data-map-ready", "true");
  await page.screenshot({ path: "test-results/deployed-city-desktop.png" });

  // Gangwon policy topics are explicitly unavailable until their sources are
  // verified; the deployed experience should expose that state rather than
  // showing unsupported policy datasets as if they were verified.
  for (const issue of ["regional-sustainability", "special-education"]) {
    await page.goto(`${site}/?view=issues&issue=${issue}`);
    await expect(page.locator("body")).toContainText("미제공");
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${site}/?view=schools&school=kedi-420041050`);
  await expect(page.getByText("강원대학교사범대학부설고등학교").first()).toBeVisible();
  await expect(page.getByText("위치 자료 없음 · 지도에 표시할 수 없습니다.")).toBeVisible();
  await expect(page.locator("#school-map")).toHaveAttribute("data-map-ready", "true");
  await page.screenshot({ path: "test-results/deployed-city-mobile.png" });
  expect(errors).toEqual([]);
});

import { test, expect } from "@playwright/test";

test("deployed education view follows the limited 2022 Gangwon release", async ({ page }) => {
  const site = process.env.DEPLOYMENT_URL;
  test.skip(!site, "Requires a deployed site URL");
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));

  await page.goto(`${site}/`);
  await expect(page.locator("#school-map")).toHaveAttribute("data-map-ready", "true");
  const legend = page.getByTestId("metric-legend");
  await expect(legend).toContainText("147,101명");
  await expect(page.getByRole("complementary")).not.toBeVisible();

  await page.getByRole("button", { name: "교육여건", exact: true }).click();
  await expect(legend).toContainText("학급당 학생수");
  await page.getByRole("button", { name: "작은학교", exact: true }).click();
  await expect(legend).toContainText("252교");

  // This topic is not supplied in the limited release. Keep the visible
  // availability disclosure under test instead of expecting retired issue
  // overlays and 2026 counts.
  await page.getByRole("button", { name: "특수교육", exact: true }).click();
  await expect(page.locator("body")).toContainText("미제공");

  await page.goto(`${site}/?indicator=special_classes`);
  await expect(legend).toContainText("549학급");
  await expect(legend).toContainText("특수학교 포함");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${site}/`);
  const selector = page.getByRole("combobox", { name: "교육현황 빠른 선택" });
  await selector.selectOption("small_schools");
  await expect(legend).toContainText("252교");
  await selector.selectOption("special-education");
  await expect(page.locator("body")).toContainText("미제공");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: "test-results/deployed-education-city-mobile.png" });
  expect(errors).toEqual([]);
});

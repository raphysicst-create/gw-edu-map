import { expect, test } from "@playwright/test";

test("deployed special schools expose honest location availability", async ({ page, request }) => {
  const site = process.env.DEPLOYMENT_URL;
  test.skip(!site, "Requires a deployed site URL");

  const manifestResponse = await request.get(`${site}/data/manifest.json`);
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json();
  const schoolsPath = manifest.files["schools.json"]?.path;
  expect(typeof schoolsPath).toBe("string");
  const schoolsResponse = await request.get(`${site}/data/${schoolsPath}`);
  expect(schoolsResponse.ok()).toBe(true);
  const data = await schoolsResponse.json();
  const specials = data.schools.filter((school: { level: string }) => school.level === "special");
  expect(specials.length).toBeGreaterThan(0);
  for (const school of specials) {
    expect(school.lat).toBeNull();
    expect(school.lng).toBeNull();
    expect(typeof school.locationMissingReason).toBe("string");
  }

  const school = specials[0];
  await page.goto(`${site}/?scene=flat&school=${encodeURIComponent(school.id)}`);
  await expect(page.getByText(school.name).first()).toBeVisible();
  await expect(page.getByText("위치 자료 없음 · 지도에 표시할 수 없습니다.")).toBeVisible();
  await page.getByRole("button", { name: "학교·통계", exact: true }).click();
  await page.getByRole("group", { name: "학교급 필터" }).getByRole("button", { name: "특수", exact: true }).click();
  await expect(page.getByTestId("school-result-count")).toContainText(`검색 결과 ${specials.length}개 · 지도 표시 가능 0개`);
  await expect(page.locator("#school-map")).toHaveAttribute("data-map-ready", "true");
  await page.screenshot({ path: "test-results/deployed-special-schools.png" });
});

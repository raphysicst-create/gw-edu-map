import { openPanel, expect, test } from "./fixtures";

test("시군 통계에서 강원 전체와 선택 지역의 연도별 추이를 살펴본다", async ({ page }) => {
  await page.goto("/?view=statistics&indicator=students_total");
  await openPanel(page);
  const province = page.getByRole("region", { name: "강원 전체 학생수 시계열 추이" });
  await expect(province).toBeVisible();
  await expect(province.getByRole("img", { name: /2022년부터 2026년까지/ })).toBeVisible();
  await province.getByRole("button", { name: /2022/ }).click();
  await expect(province).toContainText("2022년");

  await page.goto("/?view=statistics&indicator=students_total&region=51110");
  await openPanel(page);
  const city = page.getByRole("region", { name: "춘천시 학생수 시계열 추이" });
  await expect(city).toBeVisible();
  await city.getByRole("button", { name: /2026/ }).click();
  await expect(city).toContainText("2026년");
  await expect(city).toContainText("2022년 대비");
});

test("단일 연도 지표에서 학생수 원자료 추이로 이동한다", async ({ page }) => {
  await page.goto("/?view=statistics&indicator=students_change_5y&region=51110");
  await openPanel(page);
  const chart = page.getByRole("region", { name: /춘천시 .* 시계열 추이/ });
  await expect(chart).toContainText("추이 없음");
  await chart.getByRole("button", { name: "학생수 연도별 추이 보기" }).click();
  await expect(page).not.toHaveURL(/indicator=students_change_5y/);
  await expect(page.getByRole("region", { name: "춘천시 학생수 시계열 추이" })).toBeVisible();
});

test("특수교육 질문은 일반학교 특수학급만의 시계열을 보여준다", async ({ page }) => {
  await page.goto("/?view=issues&issue=special-education&issueMetric=special-classes");
  await openPanel(page);
  const chart = page.getByRole("region", { name: "강원 전체 일반학교 특수학급 수 시계열 추이" });
  await expect(chart).toContainText("2026년 559학급");
  await chart.getByRole("button", { name: /2022/ }).click();
  await expect(chart).toContainText("2022년 422학급");
});

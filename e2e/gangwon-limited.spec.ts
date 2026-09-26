import { test, expect } from "@playwright/test";

for (const [name, width, height] of [
  ["desktop", 1440, 900], ["laptop", 1024, 768],
  ["tablet", 768, 1024], ["mobile", 390, 844], ["compact-mobile", 360, 640],
] as const) {
  test(`2022 limited release at ${name}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.setViewportSize({ width, height });
    await page.goto("/?indicator=students_total&region=51110");
    await expect(page.getByText("2022년 통계 · 제한 공개")).toBeVisible();
    await expect(page.getByText("147,101", { exact: true })).toBeVisible();
    await expect(page.getByText("634", { exact: true })).toBeVisible();
    await expect(page.locator("body")).toContainText("공식 학교 좌표 미확보");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    expect(errors).toEqual([]);
    await page.screenshot({ path: `test-results/gangwon-limited-${name}.png`, fullPage: true });
  });
}

test("unavailable indicator and old Jeonbuk URL stay explicit", async ({ page }) => {
  await page.goto("/?indicator=closed_schools&region=52110");
  await expect(page.getByText("2022년 통계 · 제한 공개")).toBeVisible();
  await expect(page.locator("body")).toContainText("전체 폐교재산 명단이 필요합니다");
  await expect(page.locator("body")).toContainText("선택 해제됨, 전체 보기");
  await expect(page.locator("body")).not.toContainText("전북");
});

test("all ten policy topics disclose their unavailable reasons", async ({ page }) => {
  await page.goto("/?view=issues&issue=school-size");
  await expect(page.getByText("교육문제 10개 주제")).toBeVisible();
  const topics = page.getByRole("region", { name: "교육문제 제공 상태" }).locator("li");
  await expect(topics).toHaveCount(10);
  for (let i = 0; i < 10; i++) await expect(topics.nth(i)).toContainText("미제공 ·");
});

test("school detail remains usable without a fabricated map coordinate", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?view=schools&school=kedi-420041050");
  await expect(page.getByText("강원대학교사범대학부설고등학교").first()).toBeVisible();
  await expect(page.getByText("위치 자료 없음 · 지도에 표시할 수 없습니다.")).toBeVisible();
  await expect(page.getByText("지도 표시 가능 0개")).toBeVisible();
  await page.screenshot({ path: "test-results/gangwon-limited-school-mobile.png" });
});

test("without WebGL the region table and unlocated school search still work", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args) {
      if (args[0] === "webgl2") return null;
      return original.apply(this, args);
    } as typeof original;
  });
  await page.goto("/?view=schools");
  await expect(page.getByText("이 환경에서는 지도를 표시할 수 없어 표로 보여드립니다")).toBeVisible();
  await expect(page.getByRole("table").getByRole("row")).toHaveCount(19);
  await page.getByRole("button", { name: "학교·통계" }).click();
  await page.getByPlaceholder("학교 이름을 입력하세요").fill("강원체육중학교");
  await page.getByRole("button", { name: /강원체육중학교/ }).click();
  await expect(page.getByText("위치 자료 없음 · 지도에 표시할 수 없습니다.")).toBeVisible();
});

test("manifest load failure retries into the limited release", async ({ page }) => {
  let calls = 0;
  await page.route("**/data/manifest.json", async route => {
    calls++;
    if (calls === 1) await route.fulfill({ status: 503, body: "temporarily unavailable" });
    else await route.continue();
  });
  await page.goto("/");
  await expect(page.getByText("데이터를 불러오지 못했습니다.")).toBeVisible();
  await page.getByRole("button", { name: "다시 시도" }).click();
  await expect(page.getByText("2022년 통계 · 제한 공개")).toBeVisible();
  expect(calls).toBeGreaterThanOrEqual(2);
});

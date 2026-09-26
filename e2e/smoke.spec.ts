import { docShot, expect, test } from "./fixtures";

test("home page renders the flat school map with 18 Gangwon regions and no console errors", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    consoleErrors.push(error.message);
  });

  await page.goto("/");

  await expect(page).toHaveTitle(/강원 교육지도/);
  await expect(page.locator("canvas")).toBeVisible({ timeout: 15000 });
  await expect(page.locator('[data-map-ready="true"]')).toBeAttached({ timeout: 20000 });

  // CI Linux fix (ci-linux-fixes branch, see ci-fix-report.md) — also wait
  // for data-labels-ready: an actual deck.gl render frame that occurred
  // once the font was ready, i.e. AFTER deck.gl's synchronous SDF-atlas
  // build for the label TextLayer (see DeckMap.tsx's handleAfterRender
  // comment) — not just data-font-ready (the font itself finished
  // loading), which resolves earlier and isn't enough to guarantee the
  // screenshot below actually shows labels.
  await expect(page.locator('[data-labels-ready="true"]')).toBeAttached({ timeout: 20000 });

  // The glyphs the region labels actually need are ready in the font
  // DeckMap resolved (see DeckMap.tsx's gateFont(), which reads `--font-sans`
  // from document.body — see task-1A-report.md's fix-round-1 section for why
  // documentElement is wrong here). Checked against the FULL charset.json
  // string (316 chars: digits, units like 명/㎡/%, punctuation), not just a
  // 시군 name — 추가 요구 #6: labels now render formatted indicator values
  // (e.g. "70,444명"), not just names, so gating on 24 Hangul characters
  // alone (as Task 1A did) would miss a missing font-family slice covering
  // only digits or only a unit character. `document.fonts.check()` is
  // called with real text, not the default (space) it probes without a
  // `text` argument.
  //
  // CI Linux fix (ci-linux-fixes branch, see ci-fix-report.md) — checked
  // against the PRIMARY font-family only (the first entry of `--font-sans`),
  // exactly like useFontGate.ts's primaryFamily() now does, NOT the full
  // two-family var. next/font's `--font-sans` always appends a second,
  // auto-generated metrics-only fallback face sourced via
  // `local("Arial")`; `document.fonts.check()`/`load()` on a multi-family
  // list fail for the WHOLE list the instant any one family resolves to a
  // FontFace with status "error" — and a bare Linux CI runner has no
  // "Arial" installed, so that local() source never resolves there. This
  // isn't a real coverage gap: every character in charset.json (including
  // "㎡"/"·") sits inside the PRIMARY "Noto Sans KR" face's own declared
  // unicode-range (confirmed by parsing the built CSS), so the fallback
  // face is never actually needed to render a label — checking primary-only
  // matches both what the app itself gates on and what's actually true.
  const koreanGlyphsReady = await page.evaluate(async () => {
    const fallback = "'Noto Sans KR', sans-serif";
    const cssVar = getComputedStyle(document.body).getPropertyValue("--font-sans").trim();
    const family = (cssVar || fallback).split(",")[0].trim();
    const charset: string = await fetch("/data/charset.json").then((r) => r.json());
    await document.fonts.load(`600 16px ${family}`, charset);
    return document.fonts.check(`600 16px ${family}`, charset);
  });
  expect(koreanGlyphsReady).toBe(true);

  await docShot(page, "overview");

  expect(consoleErrors).toEqual([]);
});

import { expect, test, type Page } from "@playwright/test";

const card = (page: Page, name: string) => page.locator(`[data-testid=menu-item][data-name="${name}"] [data-testid=menu-card]`);

/** Tapping a menu selects it and opens its input sheet. */
async function openMenu(page: Page, name: string) {
  await card(page, name).click();
  await expect(page.getByTestId("log-sheet")).toBeVisible();
}
const summary = (page: Page) => page.getByTestId("preset-summary").last();
const closeSheet = (page: Page) => page.getByTestId("sheet-scrim").last().click({ position: { x: 20, y: 20 } });

const MENUS = [
  { id: "m1", name: "ベンチプレス", category: "chest", weight: 60, reps: 10, sets: 3 },
  { id: "m2", name: "スクワット", category: "legs", weight: 80, reps: 8, sets: 3 },
];

async function seedMenus(page: Page) {
  await page.evaluate((exercises) => localStorage.setItem("rep-timer", JSON.stringify({ state: { exercises }, version: 2 })), MENUS);
  await page.reload();
  await expect(page.getByTestId("menu-item")).toHaveCount(2);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByTestId("timer-panel")).toBeVisible();
});

test("free plan: a silent banner ad, and Pro features open the upgrade sheet", async ({ page }) => {
  await seedMenus(page);
  const ad = page.getByTestId("ad-slot").first();
  await expect(ad).toBeVisible();
  await expect(ad).toContainText("広告");
  await expect(page.getByTestId("pro-button")).toHaveAttribute("data-pro", "false");

  // The house ad leads to the upgrade sheet.
  await ad.locator("button").click();
  const sheet = page.getByTestId("pro-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("広告なし");
  await expect(sheet).toContainText("無料のまま");
  const config = await (await page.request.get("/api/config")).json();
  if (config.billing.enabled) await expect(sheet.getByTestId("pro-login")).toBeVisible();
  else await expect(sheet.getByTestId("pro-subscribe")).toHaveText("準備中");
  await closeSheet(page);
  await expect(sheet).toBeHidden();

  // Superset / tempo timers are locked.
  await page.getByTestId("preset-add").click();
  await page.getByTestId("kind-superset").click();
  await expect(sheet).toBeVisible();
  await closeSheet(page);
  await expect(sheet).toBeHidden();
  await closeSheet(page);
  await expect(page.getByTestId("preset-editor")).toBeHidden();

  // Set types, the rest timer and the 1RM graph are locked in the log sheet.
  await openMenu(page, "ベンチプレス");
  const log = page.getByTestId("log-sheet");
  await expect(log.getByTestId("e1rm-lock")).toBeVisible();
  await log.getByTestId("set-rest").first().click();
  await expect(sheet).toBeVisible();
  await closeSheet(page);
  await expect(sheet).toBeHidden();
  await expect(page.getByTestId("rest-banner")).toHaveCount(0);
  await log.getByTestId("set-type").first().click();
  await expect(sheet).toBeVisible();
  await closeSheet(page);
  await expect(sheet).toBeHidden();
  await expect(log.getByTestId("set-type").first()).toHaveAttribute("data-type", "N");
  await closeSheet(page);
  await expect(log).toBeHidden();

  // The heatmap is locked in the calendar.
  await page.getByTestId("calendar-button").click();
  await expect(page.getByTestId("heatmap-lock")).toBeVisible();
  await expect(page.getByTestId("calendar").getByTestId("ad-slot")).toBeVisible();
});

test("CSV export and import (Strong format) are free", async ({ page }) => {
  await seedMenus(page);
  await openMenu(page, "ベンチプレス");
  await page.getByTestId("log-save").click();
  await closeSheet(page);

  await page.getByTestId("account-button").click();
  const download = page.waitForEvent("download");
  await page.getByTestId("csv-export").click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^reps-\d{8}\.csv$/);
  const chunks: Uint8Array[] = await (await file.createReadStream()).toArray();
  const text = new TextDecoder().decode(new Uint8Array(chunks.flatMap((c) => [...c])));
  expect(text).toContain("日時,種目,部位,セット,種類,重量(kg),回数");
  expect(text.match(/ベンチプレス,胸/g)).toHaveLength(3);

  const strong = "Date,Workout Name,Exercise Name,Set Order,Weight,Reps\n2026-10-02 09:00:00,Push,Overhead Press,1,40,8\n2026-10-02 09:00:00,Push,Overhead Press,2,42.5,6\n";
  await page.getByTestId("csv-import").setInputFiles({ name: "strong.csv", mimeType: "text/csv", buffer: Buffer.from(strong) });
  await expect(page.getByTestId("csv-result")).toHaveText("1件の記録・1件のメニューを読み込みました");
  // Importing the same file again is harmless.
  await page.getByTestId("csv-import").setInputFiles({ name: "strong.csv", mimeType: "text/csv", buffer: Buffer.from(strong) });
  await expect(page.getByTestId("csv-result")).toHaveText("0件の記録・0件のメニューを読み込みました（1件スキップ）");
  await closeSheet(page);
  await expect(page.locator('[data-testid=menu-item][data-name="Overhead Press"]')).toHaveAttribute("data-cat", "shoulder");
  await expect(card(page, "Overhead Press")).toContainText("40kg×8 / 42.5kg×6");
});

test("subscribe to Pro, use every Pro feature, then cancel (local test mode)", async ({ page }) => {
  const login = await page.request.post("/api/dev/login", { data: { id: "e2e-pro", email: "e2e@example.test" } });
  test.skip(login.status() === 404, "Stripe test mode is only available locally");
  await seedMenus(page);
  await expect(page.getByTestId("pro-button")).toHaveAttribute("data-pro", "false");

  // Checkout → (simulated Stripe webhook) → back in the app as Pro.
  await page.getByTestId("pro-button").click();
  await page.getByTestId("pro-subscribe").click();
  await page.waitForURL((u) => u.pathname === "/" && !u.search);
  await expect(page.getByTestId("toast")).toContainText("Pro になりました");
  await expect(page.getByTestId("pro-button")).toHaveAttribute("data-pro", "true");
  await expect(page.getByTestId("ad-slot")).toHaveCount(0);

  // Rest timer by set type, with the next set and plates visible while resting.
  await openMenu(page, "ベンチプレス");
  const log = page.getByTestId("log-sheet");
  await expect(log.getByTestId("e1rm-lock")).toHaveCount(0);
  await expect(log.getByTestId("e1rm-chart")).toBeVisible();
  await log.getByTestId("set-type").first().click();
  await expect(log.getByTestId("set-type").first()).toHaveAttribute("data-type", "W");
  await log.getByTestId("set-rest").first().click();
  const banner = page.getByTestId("rest-banner");
  await expect(banner).toBeVisible();
  expect(Number(await page.getByTestId("rest-clock").getAttribute("data-sec"))).toBeLessThanOrEqual(60);
  await expect(page.getByTestId("rest-next")).toHaveText("60kg × 10");
  await expect(page.getByTestId("rest-plates")).toContainText("片側 20kg");
  // The form stays usable during the rest.
  await log.getByRole("textbox", { name: "2セット目の重量" }).fill("70");
  await expect(log.getByRole("textbox", { name: "2セット目の重量" })).toHaveValue("70");
  await page.getByTestId("rest-skip").click();
  await expect(banner).toBeHidden();
  // A drop set uses its own (short) rest.
  await log.getByTestId("set-type").nth(2).click();
  await log.getByTestId("set-type").nth(2).click();
  await expect(log.getByTestId("set-type").nth(2)).toHaveAttribute("data-type", "D");
  await log.getByTestId("set-rest").nth(2).click();
  expect(Number(await page.getByTestId("rest-clock").getAttribute("data-sec"))).toBeLessThanOrEqual(15);
  await expect(banner).toContainText("最後のセット");
  await page.getByTestId("rest-skip").click();
  await log.getByTestId("log-save").click();
  await expect(log.getByTestId("log-row")).toContainText("60kg×10 / 70kg×10 / 60kg×10");
  await closeSheet(page);

  // Superset timer: A → switch → B → rest.
  await page.getByTestId("preset-add").click();
  const editor = page.getByTestId("preset-editor");
  await editor.getByTestId("kind-superset").click();
  await editor.getByRole("textbox", { name: "種目A", exact: true }).fill("20");
  await editor.getByRole("textbox", { name: "移動", exact: true }).fill("10");
  await editor.getByRole("textbox", { name: "セット数", exact: true }).fill("2");
  await editor.getByTestId("preset-save").click();
  await expect(editor).toBeHidden();
  await expect(summary(page)).toContainText("移動");
  await page.getByTestId("start-button").click();
  const phase = page.getByTestId("timer-phase");
  await expect(phase).toHaveText("READY");
  for (const expected of ["WORK A", "SWITCH", "WORK B", "REST", "WORK A"]) {
    await page.getByTestId("timer-skip").click();
    await expect(phase).toHaveText(expected);
  }
  await page.getByTestId("timer-close").click();

  // Tempo timer: phases per rep and TUT.
  await page.getByTestId("preset-add").click();
  await editor.getByTestId("kind-tempo").click();
  await expect(editor.getByTestId("editor-tut")).toHaveText("TUT 60秒 / セット");
  await editor.getByTestId("preset-save").click();
  await expect(page.getByTestId("summary-tut")).toContainText("TUT 60秒/セット");
  await page.getByTestId("start-button").click();
  await page.getByTestId("timer-skip").click();
  await expect(phase).toHaveText("DOWN");
  await expect(page.getByTestId("timer-sub")).toHaveText("下ろす");
  await expect(page.getByTestId("timer-rep")).toHaveText("REP 1 / 10");
  await page.getByTestId("timer-skip").click();
  await expect(phase).toHaveText("HOLD");
  await page.getByTestId("timer-skip").click();
  await expect(phase).toHaveText("UP");
  await page.getByTestId("timer-skip").click();
  await expect(phase).toHaveText("DOWN");
  await expect(page.getByTestId("timer-rep")).toHaveText("REP 2 / 10");
  await page.getByTestId("timer-close").click();

  // Heatmap in the calendar.
  await page.getByTestId("calendar-button").click();
  await expect(page.getByTestId("heatmap-lock")).toHaveCount(0);
  await expect(page.locator("[data-testid=heat-cell][data-cat=chest]")).toContainText("3");
  await page.getByTestId("cal-close").click();

  // Rest times are editable in settings.
  await page.getByTestId("account-button").click();
  await expect(page.getByTestId("rest-times")).toBeVisible();
  await page.getByRole("textbox", { name: "メインの休憩" }).fill("150");
  await closeSheet(page);

  // Cancel from the customer portal → free again, ads back.
  await page.getByTestId("pro-button").click();
  await expect(page.getByTestId("pro-active")).toBeVisible();
  await page.getByTestId("pro-manage").click();
  await page.waitForURL((u) => u.pathname === "/" && !u.search);
  await expect(page.getByTestId("pro-button")).toHaveAttribute("data-pro", "false");
  await expect(page.getByTestId("ad-slot").first()).toBeVisible();
  // Saved Pro timers stay, but starting one asks for Pro again.
  await page.getByTestId("start-button").click();
  await expect(page.getByTestId("pro-sheet")).toBeVisible();
  await expect(page.getByTestId("timer-overlay")).toHaveCount(0);
});

test("the creator's account gets Pro for free, and Pro spots are marked with a crown", async ({ page }) => {
  // Free users already see where Pro lives: crowns on the set type and rest buttons, and where each feature is.
  await seedMenus(page);
  await openMenu(page, "ベンチプレス");
  expect(await page.getByTestId("log-sheet").getByTestId("pro-dot").count()).toBeGreaterThanOrEqual(2);
  await closeSheet(page);
  await page.getByTestId("pro-button").click();
  await expect(page.getByTestId("pro-where")).toHaveCount(6);
  await expect(page.getByTestId("pro-where").nth(1)).toContainText("記録画面");
  await closeSheet(page);

  // OWNER_EMAILS (a secret) lists the creator; that account is Pro without a subscription.
  const login = await page.request.post("/api/dev/login", { data: { id: "e2e-owner", email: "owner@example.test" } });
  test.skip(login.status() === 404, "test sign-in is only available locally");
  await page.reload();
  await expect(page.getByTestId("pro-button")).toHaveAttribute("data-pro", "true");
  await expect(page.getByTestId("ad-slot")).toHaveCount(0);
  await page.getByTestId("pro-button").click();
  await expect(page.getByTestId("pro-active")).toHaveAttribute("data-owner", "true");
  await expect(page.getByTestId("pro-active")).toContainText("製作者アカウント");
  await expect(page.getByTestId("pro-manage")).toHaveCount(0);
  await closeSheet(page);
  await seedMenus(page);
  await openMenu(page, "ベンチプレス");
  await page.getByTestId("log-sheet").getByTestId("set-type").first().click();
  await expect(page.getByTestId("log-sheet").getByTestId("set-type").first()).toHaveAttribute("data-type", "W");
  await expect(page.getByTestId("pro-sheet")).toHaveCount(0);
  // The server agrees: checkout is refused for an account that already has Pro.
  expect((await page.request.post("/api/billing/checkout")).status()).toBe(409);
});

test("billing API guards", async ({ request, baseURL }) => {
  expect((await request.post("/api/billing/checkout")).status()).toBe(401);
  expect((await request.post("/api/billing/portal")).status()).toBe(401);
  const hook = await request.post("/api/billing/webhook", { data: { type: "checkout.session.completed" }, headers: { "stripe-signature": "t=1,v1=bad" } });
  expect([400, 503]).toContain(hook.status());
  if (!/localhost|127\.0\.0\.1/.test(baseURL ?? "")) {
    expect((await request.post("/api/dev/login")).status()).toBe(404);
    expect((await request.get("/api/dev/checkout")).status()).toBe(404);
  }
  const me = await request.get("/api/config");
  expect(await me.json()).toMatchObject({ billing: { price: expect.any(String) } });
});

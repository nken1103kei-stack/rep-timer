import { expect, test, type Locator, type Page } from "@playwright/test";

async function swipe(page: Page, target: Locator, dx: number) {
  const box = (await target.boundingBox())!;
  const x = box.x + box.width / 2 - (dx > 0 ? 80 : -80);
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 14; i++) {
    await page.mouse.move(x + (dx * i) / 14, y);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
}

const summary = (page: Page) => page.getByTestId("preset-summary").last();

const card = (page: Page, name: string) => page.locator(`[data-testid=menu-item][data-name="${name}"] [data-testid=menu-card]`);

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByTestId("timer-panel")).toBeVisible();
});

test("shows a full-screen skeleton, then menus and timers on the first screen", async ({ page }) => {
  await page.route("**/api/me", async (route) => {
    await new Promise((r) => setTimeout(r, 1200));
    await route.continue();
  });
  await page.reload();
  await expect(page.getByTestId("skeleton")).toBeVisible();
  await expect(page.getByTestId("timer-panel")).toBeVisible();
  await expect(page.getByTestId("skeleton")).toBeHidden();

  // Both choices are above the fold without scrolling.
  const viewport = page.viewportSize()!;
  for (const el of [page.getByTestId("preset-chip").first(), page.getByTestId("start-button"), page.getByTestId("menu-card").first()]) {
    const box = (await el.boundingBox())!;
    expect(box.y + box.height).toBeLessThan(viewport.height);
  }
  await expect(page.getByTestId("menu-item")).toHaveCount(4);
  await expect(page.getByTestId("preset-chip")).toHaveCount(5);
});

test("tap selects and deselects a menu", async ({ page }) => {
  await card(page, "ベンチプレス").click();
  await expect(card(page, "ベンチプレス")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("selected-menu")).toContainText("ベンチプレス");
  await card(page, "スクワット").click();
  await expect(page.getByTestId("selected-menu")).toContainText("スクワット");
  await card(page, "スクワット").click();
  await expect(page.getByTestId("selected-menu")).toContainText("メニュー未選択");
});

test("add a menu with the + button", async ({ page }) => {
  await page.getByTestId("menu-add").click();
  const sheet = page.getByTestId("menu-editor");
  await expect(sheet).toBeVisible();
  await sheet.getByLabel("種目名").fill("ショルダープレス");
  await sheet.getByLabel("重量を増やす").click();
  await sheet.getByTestId("menu-save").click();
  await expect(sheet).toBeHidden();
  await expect(page.getByTestId("menu-item")).toHaveCount(5);
  await expect(card(page, "ショルダープレス")).toContainText("22.5kg × 10 × 3");
});

test("flick right opens the log, records a set, and flick deletes a log row", async ({ page }) => {
  await swipe(page, card(page, "スクワット"), 220);
  const sheet = page.getByTestId("log-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("スクワット");
  await sheet.getByLabel("重量を増やす").click();
  await sheet.getByTestId("log-save").click();
  await expect(sheet.getByTestId("log-row")).toHaveCount(1);
  await expect(sheet.getByTestId("log-row")).toContainText("82.5kg × 8 × 3");
  await expect(sheet).toContainText("82.5kg");

  await swipe(page, sheet.getByTestId("log-row").first(), -220);
  await expect(sheet.getByTestId("log-row")).toHaveCount(0);

  await page.getByTestId("sheet-scrim").click({ position: { x: 20, y: 20 } });
  await expect(sheet).toBeHidden();
  await expect(card(page, "スクワット")).toContainText("82.5kg × 8 × 3");
});

test("flick left deletes a menu and undo restores it", async ({ page }) => {
  await swipe(page, card(page, "デッドリフト"), -240);
  await expect(page.getByTestId("menu-item")).toHaveCount(3);
  await expect(page.getByTestId("toast")).toContainText("デッドリフトを削除");
  await page.getByTestId("toast-undo").click();
  await expect(page.getByTestId("menu-item")).toHaveCount(4);
  await expect(page.getByTestId("menu-item").nth(2)).toHaveAttribute("data-name", "デッドリフト");
});

test("edit a menu from the log sheet", async ({ page }) => {
  await swipe(page, card(page, "懸垂"), 220);
  await page.getByTestId("log-edit").click();
  const editor = page.getByTestId("menu-editor");
  await expect(editor).toBeVisible();
  await editor.getByLabel("種目名").fill("チンニング");
  await editor.getByTestId("menu-save").click();
  await expect(page.getByTestId("menu-item").nth(3)).toHaveAttribute("data-name", "チンニング");
});

test("drag the grip to reorder menus", async ({ page }) => {
  const grip = page.locator('[data-testid=menu-item][data-name="懸垂"] [data-testid=menu-grip]');
  const box = (await grip.boundingBox())!;
  const first = (await page.getByTestId("menu-item").first().boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - ((box.y - first.y + 20) * i) / 20);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await expect(page.getByTestId("menu-item").first()).toHaveAttribute("data-name", "懸垂");
});

test("choose, edit and add interval timers", async ({ page }) => {
  await page.getByTestId("preset-chip").nth(1).click();
  await expect(summary(page)).toContainText("40");
  await expect(page.getByTestId("preset-chip").nth(1)).toHaveAttribute("aria-selected", "true");

  // Tapping the active chip opens its editor.
  await page.getByTestId("preset-chip").nth(1).click();
  const editor = page.getByTestId("preset-editor");
  await expect(editor).toBeVisible();
  await editor.getByTestId("preset-rounds").getByLabel("セット数を増やす").click();
  await editor.getByTestId("preset-save").click();
  await expect(summary(page)).toContainText("×7");

  await page.getByTestId("preset-add").click();
  await editor.getByLabel("タイマー名").fill("Quick");
  await editor.getByTestId("preset-save").click();
  await expect(page.getByTestId("preset-chip")).toHaveCount(6);
  await expect(page.getByTestId("preset-chip").last()).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("preset-chip").last()).toContainText("Quick");
});

test("runs the interval timer: ready, work, rest, pause, skip, done, record", async ({ page }) => {
  await card(page, "ベンチプレス").click();
  // Short timer: 5s work / 5s rest x 2.
  await page.getByTestId("preset-add").click();
  const editor = page.getByTestId("preset-editor");
  await editor.getByRole("spinbutton", { name: "WORK", exact: true }).fill("5");
  await editor.getByRole("spinbutton", { name: "REST", exact: true }).fill("5");
  await editor.getByRole("spinbutton", { name: "セット数", exact: true }).fill("2");
  await editor.getByTestId("preset-save").click();
  await expect(editor).toBeHidden();

  await page.getByTestId("start-button").click();
  const overlay = page.getByTestId("timer-overlay");
  await expect(overlay).toBeVisible();
  await expect(overlay).toContainText("ベンチプレス");
  await expect(page.getByTestId("timer-phase")).toHaveText("READY");

  // The countdown actually moves.
  const clock = page.getByTestId("timer-clock");
  const before = await clock.getAttribute("data-sec");
  await page.waitForTimeout(1300);
  expect(await clock.getAttribute("data-sec")).not.toBe(before);

  await page.getByTestId("timer-skip").click();
  await expect(page.getByTestId("timer-phase")).toHaveText("WORK");
  await expect(page.getByTestId("timer-round")).toHaveText("1 / 2");

  // Pause freezes the clock.
  await page.getByTestId("timer-pause").click();
  const frozen = await clock.getAttribute("data-sec");
  await page.waitForTimeout(1500);
  expect(await clock.getAttribute("data-sec")).toBe(frozen);
  await page.getByTestId("timer-pause").click();

  // Let a phase change happen on its own.
  await expect(page.getByTestId("timer-phase")).toHaveText("REST", { timeout: 8000 });
  await page.getByTestId("timer-skip").click();
  await expect(page.getByTestId("timer-round")).toHaveText("2 / 2");
  await page.getByTestId("timer-skip").click();

  await expect(page.getByTestId("timer-done")).toBeVisible();
  await expect(overlay).toHaveAttribute("data-phase", "done");
  await page.getByTestId("record-save").click();
  await expect(overlay).toBeHidden();

  await swipe(page, card(page, "ベンチプレス"), 220);
  await expect(page.getByTestId("log-sheet").getByTestId("log-row")).toHaveCount(1);
  await expect(page.getByTestId("log-sheet").getByTestId("log-row")).toContainText("60kg × 10 × 2");
});

test("rest-only timer and closing a running timer", async ({ page }) => {
  await page.getByTestId("preset-chip").nth(3).click();
  await page.getByTestId("start-button").click();
  await expect(page.getByTestId("timer-phase")).toHaveText("REST");
  await expect(page.getByTestId("timer-clock")).toHaveText(/^(1:00|59|58)$/);
  await page.getByTestId("timer-close").click();
  await expect(page.getByTestId("timer-overlay")).toBeHidden();
});

test("data persists across reloads", async ({ page }) => {
  await page.getByTestId("menu-add").click();
  await page.getByTestId("menu-editor").getByLabel("種目名").fill("レッグプレス");
  await page.getByTestId("menu-save").click();
  await card(page, "レッグプレス").click();
  await page.reload();
  await expect(card(page, "レッグプレス")).toBeVisible();
  await expect(page.getByTestId("selected-menu")).toContainText("レッグプレス");
});

test("sheet closes when dragged down by its handle", async ({ page }) => {
  await page.getByTestId("menu-add").click();
  const sheet = page.getByTestId("menu-editor");
  await expect(sheet).toBeVisible();
  await page.waitForTimeout(700); // let the open spring settle
  const box = (await sheet.boundingBox())!;
  const x = box.x + box.width / 2;
  await page.mouse.move(x, box.y + 12);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(x, box.y + 12 + 30 * i);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await expect(sheet).toBeHidden();
});

test("account sheet opens and reflects auth configuration", async ({ page }) => {
  const config = await (await page.request.get("/api/config")).json();
  await page.getByTestId("account-button").click();
  await expect(page.getByTestId("account-sheet")).toBeVisible();
  if (config.googleClientId) await expect(page.getByTestId("google-button")).toBeAttached();
  else await expect(page.getByTestId("auth-unavailable")).toBeVisible();
});

test("API guards: session required, bad credentials rejected", async ({ request }) => {
  expect((await request.get("/api/me")).status()).toBe(401);
  expect((await request.get("/api/data")).status()).toBe(401);
  expect((await request.put("/api/data", { data: { data: {}, updatedAt: 1 } })).status()).toBe(401);
  const forged = await request.get("/api/me", { headers: { cookie: "rt_session=eyJhbGciOiJIUzI1NiJ9.e30.x" } });
  expect(forged.status()).toBe(401);
  const login = await request.post("/api/auth/google", { data: { credential: "not-a-jwt" } });
  expect([401, 503]).toContain(login.status());
  expect((await request.get("/api/nope")).status()).toBe(404);
});

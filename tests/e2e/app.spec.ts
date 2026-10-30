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

test("tap selects a menu; the timer shows the menu bar only for cardio", async ({ page }) => {
  // Nothing selected: no placeholder bar.
  await expect(page.getByTestId("selected-menu")).toHaveCount(0);
  await expect(page.getByTestId("timer-panel")).not.toContainText("メニュー未選択");

  await card(page, "ベンチプレス").click();
  await expect(card(page, "ベンチプレス")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("selected-menu")).toHaveCount(0);

  await card(page, "ランニング").click();
  await expect(card(page, "ベンチプレス")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("selected-menu")).toBeVisible();
  await expect(page.getByTestId("selected-menu")).toContainText("ランニング");
  await expect(page.getByTestId("selected-menu")).toContainText("30分");

  await card(page, "ランニング").click();
  await expect(page.getByTestId("selected-menu")).toHaveCount(0);
});

const LIB_COUNTS: Record<string, number> = { shoulder: 6, chest: 7, back: 6, arms: 6, legs: 7, abs: 6, cardio: 7 };

test("+ opens a library with at least 5 picks for every body part", async ({ page }) => {
  await page.getByTestId("menu-add").click();
  const sheet = page.getByTestId("library-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId("lib-tab")).toHaveText([/肩/, /胸/, /背中/, /腕/, /脚/, /腹筋/, /有酸素/, /その他/]);
  for (const [cat, n] of Object.entries(LIB_COUNTS)) {
    await sheet.locator(`[data-testid=lib-tab][data-cat=${cat}]`).click();
    await expect(sheet.locator(`[data-testid=lib-tab][data-cat=${cat}]`)).toHaveAttribute("aria-selected", "true");
    await expect(sheet.getByTestId("lib-item")).toHaveCount(n);
    expect(n).toBeGreaterThanOrEqual(5);
  }
  // Menus already in the list are marked and cannot be added twice.
  await sheet.locator("[data-testid=lib-tab][data-cat=chest]").click();
  await expect(sheet.locator('[data-testid=lib-item][data-name="ベンチプレス"]')).toBeDisabled();
});

test("pick several library exercises across body parts and add them at once", async ({ page }) => {
  await page.getByTestId("menu-add").click();
  const sheet = page.getByTestId("library-sheet");
  await sheet.locator("[data-testid=lib-tab][data-cat=shoulder]").click();
  await sheet.locator('[data-testid=lib-item][data-name="サイドレイズ"]').click();
  await sheet.locator('[data-testid=lib-item][data-name="ショルダープレス"]').click();
  await sheet.locator("[data-testid=lib-tab][data-cat=abs]").click();
  await sheet.locator('[data-testid=lib-item][data-name="プランク"]').click();
  await expect(sheet.locator("[data-testid=lib-tab][data-cat=shoulder]")).toContainText("2");
  await expect(sheet.getByTestId("lib-submit")).toHaveText("3件をメニューに追加");
  await sheet.getByTestId("lib-submit").click();
  await expect(sheet).toBeHidden();
  await expect(page.getByTestId("menu-item")).toHaveCount(7);
  await expect(page.locator('[data-testid=menu-item][data-name="サイドレイズ"]')).toHaveAttribute("data-cat", "shoulder");
  await expect(page.locator('[data-testid=menu-item][data-name="プランク"]')).toHaveAttribute("data-cat", "abs");
  await expect(card(page, "サイドレイズ")).toContainText("6kg × 15 × 3");
});

test("add your own exercise to a body part; it stays in that part's list", async ({ page }) => {
  await page.getByTestId("menu-add").click();
  const sheet = page.getByTestId("library-sheet");
  await sheet.locator("[data-testid=lib-tab][data-cat=arms]").click();
  await expect(sheet.getByTestId("lib-list")).toHaveCount(1);
  await sheet.getByLabel("腕の種目名").fill("リストカール");
  await sheet.getByTestId("lib-custom-add").click();
  const custom = sheet.locator('[data-testid=lib-item][data-name="リストカール"]');
  await expect(custom).toHaveAttribute("aria-pressed", "true");
  await sheet.locator("[data-testid=lib-tab][data-cat=other]").click();
  await expect(sheet.getByTestId("lib-list")).toHaveCount(1);
  await sheet.getByLabel("その他の種目名").fill("タイヤフリップ");
  await sheet.getByLabel("その他の種目名").press("Enter");
  await sheet.getByTestId("lib-submit").click();
  await expect(page.locator('[data-testid=menu-item][data-name="リストカール"]')).toHaveAttribute("data-cat", "arms");
  await expect(page.locator('[data-testid=menu-item][data-name="タイヤフリップ"]')).toHaveAttribute("data-cat", "other");

  // The custom pick is remembered under 腕 next time, and can be removed from the list.
  await page.getByTestId("menu-add").click();
  await sheet.locator("[data-testid=lib-tab][data-cat=arms]").click();
  await expect(custom).toBeDisabled();
  await expect(sheet.getByTestId("lib-item")).toHaveCount(7);
  await sheet.getByLabel("リストカールを候補から削除").click();
  await expect(sheet.getByTestId("lib-item")).toHaveCount(6);
});

test("menus are color-coded by body part", async ({ page }) => {
  const expected: Record<string, [string, string]> = {
    ベンチプレス: ["胸", "rgb(255, 55, 95)"],
    スクワット: ["脚", "rgb(48, 209, 88)"],
    デッドリフト: ["背中", "rgb(10, 132, 255)"],
    ランニング: ["有酸素", "rgb(0, 199, 190)"],
  };
  for (const [name, [label, color]] of Object.entries(expected)) {
    await expect(card(page, name).getByTestId("category-badge")).toHaveText(label);
    await expect(card(page, name).locator("span").first()).toHaveCSS("background-color", color);
  }
  // Changing the body part in the editor recolors the menu.
  await swipe(page, card(page, "デッドリフト"), 220);
  await page.getByTestId("log-edit").click();
  const editor = page.getByTestId("menu-editor");
  await expect(editor.getByTestId("category-option")).toHaveCount(8);
  await editor.locator("[data-testid=category-option][data-cat=legs]").click();
  await editor.getByTestId("menu-save").click();
  await expect(editor).toBeHidden();
  await expect(card(page, "デッドリフト").getByTestId("category-badge")).toHaveText("脚");
  await expect(card(page, "デッドリフト").locator("span").first()).toHaveCSS("background-color", "rgb(48, 209, 88)");
});

test("weights can be shown and entered in lbs", async ({ page }) => {
  await page.getByTestId("account-button").click();
  await page.getByTestId("unit-lb").click();
  await expect(page.getByTestId("unit-lb")).toHaveAttribute("aria-checked", "true");
  await page.getByTestId("sheet-scrim").click({ position: { x: 20, y: 20 } });
  await expect(page.getByTestId("account-sheet")).toBeHidden();
  await expect(card(page, "ベンチプレス")).toContainText("132.5lbs × 10 × 3");

  await swipe(page, card(page, "ベンチプレス"), 220);
  const sheet = page.getByTestId("log-sheet");
  await expect(sheet.getByTestId("weight")).toContainText("lbs");
  await sheet.getByLabel("重量を増やす").click();
  await expect(sheet.getByRole("spinbutton", { name: "重量" })).toHaveValue("137.5");
  await sheet.getByTestId("log-save").click();
  await expect(sheet.getByTestId("log-row")).toContainText("137.5lbs × 10 × 3");
  await page.getByTestId("sheet-scrim").click({ position: { x: 20, y: 20 } });
  await expect(sheet).toBeHidden();

  // Stored in kg underneath: switching back shows the converted value.
  await page.getByTestId("account-button").click();
  await page.getByTestId("unit-kg").click();
  await page.getByTestId("sheet-scrim").click({ position: { x: 20, y: 20 } });
  await expect(card(page, "ベンチプレス")).toContainText("62.37kg × 10 × 3");
  await page.reload();
  await expect(card(page, "ベンチプレス")).toContainText("62.37kg");
});

async function logToday(page: Page, name: string) {
  await swipe(page, card(page, name), 220);
  await page.getByTestId("log-save").click();
  await expect(page.getByTestId("log-sheet").getByTestId("log-row").first()).toBeVisible();
  await page.getByTestId("sheet-scrim").click({ position: { x: 20, y: 20 } });
  await expect(page.getByTestId("log-sheet")).toBeHidden();
}

test("calendar shows history by day with a monthly summary", async ({ page }) => {
  await logToday(page, "ベンチプレス");
  await logToday(page, "ランニング");
  await page.getByTestId("calendar-button").click();
  const cal = page.getByTestId("calendar");
  await expect(cal).toBeVisible();
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const today = cal.locator(`[data-testid=cal-day][data-date="${todayKey}"]`);
  await expect(today).toHaveAttribute("data-count", "2");
  await expect(today).toHaveAttribute("aria-pressed", "true");
  await expect(cal.getByTestId("day-entry")).toHaveCount(2);
  await expect(cal.getByTestId("day-detail")).toContainText("ベンチプレス");
  await expect(cal.getByTestId("day-detail")).toContainText("60kg × 10 × 3");
  await expect(cal.getByTestId("day-detail")).toContainText("30分");

  await expect(cal.getByTestId("sum-days")).toHaveText("1");
  await expect(cal.getByTestId("sum-sets")).toHaveText("3");
  await expect(cal.getByTestId("sum-volume")).toHaveText("1.8t");
  await expect(cal.getByTestId("sum-cardio")).toHaveText("30分");
  await expect(cal.getByTestId("sum-categories")).toContainText("胸");
  await expect(cal.getByTestId("sum-categories")).toContainText("有酸素");

  // Other months: buttons and flicks both move; an empty month summarizes to zero.
  const month = (await cal.getByTestId("cal-month").last().innerText()).trim();
  await cal.getByTestId("cal-prev").click();
  await expect(cal.getByTestId("cal-month").last()).not.toHaveText(month);
  await expect(cal.getByTestId("sum-days")).toHaveText("0");
  await page.waitForTimeout(400);
  await swipe(page, cal.getByTestId("cal-grid").last(), -200);
  await expect(cal.getByTestId("cal-month").last()).toHaveText(month);
  await expect(cal.getByTestId("sum-days")).toHaveText("1");

  // Tapping another day shows that day.
  await page.waitForTimeout(400);
  await cal.locator("[data-testid=cal-day][data-count='0']").first().click();
  await expect(cal.getByTestId("day-entry")).toHaveCount(0);
  await expect(cal.getByTestId("share-day")).toBeDisabled();

  await cal.getByTestId("cal-close").click();
  await expect(cal).toBeHidden();
});

test("share today's training and the monthly summary", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __shared: string[]; __copied: string[] };
    w.__shared = [];
    w.__copied = [];
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (d: { text: string }) => void w.__shared.push(d.text),
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (t: string) => void w.__copied.push(t) },
    });
  });
  await page.reload();
  await logToday(page, "ベンチプレス");

  await page.getByTestId("calendar-button").click();
  await page.getByTestId("share-day").click();
  await page.getByTestId("share-month").click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __shared: string[] }).__shared.length)).toBe(2);
  const shared = await page.evaluate(() => (window as unknown as { __shared: string[] }).__shared);
  expect(shared[0]).toContain("のトレーニング");
  expect(shared[0]).toContain("・ベンチプレス（胸）60kg × 10 × 3");
  expect(shared[1]).toMatch(/\d{4}年\d{1,2}月のトレーニング/);
  expect(shared[1]).toContain("トレーニング日数 1日");
  expect(shared[1]).toContain("総ボリューム 1.8t");

  // Without the OS share sheet it falls back to the clipboard.
  await page.evaluate(() => Object.defineProperty(navigator, "share", { configurable: true, value: undefined }));
  await page.getByTestId("share-day").click();
  await expect(page.getByTestId("toast")).toContainText("コピー");
  const copied = await page.evaluate(() => (window as unknown as { __copied: string[] }).__copied);
  expect(copied[0]).toContain("ベンチプレス");
});

test("cardio is recorded in minutes after the timer", async ({ page }) => {
  await card(page, "ランニング").click();
  await page.getByTestId("preset-chip").nth(3).click();
  await page.getByTestId("start-button").click();
  await expect(page.getByTestId("timer-overlay")).toContainText("ランニング");
  await page.getByTestId("timer-skip").click();
  await expect(page.getByTestId("timer-done")).toBeVisible();
  await expect(page.getByTestId("timer-done").getByTestId("minutes")).toBeVisible();
  await expect(page.getByTestId("timer-done").getByTestId("weight")).toHaveCount(0);
  await page.getByTestId("record-save").click();
  await expect(page.getByTestId("timer-overlay")).toBeHidden();
  await swipe(page, card(page, "ランニング"), 220);
  await expect(page.getByTestId("log-sheet").getByTestId("log-row")).toContainText("1分");
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
  await swipe(page, card(page, "デッドリフト"), 220);
  await page.getByTestId("log-edit").click();
  const editor = page.getByTestId("menu-editor");
  await expect(editor).toBeVisible();
  await editor.getByLabel("種目名").fill("チンニング");
  await editor.getByTestId("menu-save").click();
  await expect(page.getByTestId("menu-item").nth(2)).toHaveAttribute("data-name", "チンニング");
});

test("drag the grip to reorder menus", async ({ page }) => {
  const grip = page.locator('[data-testid=menu-item][data-name="ランニング"] [data-testid=menu-grip]');
  const box = (await grip.boundingBox())!;
  const first = (await page.getByTestId("menu-item").first().boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - ((box.y - first.y + 20) * i) / 20);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await expect(page.getByTestId("menu-item").first()).toHaveAttribute("data-name", "ランニング");
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
  await page.locator("[data-testid=lib-tab][data-cat=legs]").click();
  await page.locator('[data-testid=lib-item][data-name="レッグプレス"]').click();
  await page.getByTestId("lib-submit").click();
  await card(page, "レッグプレス").click();
  await page.reload();
  await expect(card(page, "レッグプレス")).toBeVisible();
  await expect(card(page, "レッグプレス")).toHaveAttribute("aria-pressed", "true");
});

test("sheet closes when dragged down by its handle", async ({ page }) => {
  await page.getByTestId("menu-add").click();
  const sheet = page.getByTestId("library-sheet");
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

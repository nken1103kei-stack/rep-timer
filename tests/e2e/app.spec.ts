import { expect, test, type Locator, type Page } from "@playwright/test";

async function swipe(page: Page, target: Locator, dx: number) {
  await target.scrollIntoViewIfNeeded();
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

/** Tapping a menu selects it and opens its input sheet. */
async function openMenu(page: Page, name: string) {
  await card(page, name).click();
  await expect(page.getByTestId("log-sheet")).toBeVisible();
}

const closeSheet = (page: Page) => page.getByTestId("sheet-scrim").last().click({ position: { x: 20, y: 20 } });

const MENUS = [
  { id: "m1", name: "ベンチプレス", category: "chest", weight: 60, reps: 10, sets: 3 },
  { id: "m2", name: "スクワット", category: "legs", weight: 80, reps: 8, sets: 3 },
  { id: "m3", name: "デッドリフト", category: "back", weight: 100, reps: 5, sets: 3 },
  { id: "m4", name: "ランニング", category: "cardio", weight: 0, reps: 30, sets: 1, rest: 0 },
];

/** Menus start empty; most tests begin from a few saved ones. */
async function seedMenus(page: Page) {
  await page.evaluate((exercises) => localStorage.setItem("rep-timer", JSON.stringify({ state: { exercises }, version: 2 })), MENUS);
  await page.reload();
  await expect(page.getByTestId("menu-item")).toHaveCount(4);
}

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
  for (const el of [page.getByTestId("preset-chip").first(), page.getByTestId("start-button"), page.getByTestId("menu-add")]) {
    const box = (await el.boundingBox())!;
    expect(box.y + box.height).toBeLessThan(viewport.height);
  }
  await expect(page.getByTestId("preset-chip")).toHaveCount(5);
});

test("a random parody quote sits at the top; tapping shows another", async ({ page }) => {
  const quote = page.getByTestId("quote-card");
  await expect(quote).toBeVisible();
  await expect(quote).toContainText("本日の筋トレ偉人の名言");
  await expect(quote).toContainText("※フィクション・名言パロディ");
  await expect(page.getByTestId("quote-text")).toHaveText(/^「.+」$/);
  await expect(page.getByTestId("quote-name")).toHaveText(/^— .+ —$/);

  // Above the timer, right under the header.
  const q = (await quote.boundingBox())!;
  const t = (await page.getByTestId("timer-panel").boundingBox())!;
  expect(q.y + q.height).toBeLessThanOrEqual(t.y);

  const seen = new Set<string>();
  for (let i = 0; i < 4; i++) {
    const id = (await quote.getAttribute("data-quote-id"))!;
    seen.add(id);
    await quote.click();
    await expect(quote).not.toHaveAttribute("data-quote-id", id);
  }
  expect(seen.size).toBeGreaterThan(1);

  // Random per open: across a few reloads more than one quote shows up.
  const opened = new Set<string>();
  for (let i = 0; i < 6 && opened.size < 2; i++) {
    await page.reload();
    opened.add((await quote.getAttribute("data-quote-id"))!);
  }
  expect(opened.size).toBe(2);
});

test("menus start empty and only appear after adding them with +", async ({ page }) => {
  await expect(page.getByTestId("menu-item")).toHaveCount(0);
  await expect(page.getByTestId("menu-list")).toBeAttached();
  await expect(page.getByTestId("share-today")).toHaveAttribute("data-empty", "true");
  await page.reload();
  await expect(page.getByTestId("menu-item")).toHaveCount(0);

  await page.getByTestId("menu-add").click();
  const sheet = page.getByTestId("library-sheet");
  await sheet.locator("[data-testid=lib-tab][data-cat=chest]").click();
  await sheet.locator('[data-testid=lib-item][data-name="ベンチプレス"]').click();
  // Picking alone does not add anything yet.
  await expect(page.getByTestId("menu-item")).toHaveCount(0);
  await sheet.getByTestId("lib-submit").click();
  await expect(sheet).toBeHidden();
  await expect(page.getByTestId("menu-item")).toHaveCount(1);
  await expect(card(page, "ベンチプレス")).toContainText("60kg × 10 × 3");
});

test("tap selects a menu and opens its input; the timer shows the menu bar only for cardio", async ({ page }) => {
  await seedMenus(page);
  // Nothing selected: no placeholder bar.
  await expect(page.getByTestId("selected-menu")).toHaveCount(0);
  await expect(page.getByTestId("timer-panel")).not.toContainText("メニュー未選択");

  await openMenu(page, "ベンチプレス");
  await expect(page.getByTestId("log-sheet")).toContainText("ベンチプレス");
  await closeSheet(page);
  await expect(card(page, "ベンチプレス")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("selected-menu")).toHaveCount(0);

  await openMenu(page, "ランニング");
  await expect(page.getByTestId("log-sheet").getByTestId("cardio-fields")).toBeVisible();
  await closeSheet(page);
  await expect(card(page, "ベンチプレス")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("selected-menu")).toBeVisible();
  await expect(page.getByTestId("selected-menu")).toContainText("ランニング");
  await expect(page.getByTestId("selected-menu")).toContainText("30分");

  await page.getByTestId("selected-menu").getByLabel("選択解除").click();
  await expect(page.getByTestId("selected-menu")).toHaveCount(0);
});

test("a right swipe no longer opens anything; only a tap does", async ({ page }) => {
  await seedMenus(page);
  await swipe(page, card(page, "スクワット"), 220);
  await page.waitForTimeout(400);
  await expect(page.getByTestId("log-sheet")).toHaveCount(0);
  await expect(page.getByTestId("menu-item")).toHaveCount(4);
  await expect(card(page, "スクワット")).toHaveAttribute("aria-pressed", "false");
});

test("typed numbers stay fully visible: inputs grow with the digits and the sheet clears the keyboard", async ({ page }) => {
  await seedMenus(page);
  await openMenu(page, "スクワット");
  const sheet = page.getByTestId("log-sheet");
  const weight = sheet.getByRole("textbox", { name: "1セット目の重量" });
  const reps = sheet.getByRole("textbox", { name: "1セット目の回数" });
  await weight.fill("497.5");
  await reps.fill("999");
  for (const input of [weight, reps]) {
    const { scroll, client } = await input.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
    expect(scroll).toBeLessThanOrEqual(client);
    // Not overlapped by the neighbouring controls either.
    const box = (await input.boundingBox())!;
    const row = (await sheet.getByTestId("set-row").first().boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(row.x);
    expect(box.x + box.width).toBeLessThanOrEqual(row.x + row.width);
  }

  // Simulate an on-screen keyboard covering the bottom 300px (iOS keeps the layout viewport).
  await page.evaluate(() => {
    const vv = window.visualViewport!;
    Object.defineProperty(vv, "height", { configurable: true, get: () => window.innerHeight - 300 });
    vv.dispatchEvent(new Event("resize"));
  });
  await expect(sheet).toHaveAttribute("data-keyboard", "300");
  const third = sheet.getByRole("textbox", { name: "3セット目の重量" });
  await third.focus();
  await page.waitForTimeout(700);
  const box = (await third.boundingBox())!;
  const visibleBottom = page.viewportSize()!.height - 300;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(visibleBottom);
});

const LIB_COUNTS: Record<string, number> = { shoulder: 6, chest: 7, back: 6, arms: 6, legs: 7, abs: 6, cardio: 7 };

test("+ opens a library with at least 5 picks for every body part", async ({ page }) => {
  await seedMenus(page);
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
  await expect(page.getByTestId("menu-item")).toHaveCount(3);
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
  await seedMenus(page);
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
  await openMenu(page, "デッドリフト");
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
  await seedMenus(page);
  await page.getByTestId("account-button").click();
  await page.getByTestId("unit-lb").click();
  await expect(page.getByTestId("unit-lb")).toHaveAttribute("aria-checked", "true");
  await page.getByTestId("sheet-scrim").click({ position: { x: 20, y: 20 } });
  await expect(page.getByTestId("account-sheet")).toBeHidden();
  await expect(card(page, "ベンチプレス")).toContainText("132.5lbs × 10 × 3");

  await openMenu(page, "ベンチプレス");
  const sheet = page.getByTestId("log-sheet");
  await expect(sheet.getByTestId("set-row")).toHaveCount(3);
  await expect(sheet.getByTestId("set-row").first()).toContainText("lbs");
  await expect(sheet.getByRole("textbox", { name: "1セット目の重量" })).toHaveValue("132.5");
  for (const n of [1, 2, 3]) await sheet.getByRole("textbox", { name: `${n}セット目の重量` }).fill("137.5");
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
  await openMenu(page, name);
  await page.getByTestId("log-save").click();
  await expect(page.getByTestId("log-sheet").getByTestId("log-row").first()).toBeVisible();
  await page.getByTestId("sheet-scrim").click({ position: { x: 20, y: 20 } });
  await expect(page.getByTestId("log-sheet")).toBeHidden();
}

test("calendar shows history by day with a monthly summary", async ({ page }) => {
  await seedMenus(page);
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
  await seedMenus(page);
  // Nothing recorded yet: the button still responds and says why there is nothing to share.
  await expect(page.getByTestId("share-today")).toBeEnabled();
  await page.getByTestId("share-today").click();
  await expect(page.getByTestId("toast")).toContainText("今日の記録はまだありません");
  await logToday(page, "ベンチプレス");
  await logToday(page, "ランニング");

  // Straight from the menu screen.
  await expect(page.getByTestId("today-count")).toHaveText("2");
  await page.getByTestId("share-today").click();
  await page.getByTestId("calendar-button").click();
  await page.getByTestId("share-day").click();
  await page.getByTestId("share-month").click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __shared: string[] }).__shared.length)).toBe(3);
  const shared = await page.evaluate(() => (window as unknown as { __shared: string[] }).__shared);
  expect(shared[0]).toContain("のトレーニング");
  expect(shared[0]).toContain("・ベンチプレス（胸）60kg × 10 × 3");
  expect(shared[0]).toContain("・ランニング（有酸素）30分");
  expect(shared[0]).toContain("合計 3セット / 1.8t / 有酸素 30分");
  expect(shared[1]).toBe(shared[0]);
  expect(shared[2]).toMatch(/\d{4}年\d{1,2}月のトレーニング/);
  expect(shared[2]).toContain("トレーニング日数 1日");
  expect(shared[2]).toContain("総ボリューム 1.8t");

  // Without the OS share sheet it falls back to the clipboard.
  await page.evaluate(() => Object.defineProperty(navigator, "share", { configurable: true, value: undefined }));
  await page.getByTestId("share-day").click();
  await expect(page.getByTestId("toast")).toContainText("コピー");
  const copied = await page.evaluate(() => (window as unknown as { __copied: string[] }).__copied);
  expect(copied[0]).toContain("ベンチプレス");
});

test("today's share still works where the share sheet and clipboard are blocked", async ({ page }) => {
  // An in-app browser: share is refused, the Clipboard API throws and execCommand copy fails.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async () => {
        throw new DOMException("blocked", "NotAllowedError");
      },
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new DOMException("blocked", "NotAllowedError");
        },
      },
    });
    document.execCommand = () => false;
  });
  await page.reload();
  await seedMenus(page);
  await logToday(page, "ベンチプレス");
  await page.getByTestId("share-today").click();

  // The text is shown so it can be copied by hand, instead of a dead end.
  const sheet = page.getByTestId("share-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId("share-text")).toHaveValue(/のトレーニング/);
  await expect(sheet.getByTestId("share-text")).toHaveValue(/ベンチプレス（胸）60kg × 10 × 3/);
  await sheet.getByTestId("share-copy").click();
  await expect(page.getByTestId("toast")).toContainText("長押し");
});

test("a cardio menu drives the timer with its work / rest minutes and sets", async ({ page }) => {
  await seedMenus(page);
  // Set 1 min work, 0 min rest, 2 sets on the menu by typing.
  await openMenu(page, "ランニング");
  await expect(card(page, "ランニング")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("log-edit").click();
  const editor = page.getByTestId("menu-editor");
  await expect(editor.getByTestId("cardio-fields")).toBeVisible();
  await editor.getByRole("textbox", { name: "運動", exact: true }).fill("1");
  await editor.getByRole("textbox", { name: "休憩", exact: true }).fill("0");
  await editor.getByRole("textbox", { name: "セット", exact: true }).fill("2");
  await editor.getByTestId("menu-save").click();
  await expect(editor).toBeHidden();
  await expect(card(page, "ランニング")).toContainText("1分 × 2");

  // Selected, it links the timer: summary in minutes, chips unselected.
  await expect(card(page, "ランニング")).toHaveAttribute("aria-pressed", "true");
  await expect(summary(page)).toHaveAttribute("data-linked", "cardio");
  await expect(summary(page)).toContainText("WORK 分");
  await expect(summary(page)).toContainText("×2");
  await expect(summary(page)).toContainText("TOTAL 2:00");
  await expect(page.getByTestId("selected-menu")).toContainText("1分 × 2");

  await page.getByTestId("start-button").click();
  const overlay = page.getByTestId("timer-overlay");
  await expect(overlay).toContainText("1分 / 休憩0分 × 2");
  await expect(page.getByTestId("timer-phase")).toHaveText("READY");
  await page.getByTestId("timer-skip").click();
  await expect(page.getByTestId("timer-phase")).toHaveText("WORK");
  await expect(page.getByTestId("timer-round")).toHaveText("1 / 2");
  await expect(page.getByTestId("timer-clock")).toHaveText(/^(1:00|59|58)$/);
  // Rest 0: straight into the next work round.
  await page.getByTestId("timer-skip").click();
  await expect(page.getByTestId("timer-phase")).toHaveText("WORK");
  await expect(page.getByTestId("timer-round")).toHaveText("2 / 2");
  await page.getByTestId("timer-skip").click();

  const done = page.getByTestId("timer-done");
  await expect(done.getByTestId("cardio-fields")).toBeVisible();
  await expect(done.getByTestId("set-rows")).toHaveCount(0);
  await expect(done.getByRole("textbox", { name: "運動", exact: true })).toHaveValue("1");
  await page.getByTestId("record-save").click();
  await expect(overlay).toBeHidden();

  // With rest > 0 there is a REST phase between rounds.
  await openMenu(page, "ランニング");
  const sheet = page.getByTestId("log-sheet");
  await expect(sheet.getByTestId("log-row")).toContainText("1分 × 2");
  await sheet.getByRole("textbox", { name: "休憩", exact: true }).fill("1");
  await sheet.getByTestId("log-save").click();
  await expect(sheet.getByTestId("log-row").first()).toContainText("1分 × 2（休憩1分）");
  await page.getByTestId("sheet-scrim").click({ position: { x: 20, y: 20 } });
  await expect(summary(page)).toContainText("TOTAL 3:00");
  await page.getByTestId("start-button").click();
  await page.getByTestId("timer-skip").click();
  await page.getByTestId("timer-skip").click();
  await expect(page.getByTestId("timer-phase")).toHaveText("REST");
  await page.getByTestId("timer-close").click();
  await expect(overlay).toBeHidden();

  // Tapping a timer chip unlinks the cardio menu.
  await page.getByTestId("preset-chip").nth(1).click();
  await expect(card(page, "ランニング")).toHaveAttribute("aria-pressed", "false");
  await expect(summary(page)).not.toHaveAttribute("data-linked", "cardio");
  await expect(page.getByTestId("preset-chip").nth(1)).toHaveAttribute("aria-selected", "true");
});

test("tapping a menu opens the log, records each set's weight and reps, and flick deletes a log row", async ({ page }) => {
  await seedMenus(page);
  await openMenu(page, "スクワット");
  const sheet = page.getByTestId("log-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("スクワット");
  await expect(sheet.getByTestId("set-row")).toHaveCount(3);

  // Each set takes its own typed weight and reps.
  await sheet.getByRole("textbox", { name: "2セット目の重量" }).fill("85");
  await sheet.getByRole("textbox", { name: "2セット目の回数" }).fill("6");
  await sheet.getByTestId("set-add").click();
  await expect(sheet.getByTestId("set-row")).toHaveCount(4);
  await expect(sheet.getByRole("textbox", { name: "4セット目の重量" })).toHaveValue("80");
  await sheet.getByRole("textbox", { name: "4セット目の重量" }).fill("82.5");
  await sheet.getByLabel("1セット目を削除").click();
  await expect(sheet.getByTestId("set-row")).toHaveCount(3);
  await sheet.getByTestId("log-save").click();
  await expect(sheet.getByTestId("log-row")).toHaveCount(1);
  await expect(sheet.getByTestId("log-row")).toContainText("85kg×6 / 80kg×8 / 82.5kg×8");
  await expect(sheet).toContainText("85kg");

  // Next time starts from the last record's sets.
  await page.getByTestId("sheet-scrim").click({ position: { x: 20, y: 20 } });
  await expect(sheet).toBeHidden();
  await openMenu(page, "スクワット");
  await expect(sheet.getByRole("textbox", { name: "1セット目の重量" })).toHaveValue("85");
  await expect(sheet.getByRole("textbox", { name: "3セット目の重量" })).toHaveValue("82.5");

  await swipe(page, sheet.getByTestId("log-row").first(), -220);
  await expect(sheet.getByTestId("log-row")).toHaveCount(0);
  await page.getByTestId("sheet-scrim").click({ position: { x: 20, y: 20 } });
  await expect(sheet).toBeHidden();
});

test("flick left deletes a menu and undo restores it", async ({ page }) => {
  await seedMenus(page);
  await swipe(page, card(page, "デッドリフト"), -240);
  await expect(page.getByTestId("menu-item")).toHaveCount(3);
  await expect(page.getByTestId("toast")).toContainText("デッドリフトを削除");
  await page.getByTestId("toast-undo").click();
  await expect(page.getByTestId("menu-item")).toHaveCount(4);
  await expect(page.getByTestId("menu-item").nth(2)).toHaveAttribute("data-name", "デッドリフト");
});

test("edit a menu from the log sheet", async ({ page }) => {
  await seedMenus(page);
  await openMenu(page, "デッドリフト");
  await page.getByTestId("log-edit").click();
  const editor = page.getByTestId("menu-editor");
  await expect(editor).toBeVisible();
  await editor.getByLabel("種目名").fill("チンニング");
  await editor.getByTestId("menu-save").click();
  await expect(page.getByTestId("menu-item").nth(2)).toHaveAttribute("data-name", "チンニング");
});

test("a menu's default weight and reps are typed in per set", async ({ page }) => {
  await seedMenus(page);
  await openMenu(page, "デッドリフト");
  await page.getByTestId("log-edit").click();
  const editor = page.getByTestId("menu-editor");
  await expect(editor.getByTestId("set-row")).toHaveCount(3);
  await editor.getByTestId("set-add").click();
  await expect(editor.getByTestId("set-row")).toHaveCount(4);
  const values = [["60", "10"], ["100", "5"], ["120", "3"], ["80", "8"]];
  for (const [i, [w, r]] of values.entries()) {
    await editor.getByRole("textbox", { name: `${i + 1}セット目の重量` }).fill(w);
    await editor.getByRole("textbox", { name: `${i + 1}セット目の回数` }).fill(r);
  }
  await editor.getByTestId("menu-save").click();
  await expect(editor).toBeHidden();
  const summary = "60kg×10 / 100kg×5 / 120kg×3 / 80kg×8";
  await expect(card(page, "デッドリフト")).toContainText(summary);

  // The record sheet starts from the planned sets, and the plan survives a reload.
  await page.reload();
  await expect(card(page, "デッドリフト")).toContainText(summary);
  await openMenu(page, "デッドリフト");
  const sheet = page.getByTestId("log-sheet");
  await expect(sheet.getByTestId("set-row")).toHaveCount(4);
  await expect(sheet.getByRole("textbox", { name: "3セット目の重量" })).toHaveValue("120");
  await expect(sheet.getByRole("textbox", { name: "3セット目の回数" })).toHaveValue("3");
});

test("drag the grip to reorder menus", async ({ page }) => {
  await seedMenus(page);
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
  await seedMenus(page);
  await openMenu(page, "ベンチプレス");
  await closeSheet(page);
  // Short timer: 5s work / 5s rest x 2.
  await page.getByTestId("preset-add").click();
  const editor = page.getByTestId("preset-editor");
  await editor.getByRole("textbox", { name: "WORK", exact: true }).fill("5");
  await editor.getByRole("textbox", { name: "REST", exact: true }).fill("5");
  await editor.getByRole("textbox", { name: "セット数", exact: true }).fill("2");
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

  await openMenu(page, "ベンチプレス");
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
  await openMenu(page, "レッグプレス");
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

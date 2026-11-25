import { beforeEach, describe, expect, it } from "vitest";
import { createFakeGoogle } from "../../worker/fakeGoogle";
import { accessToken, createSpreadsheet, exchangeCode, revoke, SheetError, sheetErrorText, writeRows } from "../../worker/googleSheets";
import { sheetCells, sheetCsv, sheetDailyCsv, sheetTime, toSheetRow, SHEET_HEAD } from "../../src/lib/sheetRows";
import type { LogEntry } from "../../src/lib/types";

const at = Date.UTC(2026, 10, 18, 3, 0); // 12:00 in Japan on 11/18
const log = (id: string, weight: number, name = "ベンチプレス"): LogEntry => ({ id, exerciseId: "m", at, weight, reps: 10, sets: 3, name, category: "chest" });
const client = { clientId: "id", clientSecret: "secret" };

describe("writing records with the Google Sheets API", () => {
  const g = createFakeGoogle();
  beforeEach(() => g.reset());
  const tab = (book: string) => g.books.get(book)!.tabs.find((t) => t.title === "筋トレ記録")!.rows;

  it("trades the consent code for a refresh token, and a refresh token for access", async () => {
    const t = await exchangeCode(g.api, client, "dev-code", "https://x/cb");
    expect(t.refreshToken).toMatch(/^dev-refresh-/);
    expect(await accessToken(g.api, client, t.refreshToken)).toBe("dev-access");
    await revoke(g.api, t.refreshToken);
    await expect(accessToken(g.api, client, t.refreshToken)).rejects.toMatchObject({ reason: "revoked" });
  });

  it("a new sheet starts with the header; rows are added, updated by id, and deleted", async () => {
    const sheet = await createSpreadsheet(g.api, "dev-access", "REPS 筋トレ記録");
    expect(tab(sheet.id)).toEqual([SHEET_HEAD]);
    await writeRows(g.api, "dev-access", sheet.id, { upserts: [log("a", 60), log("b", 70)].map(toSheetRow), deletes: [] });
    expect(tab(sheet.id).map((r) => r[0])).toEqual(["記録ID", "a", "b"]);
    await writeRows(g.api, "dev-access", sheet.id, { upserts: [toSheetRow(log("a", 65))], deletes: [] });
    expect(tab(sheet.id)[1][5]).toBe(65);
    expect(tab(sheet.id)).toHaveLength(3);
    await writeRows(g.api, "dev-access", sheet.id, { upserts: [toSheetRow(log("c", 80))], deletes: ["a", "missing"] });
    expect(tab(sheet.id).map((r) => r[0])).toEqual(["記録ID", "b", "c"]);
  });

  it("an existing sheet (the PFC sheet) gets its own records tab and keeps its other tabs", async () => {
    await writeRows(g.api, "dev-access", "pfc", { upserts: [toSheetRow(log("a", 60))], deletes: [] });
    expect(g.books.get("pfc")!.tabs.map((t) => t.title)).toEqual(["体重", "筋トレ記録"]);
    expect(tab("pfc")).toEqual([SHEET_HEAD, sheetCells(toSheetRow(log("a", 60)))]);
    expect(g.books.get("pfc")!.tabs[0].rows).toEqual([["日付", "体重"], ["2026-11-18", 70.2]]);
  });

  it("explains failures in words", async () => {
    await expect(writeRows(g.api, "dev-access", "gone", { upserts: [], deletes: [] })).rejects.toBeInstanceOf(SheetError);
    expect(sheetErrorText(new SheetError("not_found"))).toContain("見つかりません");
    expect(sheetErrorText(new Error("x"))).toContain("書き込めませんでした");
  });
});

describe("cells and CSV", () => {
  it("dates read as Japan time, and a name that looks like a formula stays text", () => {
    expect(sheetTime(at)).toBe("2026/11/18 12:00");
    expect(sheetCells(toSheetRow(log("a", 60, "=HYPERLINK(1)")))[3]).toBe("'=HYPERLINK(1)");
  });

  it("CSV for IMPORTDATA: header, oldest first, quoted when needed", () => {
    const csv = sheetCsv([{ ...log("b", 70), at: at + 1000 }, log("a", 60, 'ワイド,"G"')]);
    const lines = csv.trimEnd().split("\r\n");
    expect(lines[0]).toBe(SHEET_HEAD.join(","));
    expect(lines[1]).toBe('a,2026/11/18 12:00,2026-11-18,"ワイド,""G""",胸,60,10,3,1800,0');
    expect(lines[2].startsWith("b,")).toBe(true);
  });
});

describe("the link URL's daily summary", () => {
  it("one row per day in the PFC sheet's shape: sets and volume of strength, cardio minutes, exercises", () => {
    const run: LogEntry = { id: "r", exerciseId: "c", at: at + 60_000, weight: 0, reps: 20, workSec: 0, sets: 1, name: "ランニング", category: "cardio" };
    const nextDay = { ...log("c", 50, "スクワット"), at: at + 86400_000 };
    const csv = sheetDailyCsv([nextDay, log("a", 60), log("b", 70), run]);
    expect(csv.trimEnd().split("\r\n")).toEqual([
      "日付,セット数,総挙上量kg,有酸素分,種目",
      "2026-11-18,6,3900,20,ベンチプレス・ランニング",
      "2026-11-19,3,1500,0,スクワット",
    ]);
  });

  it("a cardio-only day has 0 sets", () => {
    const run: LogEntry = { id: "r", exerciseId: "c", at, weight: 0, reps: 30, workSec: 0, sets: 1, name: "バイク", category: "cardio" };
    expect(sheetDailyCsv([run]).split("\r\n")[1]).toBe("2026-11-18,0,0,30,バイク");
  });
});

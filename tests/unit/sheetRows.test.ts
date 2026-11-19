import { describe, expect, it } from "vitest";
import { SHEET_URL, sheetDay, sheetDiff, toSheetRow } from "../../src/lib/sheetRows";
import type { LogEntry } from "../../src/lib/types";

const at = Date.UTC(2026, 10, 18, 3, 0); // 12:00 in Japan on 11/18
const bench: LogEntry = {
  id: "b",
  exerciseId: "m1",
  at,
  weight: 60,
  reps: 10,
  sets: 2,
  detail: [
    { weight: 60, reps: 10 },
    { weight: 70, reps: 8 },
  ],
  name: "ベンチプレス",
  category: "chest",
};
const run: LogEntry = { id: "r", exerciseId: "m2", at, weight: 0, reps: 12, workSec: 30, sets: 2, rest: 1, name: "ランニング", category: "cardio" };

describe("spreadsheet rows", () => {
  it("turns a record into a row: top weight, total volume, Japanese part name", () => {
    expect(toSheetRow(bench)).toEqual({
      id: "b",
      at,
      day: "2026-11-18",
      name: "ベンチプレス",
      category: "胸",
      weightKg: 70,
      reps: 10,
      sets: 2,
      volumeKg: 60 * 10 + 70 * 8,
      cardioMin: 0,
    });
    expect(toSheetRow(run)).toMatchObject({ category: "有酸素", weightKg: 0, reps: 0, volumeKg: 0, cardioMin: 25 });
  });

  it("counts the day in Japan time, changing at 4:00 like the app", () => {
    expect(sheetDay(Date.UTC(2026, 10, 18, 18, 59))).toBe("2026-11-18"); // 3:59 on 11/19 in Japan
    expect(sheetDay(Date.UTC(2026, 10, 18, 19, 0))).toBe("2026-11-19"); // 4:00
  });

  it("sends only what changed: new or edited records and new deletions", () => {
    const before = { logs: [bench, run], deletedLogs: ["old"] };
    expect(sheetDiff(before, before)).toEqual({ upserts: [], deletes: [] });
    const edited = { ...bench, reps: 12 };
    const added: LogEntry = { ...bench, id: "n" };
    const diff = sheetDiff(before, { logs: [added, edited], deletedLogs: ["old", "r"] });
    expect(diff.upserts.map((r) => r.id)).toEqual(["n", "b"]);
    expect(diff.deletes).toEqual(["r"]);
    expect(sheetDiff(null, before).upserts).toHaveLength(2);
  });

  it("accepts Apps Script web app URLs only", () => {
    expect(SHEET_URL.test("https://script.google.com/macros/s/AKfycbx-ab_12/exec")).toBe(true);
    expect(SHEET_URL.test("https://script.google.com/macros/s/AKfycbx/dev")).toBe(false);
    expect(SHEET_URL.test("https://evil.example/macros/s/x/exec")).toBe(false);
    expect(SHEET_URL.test("http://script.google.com/macros/s/x/exec")).toBe(false);
  });
});

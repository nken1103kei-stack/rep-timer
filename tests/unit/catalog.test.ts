import { describe, expect, it } from "vitest";
import { CATEGORIES, displayWeight, fromUnit, guessCategory, LIBRARY } from "../../src/lib/catalog";
import { dayShareText, formatSet, formatVolume, monthShareText, resolveLog, summarize } from "../../src/lib/stats";
import { normalizeData } from "../../src/lib/store";
import type { LogEntry } from "../../src/lib/types";

describe("catalog", () => {
  it("has the eight body-part categories with distinct colors", () => {
    expect(CATEGORIES.map((c) => c.label)).toEqual(["肩", "胸", "背中", "腕", "脚", "腹筋", "有酸素", "その他"]);
    expect(new Set(CATEGORIES.map((c) => c.color)).size).toBe(8);
  });

  it("offers at least five well-known exercises per body part", () => {
    for (const list of Object.values(LIBRARY)) {
      expect(list.length).toBeGreaterThanOrEqual(5);
      expect(new Set(list.map((t) => t.name)).size).toBe(list.length);
    }
  });

  it("guesses categories for menus saved before categories existed", () => {
    expect(guessCategory("懸垂")).toBe("back");
    expect(guessCategory("ベンチプレス")).toBe("chest");
    expect(guessCategory("謎の種目")).toBe("other");
  });
});

describe("units", () => {
  it("converts kg and lbs and rounds lbs to half pounds", () => {
    expect(displayWeight(60, "kg")).toBe(60);
    expect(displayWeight(60, "lb")).toBe(132.5);
    expect(displayWeight(fromUnit(135, "lb"), "lb")).toBe(135);
    expect(formatSet({ category: "chest", weight: 100, reps: 5, sets: 3 }, "lb")).toBe("220.5lbs × 5 × 3");
    expect(formatSet({ category: "back", weight: 0, reps: 10, sets: 3 }, "kg")).toBe("自重 × 10 × 3");
    expect(formatSet({ category: "cardio", weight: 0, reps: 30, sets: 1 }, "kg")).toBe("30分");
    expect(formatVolume(1800, "kg")).toBe("1.8t");
    expect(formatVolume(1000, "lb")).toBe("2,205lbs");
  });
});

describe("summary and sharing", () => {
  const day = new Date(2026, 9, 30, 10).getTime();
  const logs: LogEntry[] = [
    { id: "1", exerciseId: "a", at: day, weight: 60, reps: 10, sets: 3, name: "ベンチプレス", category: "chest" },
    { id: "2", exerciseId: "b", at: day + 1000, weight: 0, reps: 30, sets: 1, name: "ランニング", category: "cardio" },
    { id: "3", exerciseId: "c", at: day - 86400000, weight: 80, reps: 8, sets: 3, name: "スクワット", category: "legs" },
  ];
  const resolved = logs.map((l) => resolveLog(l, []));

  it("summarizes days, sets, volume and cardio minutes", () => {
    const s = summarize(resolved);
    expect(s).toMatchObject({ days: 2, sets: 6, volumeKg: 60 * 10 * 3 + 80 * 8 * 3, cardioMin: 30 });
    expect(s.byCategory.map((c) => [c.label, c.count])).toEqual([
      ["胸", 1],
      ["脚", 1],
      ["有酸素", 1],
    ]);
  });

  it("builds share text for a day and a month", () => {
    const text = dayShareText(day, resolved.slice(0, 2), "kg");
    expect(text).toContain("10/30 (金)");
    expect(text).toContain("・ベンチプレス（胸）60kg × 10 × 3");
    expect(text).toContain("・ランニング（有酸素）30分");
    const month = monthShareText(2026, 9, summarize(resolved), "kg");
    expect(month).toContain("2026年10月");
    expect(month).toContain("トレーニング日数 2日");
  });
});

describe("normalizeData", () => {
  it("migrates v1 data (color, no category, no unit)", () => {
    const v1 = { exercises: [{ id: "x", name: "懸垂", weight: 0, reps: 10, sets: 3, color: "#fff" }], logs: [], presets: [] };
    const data = normalizeData(v1 as never);
    expect(data.exercises[0]).toEqual({ id: "x", name: "懸垂", category: "back", weight: 0, reps: 10, sets: 3 });
    expect(data.unit).toBe("kg");
    expect(data.customLibrary).toEqual([]);
    expect(data.presets.length).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from "vitest";
import { cardioTimer, initialRecord, toLog, recordFeedback } from "../../src/lib/record";
import { formatSet, setsOf, volumeOf } from "../../src/lib/stats";
import { normalizeData } from "../../src/lib/store";
import { buildSegments } from "../../src/lib/timer";
import type { Exercise, LogEntry } from "../../src/lib/types";

const bench: Exercise = { id: "b", name: "ベンチプレス", category: "chest", weight: 60, reps: 10, sets: 3 };
const run: Exercise = { id: "r", name: "ランニング", category: "cardio", weight: 0, reps: 10, sets: 3, rest: 2 };

describe("per-set records", () => {
  it("starts from the menu defaults, one row per set", () => {
    expect(initialRecord(bench, undefined).sets).toEqual([
      { weight: 60, reps: 10 },
      { weight: 60, reps: 10 },
      { weight: 60, reps: 10 },
    ]);
  });

  it("prefers the last record's individual sets and resizes to the timer's rounds", () => {
    const last: LogEntry = { id: "l", exerciseId: "b", at: 0, weight: 60, reps: 10, sets: 2, detail: [{ weight: 60, reps: 10 }, { weight: 65, reps: 6 }] };
    expect(initialRecord(bench, last).sets).toEqual(last.detail);
    expect(initialRecord(bench, last, 3).sets).toEqual([...last.detail!, { weight: 65, reps: 6 }]);
    expect(initialRecord(bench, last, 1).sets).toEqual([{ weight: 60, reps: 10 }]);
  });

  it("uses the menu's per-set plan once one has been typed in", () => {
    const plan = [{ weight: 40, reps: 12 }, { weight: 80, reps: 5 }, { weight: 90, reps: 3 }];
    const last: LogEntry = { id: "l", exerciseId: "b", at: 0, weight: 60, reps: 10, sets: 1 };
    expect(initialRecord({ ...bench, detail: plan }, last).sets).toEqual(plan);
    expect(formatSet({ ...bench, detail: plan }, "kg")).toBe("40kg×12 / 80kg×5 / 90kg×3");
  });

  it("stores each set's weight and reps and formats varied sets one by one", () => {
    const log = toLog(bench, { sets: [{ weight: 60, reps: 10 }, { weight: 62.5, reps: 8 }], cardio: { reps: 0, rest: 0, sets: 1 } });
    expect(log).toEqual({ exerciseId: "b", weight: 60, reps: 10, sets: 2, detail: [{ weight: 60, reps: 10 }, { weight: 62.5, reps: 8 }] });
    const full = { ...log, category: "chest" as const };
    expect(formatSet(full, "kg")).toBe("60kg×10 / 62.5kg×8");
    expect(volumeOf(full)).toBe(1100);
    expect(formatSet({ ...bench, detail: setsOf(bench) }, "kg")).toBe("60kg × 10 × 3");
  });
});

describe("cardio timer link", () => {
  it("turns work/rest minutes and sets into timer seconds", () => {
    expect(cardioTimer(run)).toMatchObject({ work: 600, rest: 120, rounds: 3 });
    expect(formatSet(run, "kg")).toBe("10分 × 3（休憩2分）");
    expect(formatSet({ ...run, sets: 1, rest: 0 }, "kg")).toBe("10分");
  });

  it("manages cardio in minutes and seconds", () => {
    const interval = { ...run, reps: 12, workSec: 30, rest: 0, restSec: 45 };
    expect(cardioTimer(interval)).toMatchObject({ work: 750, rest: 45 });
    expect(formatSet(interval, "kg")).toBe("12分30秒 × 3（休憩45秒）");
    expect(formatSet({ ...interval, sets: 1, rest: 0, restSec: 0 }, "kg")).toBe("12分30秒");
    const record = toLog(interval, initialRecord(interval, undefined));
    expect(record).toMatchObject({ reps: 12, workSec: 30, restSec: 45 });
    const data = normalizeData({ exercises: [interval] });
    expect(data.exercises[0]).toMatchObject({ workSec: 30, restSec: 45 });
  });

  it("compares a new record with the earlier ones", () => {
    const log = (weight: number, reps: number) => ({ id: "l", exerciseId: "b", at: 1, weight, reps, sets: 3 });
    const draft = (weight: number, reps: number) => ({ exerciseId: "b", weight, reps, sets: 3 });
    expect(recordFeedback([], draft(60, 10), "chest", "kg")).toBeNull();
    expect(recordFeedback([log(60, 10)], draft(60, 10), "chest", "kg")).toBeNull();
    expect(recordFeedback([log(60, 10)], draft(60, 11), "chest", "kg")).toBe("前回比 +180kg +10%");
    expect(recordFeedback([log(60, 10)], draft(50, 10), "chest", "kg")).toBe("前回比 -300kg -17%");
    expect(recordFeedback([log(60, 10), log(80, 5)], draft(70, 10), "chest", "kg")).toBe("前回比 +300kg +17%");
    expect(recordFeedback([log(60, 10)], draft(62.5, 10), "chest", "kg")).toBe("自己ベスト更新 62.5kg · 前回比 +75kg +4%");
    const cardio = { id: "l", exerciseId: "r", at: 1, weight: 0, reps: 10, sets: 1 };
    expect(recordFeedback([cardio], { exerciseId: "r", weight: 0, reps: 11, workSec: 30, sets: 1 }, "cardio", "kg")).toBe("前回より +1分30秒");
  });

  it("rest 0 runs the work rounds back to back", () => {
    const segments = buildSegments({ prepare: 0, ...cardioTimer({ ...run, rest: 0 }) });
    expect(segments.map((s) => s.phase)).toEqual(["work", "work", "work"]);
  });

  it("records the cardio settings and keeps rest through normalization", () => {
    expect(toLog(run, initialRecord(run, undefined))).toEqual({ exerciseId: "r", weight: 0, reps: 10, rest: 2, sets: 3 });
    const data = normalizeData({ exercises: [{ ...run }, { ...run, id: "x", rest: undefined }] });
    expect(data.exercises.map((e) => e.rest)).toEqual([2, 0]);
  });
});

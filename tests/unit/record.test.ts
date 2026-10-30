import { describe, expect, it } from "vitest";
import { cardioTimer, initialRecord, toLog } from "../../src/lib/record";
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

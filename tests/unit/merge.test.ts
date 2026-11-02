import { describe, expect, it } from "vitest";
import { mergeSnapshots } from "../../src/lib/merge";
import type { AppData, LogEntry } from "../../src/lib/types";

const log = (id: string, at: number, weight = 60): LogEntry => ({ id, exerciseId: "m1", at, weight, reps: 10, sets: 3 });
const data = (logs: LogEntry[], extra: Partial<AppData> = {}): AppData => ({
  exercises: [],
  logs,
  presets: [],
  customLibrary: [],
  unit: "kg",
  ...extra,
});

describe("merging two copies of the data", () => {
  it("keeps records that only the older copy has (a stale device can no longer wipe them)", () => {
    const phone = { data: data([log("nov1", 2), log("oct31", 1)]), updatedAt: 100 };
    const staleTab = { data: data([log("oct31", 1)], { unit: "lb" }), updatedAt: 200 };
    const merged = mergeSnapshots(phone, staleTab);
    expect(merged.data.logs.map((l) => l.id)).toEqual(["nov1", "oct31"]);
    // Settings follow the newer copy.
    expect(merged.data.unit).toBe("lb");
    expect(merged.updatedAt).toBe(200);
  });

  it("does not bring back a record deleted on either side", () => {
    const a = { data: data([log("x", 1), log("y", 2)]), updatedAt: 100 };
    const b = { data: data([log("y", 2)], { deletedLogs: ["x"] }), updatedAt: 50 };
    const merged = mergeSnapshots(a, b);
    expect(merged.data.logs.map((l) => l.id)).toEqual(["y"]);
    expect(merged.data.deletedLogs).toEqual(["x"]);
  });

  it("takes the newer copy's version of the same record", () => {
    const merged = mergeSnapshots({ data: data([log("x", 1, 60)]), updatedAt: 1 }, { data: data([log("x", 1, 70)]), updatedAt: 2 });
    expect(merged.data.logs).toHaveLength(1);
    expect(merged.data.logs[0].weight).toBe(70);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { menuDayOf, normalizeData, useStore } from "../../src/lib/store";

const bench = { name: "ベンチプレス", category: "chest" as const, weight: 60, reps: 10, sets: 3 };

describe("daily menu list", () => {
  beforeEach(() => {
    useStore.setState({ exercises: [], logs: [], archive: [], menuDay: undefined, selectedExerciseId: null });
  });

  it("turns the day over at 4:00, not at midnight", () => {
    expect(menuDayOf(new Date(2026, 10, 2, 1, 30).getTime())).toBe("2026-11-01");
    expect(menuDayOf(new Date(2026, 10, 2, 4, 0).getTime())).toBe("2026-11-02");
  });

  it("adopts today on first run without clearing anything", () => {
    useStore.getState().addExercise(bench);
    useStore.getState().startDay("2026-11-02");
    expect(useStore.getState().exercises).toHaveLength(1);
    expect(useStore.getState().menuDay).toBe("2026-11-02");
  });

  it("starts a new day with an empty list but keeps records, and re-adding brings the plan, memo and history back", () => {
    const s = useStore.getState();
    s.startDay("2026-11-01");
    const id = s.addExercise({ ...bench, memo: "肩甲骨を寄せる" });
    s.addLog({ exerciseId: id, weight: 70, reps: 8, sets: 3 });
    s.selectExercise(id);

    useStore.getState().startDay("2026-11-02");
    const day2 = useStore.getState();
    expect(day2.exercises).toHaveLength(0);
    expect(day2.selectedExerciseId).toBeNull();
    expect(day2.logs).toHaveLength(1);
    expect(day2.archive?.[0]).toMatchObject({ id, weight: 70, memo: "肩甲骨を寄せる" });

    // The same day again changes nothing.
    useStore.getState().startDay("2026-11-02");
    expect(useStore.getState().archive).toHaveLength(1);

    useStore.getState().addExercises([bench]);
    const back = useStore.getState().exercises[0];
    expect(back).toMatchObject({ id, weight: 70, memo: "肩甲骨を寄せる" });
    expect(useStore.getState().archive).toHaveLength(0);
  });

  it("keeps per-set plans and memos through a sync", () => {
    const data = normalizeData({
      exercises: [{ id: "a", ...bench, detail: [{ weight: 60, reps: 10 }, { weight: 70, reps: 8 }], memo: "メモ" }],
      archive: [{ id: "b", ...bench, name: "スクワット", category: "legs", memo: "深く" }],
      menuDay: "2026-11-02",
    });
    expect(data.exercises[0]).toMatchObject({ detail: [{ weight: 60, reps: 10 }, { weight: 70, reps: 8 }], memo: "メモ" });
    expect(data.archive?.[0]).toMatchObject({ id: "b", memo: "深く" });
    expect(data.menuDay).toBe("2026-11-02");
  });
});

describe("background timer text", () => {
  it("always shows minutes and seconds", async () => {
    const { minSec } = await import("../../src/lib/background");
    expect(minSec(4200)).toBe("0:05");
    expect(minSec(65_000)).toBe("1:05");
    expect(minSec(-10)).toBe("0:00");
  });
});

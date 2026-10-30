import { describe, expect, it } from "vitest";
import { buildSegments, formatClock, segmentStart, timerAt, totalMs } from "../../src/lib/timer";

describe("buildSegments", () => {
  it("builds prepare, alternating work/rest, and no trailing rest", () => {
    const segs = buildSegments({ prepare: 5, work: 20, rest: 10, rounds: 3 });
    expect(segs.map((s) => `${s.phase}${s.round}`)).toEqual(["prepare1", "work1", "rest1", "work2", "rest2", "work3"]);
    expect(totalMs(segs)).toBe(5000 + 3 * 20000 + 2 * 10000);
  });

  it("keeps a single rest for rest-only timers", () => {
    const segs = buildSegments({ prepare: 0, work: 0, rest: 90, rounds: 1 });
    expect(segs).toEqual([{ phase: "rest", round: 1, ms: 90000 }]);
  });
});

describe("timerAt", () => {
  const segs = buildSegments({ prepare: 5, work: 20, rest: 10, rounds: 2 });

  it("reports the current phase and remaining time", () => {
    expect(timerAt(segs, 0)).toMatchObject({ phase: "prepare", remainingMs: 5000 });
    expect(timerAt(segs, 6000)).toMatchObject({ phase: "work", round: 1, remainingMs: 19000 });
    expect(timerAt(segs, 25000)).toMatchObject({ phase: "rest", round: 1, remainingMs: 10000 });
    expect(timerAt(segs, 35000)).toMatchObject({ phase: "work", round: 2, rounds: 2 });
  });

  it("finishes after the total duration", () => {
    expect(timerAt(segs, totalMs(segs))).toMatchObject({ phase: "done", progress: 1 });
  });

  it("segmentStart lets skip jump to the next segment boundary", () => {
    expect(segmentStart(segs, 2)).toBe(25000);
    expect(timerAt(segs, segmentStart(segs, 2)).phase).toBe("rest");
  });
});

describe("formatClock", () => {
  it("rounds up to whole seconds and switches to m:ss past a minute", () => {
    expect(formatClock(4001)).toBe("5");
    expect(formatClock(59999)).toBe("1:00");
    expect(formatClock(90000)).toBe("1:30");
    expect(formatClock(-5)).toBe("0");
  });
});

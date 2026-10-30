export type Phase = "prepare" | "work" | "rest" | "done";

export type Segment = { phase: Exclude<Phase, "done">; round: number; ms: number };

export type TimerConfig = { prepare: number; work: number; rest: number; rounds: number };

export type TimerState = {
  phase: Phase;
  round: number;
  rounds: number;
  index: number;
  remainingMs: number;
  segmentMs: number;
  progress: number;
  totalMs: number;
  elapsedMs: number;
};

export function buildSegments({ prepare, work, rest, rounds }: TimerConfig): Segment[] {
  const segments: Segment[] = [];
  if (prepare > 0) segments.push({ phase: "prepare", round: 1, ms: prepare * 1000 });
  for (let round = 1; round <= rounds; round++) {
    if (work > 0) segments.push({ phase: "work", round, ms: work * 1000 });
    // No trailing rest after the last work round; a rest-only timer keeps its single rest.
    if (rest > 0 && (round < rounds || work === 0)) segments.push({ phase: "rest", round, ms: rest * 1000 });
  }
  return segments;
}

export const totalMs = (segments: Segment[]) => segments.reduce((sum, s) => sum + s.ms, 0);

export function timerAt(segments: Segment[], elapsedMs: number): TimerState {
  const total = totalMs(segments);
  const rounds = segments.reduce((max, s) => Math.max(max, s.round), 0);
  let start = 0;
  for (let index = 0; index < segments.length; index++) {
    const seg = segments[index];
    if (elapsedMs < start + seg.ms) {
      const into = Math.max(0, elapsedMs - start);
      return {
        phase: seg.phase,
        round: seg.round,
        rounds,
        index,
        remainingMs: seg.ms - into,
        segmentMs: seg.ms,
        progress: into / seg.ms,
        totalMs: total,
        elapsedMs,
      };
    }
    start += seg.ms;
  }
  return {
    phase: "done",
    round: rounds,
    rounds,
    index: segments.length,
    remainingMs: 0,
    segmentMs: 0,
    progress: 1,
    totalMs: total,
    elapsedMs: total,
  };
}

/** Elapsed time at which segment `index` starts. */
export function segmentStart(segments: Segment[], index: number): number {
  return segments.slice(0, index).reduce((sum, s) => sum + s.ms, 0);
}

export function formatClock(ms: number): string {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : String(s);
}

export function formatDuration(ms: number): string {
  const sec = Math.round(ms / 1000);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

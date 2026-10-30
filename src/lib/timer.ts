export type TempoPhase = "ecc" | "bottom" | "con" | "top";
export type Phase = "prepare" | "work" | "transition" | "rest" | TempoPhase | "done";

export type Segment = {
  phase: Exclude<Phase, "done">;
  round: number;
  ms: number;
  /** Superset: which exercise ("A" / "B"). */
  label?: string;
  /** Tempo: rep number within the set. */
  rep?: number;
};

export type TimerKind = "interval" | "superset" | "tempo";

/** Seconds for lowering, pausing at the bottom, lifting and squeezing at the top (e.g. 3-1-2-0). */
export type Tempo = [number, number, number, number];

export type TimerConfig = {
  prepare: number;
  work: number;
  rest: number;
  rounds: number;
  kind?: TimerKind;
  /** Superset: exercise B's work seconds, and the move between A and B. */
  work2?: number;
  transition?: number;
  /** Tempo: phase seconds, reps per set, and whether a rep starts at the top (squat, bench) or bottom (deadlift, pull-up). */
  tempo?: Tempo;
  reps?: number;
  tempoStart?: "top" | "bottom";
};

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
  label?: string;
  rep?: number;
};

export const TEMPO_PHASES: TempoPhase[] = ["ecc", "bottom", "con", "top"];
export const isTempoPhase = (p: Phase): p is TempoPhase => (TEMPO_PHASES as Phase[]).includes(p);

/** Seconds under tension for one set. */
export const tutOf = (tempo: Tempo, reps: number) => reps * tempo.reduce((a, b) => a + b, 0);

export const formatTempo = (tempo: Tempo) => tempo.join("-");

export function buildSegments(config: TimerConfig): Segment[] {
  const { prepare, work, rest, rounds, kind = "interval" } = config;
  const segments: Segment[] = [];
  if (prepare > 0) segments.push({ phase: "prepare", round: 1, ms: prepare * 1000 });
  for (let round = 1; round <= rounds; round++) {
    const last = round === rounds;
    if (kind === "superset") {
      segments.push({ phase: "work", round, ms: work * 1000, label: "A" });
      if ((config.transition ?? 0) > 0) segments.push({ phase: "transition", round, ms: config.transition! * 1000 });
      segments.push({ phase: "work", round, ms: (config.work2 ?? work) * 1000, label: "B" });
      if (rest > 0 && !last) segments.push({ phase: "rest", round, ms: rest * 1000 });
      continue;
    }
    if (kind === "tempo") {
      const [ecc, bottom, con, top] = config.tempo ?? [3, 1, 2, 0];
      const order: [TempoPhase, number][] =
        config.tempoStart === "bottom"
          ? [["con", con], ["top", top], ["ecc", ecc], ["bottom", bottom]]
          : [["ecc", ecc], ["bottom", bottom], ["con", con], ["top", top]];
      for (let rep = 1; rep <= (config.reps ?? 10); rep++) {
        for (const [phase, sec] of order) if (sec > 0) segments.push({ phase, round, rep, ms: sec * 1000 });
      }
      if (rest > 0 && !last) segments.push({ phase: "rest", round, ms: rest * 1000 });
      continue;
    }
    if (work > 0) segments.push({ phase: "work", round, ms: work * 1000 });
    // No trailing rest after the last work round; a rest-only timer keeps its single rest.
    if (rest > 0 && (!last || work === 0)) segments.push({ phase: "rest", round, ms: rest * 1000 });
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
        label: seg.label,
        rep: seg.rep,
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

/** One-line description of a timer, used on chips, the panel and the running screen. */
export function describeTimer(p: Omit<TimerConfig, "prepare">): string {
  if (p.kind === "superset") return `A${p.work}秒 → 移動${p.transition ?? 0}秒 → B${p.work2 ?? p.work}秒 / 休憩${p.rest}秒 × ${p.rounds}`;
  if (p.kind === "tempo") return `テンポ ${formatTempo(p.tempo ?? [3, 1, 2, 0])} × ${p.reps ?? 10}回 / 休憩${p.rest}秒 × ${p.rounds}`;
  return p.work > 0 ? `${p.work}/${p.rest} × ${p.rounds}` : `REST ${formatDuration(p.rest * 1000)}`;
}

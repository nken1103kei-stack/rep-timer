import { cardioRestSec, cardioSeconds, cardioWorkSec, formatMinSec, formatVolume, formatWeight, setsOf, volumeOf } from "./stats";
import type { CategoryId, Unit } from "./catalog";
import type { Exercise, LogEntry, SetEntry } from "./types";
import type { Segment } from "./timer";

import type { SetType } from "./types";

export const SET_TYPE: Record<SetType, { label: string; short: string; color: string }> = {
  W: { label: "ウォームアップ", short: "W", color: "#E0A100" },
  N: { label: "メイン", short: "N", color: "#0b0c0f" },
  D: { label: "ドロップ", short: "D", color: "#BF5AF2" },
};

/** Tap order on the set label: N → W → D → N. */
export const nextSetType = (t: SetType | undefined): SetType => (t === "W" ? "D" : t === "D" ? "N" : "W");

export type CardioForm = { reps: number; rest: number; sets: number; workSec?: number; restSec?: number };
export type RecordForm = { sets: SetEntry[]; cardio: CardioForm };

/**
 * Starting values for a new record: the menu's per-set plan (kept in step with the latest record),
 * else the last time's sets; sized to `rounds` when a timer ran.
 */
export function initialRecord(ex: Exercise, last: LogEntry | undefined, rounds?: number): RecordForm {
  const source = ex.detail?.length || !last ? ex : last;
  let sets = setsOf({ ...source, category: ex.category }).map((s) => ({ ...s }));
  if (rounds) {
    sets = Array.from({ length: rounds }, (_, i) => ({ ...(sets[i] ?? sets[sets.length - 1]) }));
  }
  return { sets, cardio: { reps: ex.reps, rest: ex.rest ?? 0, sets: Math.max(1, ex.sets), ...(ex.workSec ? { workSec: ex.workSec } : {}), ...(ex.restSec ? { restSec: ex.restSec } : {}) } };
}

export function toLog(ex: Exercise, form: RecordForm): Omit<LogEntry, "id" | "at" | "name" | "category"> {
  if (ex.category === "cardio") return { exerciseId: ex.id, weight: 0, ...form.cardio };
  const first = form.sets[0];
  return { exerciseId: ex.id, weight: first.weight, reps: first.reps, sets: form.sets.length, detail: form.sets };
}

/** What a new record means against the earlier ones, shown right after saving. Null when there is nothing to compare or nothing changed. */
export function recordFeedback(history: LogEntry[], draft: Omit<LogEntry, "id" | "at" | "name" | "category">, category: CategoryId, unit: Unit) {
  const prev = history[0];
  if (!prev) return null;
  const now = { ...draft, category };
  const before = { ...prev, category };
  if (category === "cardio") {
    const diff = cardioSeconds(now) - cardioSeconds(before);
    return diff ? `前回より ${diff > 0 ? "+" : "-"}${formatMinSec(Math.abs(diff))}` : null;
  }
  const parts: string[] = [];
  const top = Math.max(...setsOf(now).map((s) => s.weight));
  const best = Math.max(...history.flatMap((l) => setsOf({ ...l, category }).map((s) => s.weight)));
  if (top > best) parts.push(`自己ベスト更新 ${formatWeight(top, unit)}`);
  const volume = volumeOf(now);
  const prevVolume = volumeOf(before);
  if (prevVolume > 0 && volume !== prevVolume) {
    const sign = volume > prevVolume ? "+" : "-";
    parts.push(`前回比 ${sign}${formatVolume(Math.abs(volume - prevVolume), unit)} ${sign}${Math.round((Math.abs(volume - prevVolume) / prevVolume) * 100)}%`);
  }
  return parts.join(" · ") || null;
}

/** A cardio menu's timer settings from the time fields: changing them sets the timer, it records nothing. */
export const cardioPlan = (c: CardioForm) => ({
  reps: c.reps,
  rest: c.rest,
  sets: c.sets,
  workSec: c.workSec || undefined,
  restSec: c.restSec || undefined,
});

/**
 * What a cardio timer run records: the plan when it ran to the end, else the work time actually done as one set.
 * Null when it was stopped before any work.
 */
export function cardioRecord(segments: Segment[], doneMs: number, plan: CardioForm): CardioForm | null {
  const total = segments.reduce((sum, s) => sum + s.ms, 0);
  if (doneMs >= total) return plan;
  let start = 0;
  let work = 0;
  for (const s of segments) {
    if (s.phase === "work") work += Math.max(0, Math.min(s.ms, doneMs - start));
    start += s.ms;
  }
  const sec = Math.floor(work / 1000);
  if (sec <= 0) return null;
  return { reps: Math.floor(sec / 60), rest: 0, sets: 1, ...(sec % 60 ? { workSec: sec % 60 } : {}) };
}

/** Interval-timer settings of a cardio menu (minutes and seconds → seconds). */
export const cardioTimer = (ex: Exercise) => ({
  id: `cardio-${ex.id}`,
  name: ex.name,
  work: cardioWorkSec(ex),
  rest: cardioRestSec(ex),
  rounds: Math.max(1, ex.sets),
});

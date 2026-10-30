import { setsOf } from "./stats";
import type { Exercise, LogEntry, SetEntry } from "./types";

import type { SetType } from "./types";

export const SET_TYPE: Record<SetType, { label: string; short: string; color: string }> = {
  W: { label: "ウォームアップ", short: "W", color: "#E0A100" },
  N: { label: "メイン", short: "N", color: "#0b0c0f" },
  D: { label: "ドロップ", short: "D", color: "#BF5AF2" },
};

/** Tap order on the set label: N → W → D → N. */
export const nextSetType = (t: SetType | undefined): SetType => (t === "W" ? "D" : t === "D" ? "N" : "W");

export type CardioForm = { reps: number; rest: number; sets: number };
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
  return { sets, cardio: { reps: ex.reps, rest: ex.rest ?? 0, sets: Math.max(1, ex.sets) } };
}

export function toLog(ex: Exercise, form: RecordForm): Omit<LogEntry, "id" | "at" | "name" | "category"> {
  if (ex.category === "cardio") return { exerciseId: ex.id, weight: 0, ...form.cardio };
  const first = form.sets[0];
  return { exerciseId: ex.id, weight: first.weight, reps: first.reps, sets: form.sets.length, detail: form.sets };
}

/** Interval-timer settings of a cardio menu (minutes → seconds). */
export const cardioTimer = (ex: Exercise) => ({
  id: `cardio-${ex.id}`,
  name: ex.name,
  work: ex.reps * 60,
  rest: (ex.rest ?? 0) * 60,
  rounds: Math.max(1, ex.sets),
});

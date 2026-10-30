import type { CategoryId } from "./catalog";
import { setsOf } from "./stats";
import type { LogEntry } from "./types";

/** Epley estimate of the one-rep max. */
export const e1rm = (weight: number, reps: number) => (reps <= 0 || weight <= 0 ? 0 : reps === 1 ? weight : weight * (1 + reps / 30));

/** Best estimated 1RM per record, oldest first. */
export function e1rmSeries(logs: LogEntry[], exerciseId: string, category: CategoryId) {
  return logs
    .filter((l) => l.exerciseId === exerciseId)
    .map((l) => ({ at: l.at, value: Math.max(0, ...setsOf({ ...l, category }).map((s) => e1rm(s.weight, s.reps))) }))
    .filter((p) => p.value > 0)
    .sort((a, b) => a.at - b.at);
}

/** Sets per body part (cardio counts rounds), for the heatmap. */
export function setsByCategory(logs: { category: CategoryId; sets: number; detail?: unknown[] }[]) {
  const out: Partial<Record<CategoryId, number>> = {};
  for (const l of logs) out[l.category] = (out[l.category] ?? 0) + (l.detail?.length ?? Math.max(1, l.sets));
  return out;
}

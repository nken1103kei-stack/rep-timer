import type { CategoryId } from "./catalog";
import { dayKey, setsOf } from "./stats";
import type { ResolvedLog } from "./stats";
import type { LogEntry } from "./types";

/** Epley estimate of the one-rep max. */
export const e1rm = (weight: number, reps: number) => (reps <= 0 || weight <= 0 ? 0 : reps === 1 ? weight : weight * (1 + reps / 30));

/**
 * Every record of a menu. Matched by id and also by name and body part, so a menu added again
 * under a new id still finds its history.
 */
export function logsOfExercise<T extends Pick<LogEntry, "exerciseId" | "name" | "category">>(logs: T[], ex: { id: string; name: string; category: CategoryId }) {
  return logs.filter((l) => l.exerciseId === ex.id || (l.name === ex.name && l.category === ex.category));
}

export type ExerciseHistory = { key: string; name: string; category: CategoryId; logs: ResolvedLog[] };

/** All records grouped per exercise, most recently trained first; works for menus no longer in today's list. */
export function exerciseHistories(logs: ResolvedLog[]): ExerciseHistory[] {
  const groups = new Map<string, ExerciseHistory>();
  for (const l of [...logs].sort((a, b) => b.at - a.at)) {
    const key = `${l.category}/${l.name}`;
    const group = groups.get(key) ?? { key, name: l.name, category: l.category, logs: [] };
    group.logs.push(l);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** Best estimated 1RM per record of one exercise, oldest first. */
export function e1rmSeries(logs: LogEntry[], category: CategoryId) {
  return logs
    .map((l) => ({ at: l.at, value: Math.max(0, ...setsOf({ ...l, category }).map((s) => e1rm(s.weight, s.reps))) }))
    .filter((p) => p.value > 0)
    .sort((a, b) => a.at - b.at);
}

/** Heatmap shades: 0 = not trained, then one shade darker every 2 sessions, up to 5 (9 or more). */
export const HEAT_LEVELS = 5;
export const heatLevel = (sessions: number) => (sessions <= 0 ? 0 : Math.min(HEAT_LEVELS, Math.ceil(sessions / 2)));
/** The session range each shade stands for, for the legend: 1–2回 … 9回〜. */
export const heatRange = (level: number) => (level >= HEAT_LEVELS ? `${level * 2 - 1}回〜` : `${level * 2 - 1}–${level * 2}回`);

/** Muscle groups on the heatmap; cardio is not a body part, so it is left out. */
export type HeatPart = Exclude<CategoryId, "cardio" | "other">;
export const HEAT_PARTS: HeatPart[] = ["shoulder", "chest", "back", "arms", "legs", "abs"];

/** How many times (days) each body part was trained, for the heatmap. */
export function sessionsByPart(logs: { category: CategoryId; at: number }[]) {
  const days: Partial<Record<HeatPart, Set<string>>> = {};
  for (const l of logs) {
    if (!(HEAT_PARTS as CategoryId[]).includes(l.category)) continue;
    (days[l.category as HeatPart] ??= new Set()).add(dayKey(l.at));
  }
  return Object.fromEntries(Object.entries(days).map(([k, v]) => [k, v.size])) as Partial<Record<HeatPart, number>>;
}

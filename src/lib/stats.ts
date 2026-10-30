import { category, CATEGORIES, displayWeight, toUnit, type CategoryId, type Unit } from "./catalog";
import type { Exercise, LogEntry } from "./types";

type SetLike = { category: CategoryId; weight: number; reps: number; sets: number };

export const unitLabel = (unit: Unit) => (unit === "kg" ? "kg" : "lbs");

export const formatWeight = (kg: number, unit: Unit) => (kg === 0 ? "自重" : `${displayWeight(kg, unit)}${unitLabel(unit)}`);

export const formatSet = (s: SetLike, unit: Unit) =>
  s.category === "cardio" ? `${s.reps}分` : `${formatWeight(s.weight, unit)} × ${s.reps} × ${s.sets}`;

export function formatVolume(kg: number, unit: Unit) {
  if (unit === "lb") return `${Math.round(toUnit(kg, "lb")).toLocaleString("en-US")}lbs`;
  return kg >= 1000 ? `${Math.round(kg / 100) / 10}t` : `${Math.round(kg)}kg`;
}

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];
export const formatDate = (ms: number) => {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()} (${WEEK[d.getDay()]})`;
};

export const dayKey = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Name and category of a log, preferring the menu's current values. */
export function resolveLog(log: LogEntry, exercises: Exercise[]) {
  const ex = exercises.find((e) => e.id === log.exerciseId);
  return { ...log, name: ex?.name ?? log.name ?? "—", category: ex?.category ?? log.category ?? ("other" as CategoryId) };
}
export type ResolvedLog = ReturnType<typeof resolveLog>;

export function groupByDay(logs: ResolvedLog[]) {
  const map = new Map<string, ResolvedLog[]>();
  for (const l of logs) {
    const k = dayKey(l.at);
    map.set(k, [...(map.get(k) ?? []), l]);
  }
  return map;
}

export type Summary = {
  days: number;
  entries: number;
  sets: number;
  volumeKg: number;
  cardioMin: number;
  byCategory: { id: CategoryId; label: string; color: string; count: number }[];
};

export function summarize(logs: ResolvedLog[]): Summary {
  const days = new Set(logs.map((l) => dayKey(l.at)));
  const counts = new Map<CategoryId, number>();
  let sets = 0;
  let volumeKg = 0;
  let cardioMin = 0;
  for (const l of logs) {
    counts.set(l.category, (counts.get(l.category) ?? 0) + 1);
    if (l.category === "cardio") cardioMin += l.reps;
    else {
      sets += l.sets;
      volumeKg += l.weight * l.reps * l.sets;
    }
  }
  return {
    days: days.size,
    entries: logs.length,
    sets,
    volumeKg,
    cardioMin,
    byCategory: CATEGORIES.filter((c) => counts.has(c.id)).map((c) => ({ ...c, count: counts.get(c.id)! })),
  };
}

export const inMonth = (logs: ResolvedLog[], year: number, month: number) =>
  logs.filter((l) => {
    const d = new Date(l.at);
    return d.getFullYear() === year && d.getMonth() === month;
  });

export function dayShareText(dayMs: number, logs: ResolvedLog[], unit: Unit) {
  const s = summarize(logs);
  const lines = [`${formatDate(dayMs)} のトレーニング`, ...logs.map((l) => `・${l.name}（${category(l.category).label}）${formatSet(l, unit)}`)];
  const totals = [s.sets ? `${s.sets}セット` : "", s.volumeKg ? formatVolume(s.volumeKg, unit) : "", s.cardioMin ? `有酸素 ${s.cardioMin}分` : ""];
  lines.push(`合計 ${totals.filter(Boolean).join(" / ")}`, "#REPS");
  return lines.join("\n");
}

export function monthShareText(year: number, month: number, s: Summary, unit: Unit) {
  return [
    `${year}年${month + 1}月のトレーニング`,
    `トレーニング日数 ${s.days}日`,
    `総セット ${s.sets}`,
    `総ボリューム ${formatVolume(s.volumeKg, unit)}`,
    `有酸素 ${s.cardioMin}分`,
    s.byCategory.map((c) => `${c.label} ${c.count}`).join("・"),
    "#REPS",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Opens the OS share sheet, falling back to the clipboard. */
export async function shareText(text: string): Promise<"shared" | "copied" | "cancelled" | "failed"> {
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return "shared";
    } catch (e) {
      if ((e as Error).name === "AbortError") return "cancelled";
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}

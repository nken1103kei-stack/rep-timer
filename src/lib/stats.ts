import { category, CATEGORIES, displayWeight, toUnit, type CategoryId, type Unit } from "./catalog";
import type { Exercise, LogEntry, SetEntry } from "./types";

type SetLike = { category: CategoryId; weight: number; reps: number; sets: number; detail?: SetEntry[]; rest?: number };

/** The individual sets of a log or menu (older logs only stored one weight/reps for all sets). */
export const setsOf = (s: SetLike): SetEntry[] =>
  s.detail?.length ? s.detail : Array.from({ length: Math.max(1, s.sets) }, () => ({ weight: s.weight, reps: s.reps }));

export const volumeOf = (s: SetLike) => (s.category === "cardio" ? 0 : setsOf(s).reduce((m, x) => m + x.weight * x.reps, 0));

export const cardioMinutes = (s: SetLike) => s.reps * Math.max(1, s.sets);

export const unitLabel = (unit: Unit) => (unit === "kg" ? "kg" : "lbs");

export const formatWeight = (kg: number, unit: Unit) => (kg === 0 ? "自重" : `${displayWeight(kg, unit)}${unitLabel(unit)}`);

export function formatSet(s: SetLike, unit: Unit) {
  if (s.category === "cardio") {
    const rest = s.rest ?? 0;
    if (s.sets <= 1 && rest === 0) return `${s.reps}分`;
    return `${s.reps}分 × ${s.sets}${rest ? `（休憩${rest}分）` : ""}`;
  }
  const list = setsOf(s);
  const uniform = list.every((x) => x.weight === list[0].weight && x.reps === list[0].reps);
  if (uniform) return `${formatWeight(list[0].weight, unit)} × ${list[0].reps} × ${list.length}`;
  return list.map((x) => `${formatWeight(x.weight, unit)}×${x.reps}`).join(" / ");
}

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
    if (l.category === "cardio") cardioMin += cardioMinutes(l);
    else {
      sets += setsOf(l).length;
      volumeKg += volumeOf(l);
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
export type ShareResult = "shared" | "copied" | "cancelled" | "failed";

/** Copies via a hidden textarea; works where the async Clipboard API is missing or blocked (in-app browsers, http). */
function legacyCopy(text: string) {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.cssText = "position:fixed;top:0;left:0;opacity:0;font-size:16px";
  document.body.appendChild(area);
  area.select();
  area.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}

export async function copyText(text: string) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return legacyCopy(text);
  }
}

/**
 * OS share sheet first, then the clipboard. `navigator.share` must run before any await so the tap still counts
 * as a user gesture; it can also be missing or refused (desktop, in-app browsers, a share already open).
 */
export async function shareText(text: string): Promise<ShareResult> {
  if (typeof navigator.share === "function" && (!navigator.canShare || navigator.canShare({ text }))) {
    try {
      await navigator.share({ text });
      return "shared";
    } catch (e) {
      if ((e as Error).name === "AbortError") return "cancelled";
    }
  }
  return (await copyText(text)) ? "copied" : "failed";
}

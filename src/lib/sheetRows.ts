import { category } from "./catalog";
import { cardioSeconds, setsOf, volumeOf } from "./stats";
import type { AppData, LogEntry } from "./types";

/** One record as a spreadsheet row (see docs/spreadsheet-sync.md): weights in kg, the day as the app counts it. */
export type SheetRow = {
  id: string;
  at: number;
  day: string;
  name: string;
  category: string;
  weightKg: number;
  reps: number;
  sets: number;
  volumeKg: number;
  cardioMin: number;
};

/** Apps Script web app URLs only, so the server never posts records anywhere else. */
export const SHEET_URL = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/;

/** Japan time, with the day changing at 4:00 like the app's menu list. */
const DAY_SHIFT_MS = (9 - 4) * 3600_000;
export const sheetDay = (at: number) => new Date(at + DAY_SHIFT_MS).toISOString().slice(0, 10);

const round1 = (n: number) => Math.round(n * 10) / 10;

export function toSheetRow(log: LogEntry): SheetRow {
  const id = log.category ?? "other";
  const like = { ...log, category: id };
  const cardio = id === "cardio";
  return {
    id: log.id,
    at: log.at,
    day: sheetDay(log.at),
    name: log.name ?? "",
    category: category(id).label,
    weightKg: cardio ? 0 : Math.max(...setsOf(like).map((s) => s.weight)),
    reps: cardio ? 0 : log.reps,
    sets: log.sets,
    volumeKg: round1(volumeOf(like)),
    cardioMin: cardio ? round1(cardioSeconds(like) / 60) : 0,
  };
}

/** What changed between the stored copy and the new one: new or edited records, and newly deleted ids. */
export function sheetDiff(before: Pick<AppData, "logs" | "deletedLogs"> | null, after: Pick<AppData, "logs" | "deletedLogs">) {
  const old = new Map((before?.logs ?? []).map((l) => [l.id, JSON.stringify(l)]));
  const upserts = (after.logs ?? []).filter((l) => old.get(l.id) !== JSON.stringify(l)).map(toSheetRow);
  const wasDeleted = new Set(before?.deletedLogs ?? []);
  const deletes = (after.deletedLogs ?? []).filter((id) => !wasDeleted.has(id));
  return { upserts, deletes };
}

/** The tab REPS writes to, and its header row. */
export const SHEET_TAB = "筋トレ記録";
export const SHEET_HEAD = ["記録ID", "日時", "日付", "種目", "部位", "重量(kg)", "回数", "セット", "総挙上(kg)", "有酸素(分)"];

/** Japan time as the sheet reads a date and time, e.g. 2026/11/18 12:00. */
export const sheetTime = (at: number) => {
  const d = new Date(at + 9 * 3600_000).toISOString();
  return `${d.slice(0, 4)}/${d.slice(5, 7)}/${d.slice(8, 10)} ${d.slice(11, 16)}`;
};

/** One row's cells. Text that a sheet would read as a formula is kept as text. */
export function sheetCells(r: SheetRow): (string | number)[] {
  const text = (s: string) => (/^[=+\-@]/.test(s) ? `'${s}` : s);
  return [r.id, sheetTime(r.at), r.day, text(r.name), r.category, r.weightKg, r.reps, r.sets, r.volumeKg, r.cardioMin];
}

/** Every record as CSV for =IMPORTDATA(...), oldest first. */
const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows: (string | number)[][]) => rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";

export function sheetCsv(logs: LogEntry[]): string {
  const rows = [...logs].sort((a, b) => a.at - b.at).map(toSheetRow);
  return toCsv([SHEET_HEAD, ...rows.map((r) => [r.id, sheetTime(r.at), r.day, r.name, r.category, r.weightKg, r.reps, r.sets, r.volumeKg, r.cardioMin])]);
}

/** The header of the daily summary; PFC sheets look columns up by these names. */
export const DAILY_HEAD = ["日付", "セット数", "総挙上量kg", "有酸素分", "種目"];

/**
 * One row per training day for the link URL (=IMPORTDATA): strength sets and volume, cardio minutes, and the exercises.
 * A day with cardio only has 0 sets, so a sheet can tell strength days apart.
 */
export function sheetDailyCsv(logs: LogEntry[]): string {
  const days = new Map<string, { sets: number; volume: number; cardio: number; names: string[] }>();
  for (const r of [...logs].sort((a, b) => a.at - b.at).map(toSheetRow)) {
    const d = days.get(r.day) ?? { sets: 0, volume: 0, cardio: 0, names: [] };
    if (r.category === "有酸素") d.cardio += r.cardioMin;
    else {
      d.sets += r.sets;
      d.volume += r.volumeKg;
    }
    if (r.name && !d.names.includes(r.name)) d.names.push(r.name);
    days.set(r.day, d);
  }
  return toCsv([DAILY_HEAD, ...[...days].map(([day, d]) => [day, d.sets, round1(d.volume), round1(d.cardio), d.names.join("・")])]);
}

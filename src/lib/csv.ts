import { CATEGORIES, guessCategory, fromUnit, type CategoryId, type Unit } from "./catalog";
import { setsOf } from "./stats";
import type { Exercise, LogEntry, SetEntry, SetType } from "./types";

const HEADER = ["日時", "種目", "部位", "セット", "種類", "重量(kg)", "回数", "運動(分)", "休憩(分)", "ラウンド"];

const cell = (v: string | number) => {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const pad = (n: number) => String(n).padStart(2, "0");
const stamp = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

/** All records, one row per set (cardio: one row per record). UTF-8 with BOM so Excel opens it correctly. */
export function exportCsv(logs: LogEntry[], exercises: Exercise[]): string {
  const rows = [HEADER.join(",")];
  for (const log of [...logs].sort((a, b) => a.at - b.at)) {
    const ex = exercises.find((e) => e.id === log.exerciseId);
    const name = ex?.name ?? log.name ?? "";
    const category: CategoryId = ex?.category ?? log.category ?? "other";
    const label = CATEGORIES.find((c) => c.id === category)?.label ?? "その他";
    if (category === "cardio") {
      rows.push([stamp(log.at), name, label, 1, "", "", "", log.reps, log.rest ?? 0, log.sets].map(cell).join(","));
      continue;
    }
    setsOf({ ...log, category }).forEach((s, i) => {
      rows.push([stamp(log.at), name, label, i + 1, s.type ?? "", s.weight, s.reps, "", "", ""].map(cell).join(","));
    });
  }
  return "﻿" + rows.join("\r\n") + "\r\n";
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === "," || ch === ";") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Column names used by this app, Strong, Hevy and FitNotes exports. */
const COLS = {
  date: ["日時", "日付", "date", "start_time"],
  name: ["種目", "exercise name", "exercise_title", "exercise"],
  category: ["部位", "category"],
  type: ["種類", "set_type"],
  kg: ["重量(kg)", "weight_kg", "weight (kgs)", "weight (kg)"],
  lb: ["weight_lbs", "weight (lbs)", "weight (lb)"],
  weight: ["weight"],
  weightUnit: ["weight unit"],
  reps: ["回数", "reps"],
  minutes: ["運動(分)"],
  seconds: ["duration_seconds", "seconds", "duration (seconds)"],
  rest: ["休憩(分)"],
  rounds: ["ラウンド"],
} as const;

const SET_TYPES: Record<string, SetType> = { w: "W", warmup: "W", "warm up": "W", n: "N", normal: "N", d: "D", dropset: "D", "drop set": "D" };

export type ImportResult = { exercises: Exercise[]; logs: LogEntry[]; skipped: number };

/**
 * Turns a CSV into new menus and records. Rows of the same exercise at the same time become one record.
 * Records already present (same menu and time) are skipped, so importing twice is harmless.
 */
export function importCsv(text: string, existing: { exercises: Exercise[]; logs: LogEntry[] }, unit: Unit, newId: () => string): ImportResult {
  const [header, ...body] = parseCsv(text);
  if (!header) return { exercises: [], logs: [], skipped: 0 };
  const h = header.map(norm);
  const col = (k: keyof typeof COLS) => h.findIndex((name) => (COLS[k] as readonly string[]).includes(name));
  const idx = Object.fromEntries(Object.keys(COLS).map((k) => [k, col(k as keyof typeof COLS)])) as Record<keyof typeof COLS, number>;
  if (idx.date < 0 || idx.name < 0) throw new Error("unsupported");

  const num = (row: string[], i: number) => (i >= 0 ? Number((row[i] ?? "").replace(/[^0-9.\-]/g, "")) || 0 : 0);
  const exercises = [...existing.exercises];
  const created: Exercise[] = [];
  const groups = new Map<string, { at: number; ex: Exercise; sets: SetEntry[]; cardio?: { reps: number; rest: number; sets: number } }>();
  let skipped = 0;

  for (const row of body) {
    const name = (row[idx.name] ?? "").trim();
    const at = Date.parse((row[idx.date] ?? "").trim().replace(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/, "$1-$2-$3"));
    if (!name || Number.isNaN(at)) {
      skipped++;
      continue;
    }
    let ex = exercises.find((e) => e.name === name);
    if (!ex) {
      const label = idx.category >= 0 ? (row[idx.category] ?? "").trim() : "";
      const category = CATEGORIES.find((c) => c.label === label || c.id === label.toLowerCase())?.id ?? guessCategory(name);
      ex = { id: newId(), name, category, weight: 0, reps: 10, sets: 3, ...(category === "cardio" ? { reps: 30, sets: 1, rest: 0 } : {}) };
      exercises.push(ex);
      created.push(ex);
    }
    const key = `${ex.id}@${at}`;
    const group = groups.get(key) ?? { at, ex, sets: [] };
    groups.set(key, group);

    if (ex.category === "cardio") {
      const minutes = num(row, idx.minutes) || Math.round(num(row, idx.seconds) / 60);
      group.cardio = { reps: Math.max(1, minutes), rest: num(row, idx.rest), sets: Math.max(1, num(row, idx.rounds) || 1) };
      continue;
    }
    let weight = 0;
    if (idx.kg >= 0 && row[idx.kg]?.trim()) weight = num(row, idx.kg);
    else if (idx.lb >= 0 && row[idx.lb]?.trim()) weight = fromUnit(num(row, idx.lb), "lb");
    else if (idx.weight >= 0) {
      const u = idx.weightUnit >= 0 ? norm(row[idx.weightUnit] ?? "") : "";
      weight = fromUnit(num(row, idx.weight), u.startsWith("lb") ? "lb" : u.startsWith("kg") ? "kg" : unit);
    }
    const type = idx.type >= 0 ? SET_TYPES[norm(row[idx.type] ?? "")] : undefined;
    group.sets.push({ weight: Math.round(weight * 100) / 100, reps: num(row, idx.reps), ...(type ? { type } : {}) });
  }

  const logs: LogEntry[] = [];
  for (const g of groups.values()) {
    if (existing.logs.some((l) => l.exerciseId === g.ex.id && l.at === g.at)) {
      skipped++;
      continue;
    }
    const base = { id: newId(), exerciseId: g.ex.id, at: g.at, name: g.ex.name, category: g.ex.category };
    if (g.ex.category === "cardio" && g.cardio) logs.push({ ...base, weight: 0, ...g.cardio });
    else if (g.sets.length) logs.push({ ...base, weight: g.sets[0].weight, reps: g.sets[0].reps, sets: g.sets.length, detail: g.sets });
  }
  // New menus start from their latest imported record.
  for (const ex of created) {
    const last = logs.filter((l) => l.exerciseId === ex.id).sort((a, b) => b.at - a.at)[0];
    if (last) Object.assign(ex, { weight: last.weight, reps: last.reps, sets: last.sets, detail: last.detail, ...(ex.category === "cardio" ? { rest: last.rest ?? 0 } : {}) });
  }
  return { exercises: created, logs, skipped };
}

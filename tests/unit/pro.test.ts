import { describe, expect, it } from "vitest";
import { isOwner, isPro, signStripePayload, verifyStripeSignature } from "../../worker/billing";
import { exportCsv, importCsv, parseCsv } from "../../src/lib/csv";
import { platesPerSide } from "../../src/lib/plates";
import { buildSegments, totalMs, tutOf } from "../../src/lib/timer";
import { e1rm, e1rmSeries, setsByCategory } from "../../src/lib/analytics";
import { nextSetType } from "../../src/lib/record";
import type { Exercise, LogEntry } from "../../src/lib/types";

describe("stripe webhook signature", () => {
  const secret = "whsec_test";
  const body = JSON.stringify({ type: "checkout.session.completed" });

  it("accepts a correctly signed, fresh payload", async () => {
    const header = await signStripePayload(body, secret, 1000);
    expect(await verifyStripeSignature(body, header, secret, 1010)).toBe(true);
  });

  it("rejects tampering, wrong secrets, stale timestamps and missing headers", async () => {
    const header = await signStripePayload(body, secret, 1000);
    expect(await verifyStripeSignature(body + " ", header, secret, 1010)).toBe(false);
    expect(await verifyStripeSignature(body, header, "whsec_other", 1010)).toBe(false);
    expect(await verifyStripeSignature(body, header, secret, 1000 + 301)).toBe(false);
    expect(await verifyStripeSignature(body, null, secret, 1000)).toBe(false);
    expect(await verifyStripeSignature(body, "t=1000,v1=deadbeef", secret, 1000)).toBe(false);
  });

  it("recognises the creator's email from the comma-separated owner list", () => {
    expect(isOwner("Owner@Example.test", " a@x.test, owner@example.test ")).toBe(true);
    expect(isOwner("other@example.test", "owner@example.test")).toBe(false);
    expect(isOwner("owner@example.test", undefined)).toBe(false);
    expect(isOwner("", "")).toBe(false);
    // Hand-typed secrets: full-width characters, quotes, other separators, and Gmail's dot/+tag rules.
    expect(isOwner("me.name@gmail.com", "ｍｅ．ｎａｍｅ＠ｇｍａｉｌ．ｃｏｍ")).toBe(true);
    expect(isOwner("me.name@gmail.com", '"me.name@gmail.com"')).toBe(true);
    expect(isOwner("me.name@gmail.com", "a@x.test； me.name@gmail.com")).toBe(true);
    expect(isOwner("me.name@gmail.com", "a@x.test、memane@gmail.com")).toBe(false);
    expect(isOwner("me.name@gmail.com", "mename+app@googlemail.com")).toBe(true);
    expect(isOwner("me.name@example.test", "mename@example.test")).toBe(false);
  });

  it("treats only active and trialing subscriptions as Pro", () => {
    expect(isPro("active")).toBe(true);
    expect(isPro("trialing")).toBe(true);
    for (const s of ["canceled", "past_due", "incomplete", null]) expect(isPro(s)).toBe(false);
  });
});

const bench: Exercise = { id: "b", name: "ベンチプレス", category: "chest", weight: 60, reps: 10, sets: 2 };
const run: Exercise = { id: "r", name: "ランニング", category: "cardio", weight: 0, reps: 20, sets: 2, rest: 1 };
const at = new Date(2026, 9, 1, 10, 0, 0).getTime();
const logs: LogEntry[] = [
  { id: "1", exerciseId: "b", at, weight: 40, reps: 10, sets: 2, detail: [{ weight: 40, reps: 10, type: "W" }, { weight: 62.5, reps: 8 }] },
  { id: "2", exerciseId: "r", at: at + 60_000, weight: 0, reps: 20, sets: 2, rest: 1 },
];

describe("csv", () => {
  it("exports one row per set with a BOM, and quotes commas", () => {
    const csv = exportCsv(logs, [bench, { ...run, name: "ラン,ニング" }]);
    expect(csv.startsWith("﻿日時,種目,部位")).toBe(true);
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(4);
    expect(rows[1]).toEqual(["2026-10-01 10:00:00", "ベンチプレス", "胸", "1", "W", "40", "10", "", "", ""]);
    expect(rows[3][1]).toBe("ラン,ニング");
    expect(rows[3].slice(7)).toEqual(["20", "1", "2"]);
  });

  it("round-trips its own export, and importing twice adds nothing", () => {
    const csv = exportCsv(logs, [bench, run]);
    let n = 0;
    const fresh = importCsv(csv, { exercises: [], logs: [] }, "kg", () => `id${n++}`);
    expect(fresh.exercises.map((e) => [e.name, e.category])).toEqual([
      ["ベンチプレス", "chest"],
      ["ランニング", "cardio"],
    ]);
    expect(fresh.logs[0].detail).toEqual([{ weight: 40, reps: 10, type: "W" }, { weight: 62.5, reps: 8 }]);
    expect(fresh.logs[1]).toMatchObject({ reps: 20, rest: 1, sets: 2 });
    const again = importCsv(csv, { exercises: fresh.exercises, logs: fresh.logs }, "kg", () => `x${n++}`);
    expect(again.logs).toHaveLength(0);
    expect(again.skipped).toBe(2);
  });

  it("reads Strong and Hevy exports, converting pounds to kg", () => {
    const strong = 'Date,Workout Name,Exercise Name,Set Order,Weight,Reps\n2026-10-02 09:00:00,Push,"Bench Press (Barbell)",1,135,8\n2026-10-02 09:00:00,Push,"Bench Press (Barbell)",2,135,6\n';
    const s = importCsv(strong, { exercises: [], logs: [] }, "lb", () => "s");
    expect(s.logs[0].detail).toEqual([{ weight: 61.23, reps: 8 }, { weight: 61.23, reps: 6 }]);

    const hevy = 'title,start_time,exercise_title,set_index,set_type,weight_kg,reps\nLeg,"2 Oct 2026, 18:00",Squat,0,warmup,60,5\nLeg,"2 Oct 2026, 18:00",Squat,1,normal,100,5\n';
    const h = importCsv(hevy, { exercises: [], logs: [] }, "kg", () => "h");
    expect(h.exercises[0].category).toBe("legs");
    expect(h.logs[0].detail).toEqual([{ weight: 60, reps: 5, type: "W" }, { weight: 100, reps: 5, type: "N" }]);
  });

  it("rejects files without a date and exercise column", () => {
    expect(() => importCsv("a,b\n1,2\n", { exercises: [], logs: [] }, "kg", () => "z")).toThrow();
  });
});

describe("pro tools", () => {
  it("works out plates per side", () => {
    expect(platesPerSide(100, "kg")).toEqual({ bar: 20, plates: [25, 15], rest: 0 });
    expect(platesPerSide(62.5, "kg")).toEqual({ bar: 20, plates: [20, 1.25], rest: 0 });
    expect(platesPerSide(20, "kg")).toBeNull();
  });

  it("superset timer: A, move, B, then the long rest between rounds", () => {
    const seg = buildSegments({ prepare: 0, kind: "superset", work: 40, work2: 30, transition: 10, rest: 90, rounds: 2 });
    expect(seg.map((s) => `${s.phase}${s.label ?? ""}`)).toEqual(["workA", "transition", "workB", "rest", "workA", "transition", "workB"]);
    expect(totalMs(seg)).toBe((40 + 10 + 30) * 2000 + 90_000);
  });

  it("tempo timer: four phases per rep, top or bottom start, and TUT", () => {
    const top = buildSegments({ prepare: 0, kind: "tempo", work: 0, tempo: [3, 1, 2, 0], reps: 2, rest: 60, rounds: 1 });
    expect(top.map((s) => `${s.phase}${s.rep}`)).toEqual(["ecc1", "bottom1", "con1", "ecc2", "bottom2", "con2"]);
    const bottom = buildSegments({ prepare: 0, kind: "tempo", work: 0, tempo: [3, 1, 2, 1], reps: 1, rest: 0, rounds: 1, tempoStart: "bottom" });
    expect(bottom.map((s) => s.phase)).toEqual(["con", "top", "ecc", "bottom"]);
    expect(tutOf([3, 1, 2, 0], 10)).toBe(60);
  });

  it("estimates 1RM and counts sets per body part", () => {
    expect(e1rm(100, 1)).toBe(100);
    expect(e1rm(60, 30)).toBe(120);
    expect(e1rmSeries(logs, "b", "chest").map((p) => Math.round(p.value * 10) / 10)).toEqual([79.2]);
    expect(setsByCategory([{ category: "chest", sets: 2, detail: [1, 2, 3] }, { category: "cardio", sets: 2 }])).toEqual({ chest: 3, cardio: 2 });
  });

  it("cycles set types N → W → D → N", () => {
    expect([nextSetType("N"), nextSetType("W"), nextSetType("D"), nextSetType(undefined)]).toEqual(["W", "D", "N", "W"]);
  });
});

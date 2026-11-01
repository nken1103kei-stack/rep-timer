import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Pause, Play, Square } from "lucide-react";
import { beep, haptic, unlockAudio } from "../lib/feedback";
import { formatClock } from "../lib/timer";
import { platesPerSide } from "../lib/plates";
import { formatWeight, unitLabel } from "../lib/stats";
import type { Unit } from "../lib/catalog";
import type { SetEntry, SetType } from "../lib/types";
import { SET_TYPE } from "../lib/record";
import { spring } from "./ui";
import { endClock, useBackgroundStatus } from "../lib/background";

/**
 * A rest countdown. It opens in "ready" so the time can be set first; `endAt` is set only while it runs,
 * and `leftMs` holds the time left while ready or paused.
 */
export type RestRun = {
  id: number;
  type: SetType;
  total: number;
  next: { index: number; set: SetEntry } | null;
  endAt: number | null;
  leftMs: number;
  started: boolean;
};

export const newRest = (type: SetType, total: number, next: RestRun["next"]): RestRun => ({
  id: Date.now(),
  type,
  total,
  next,
  endAt: null,
  leftMs: total * 1000,
  started: false,
});

const PRESETS = [60, 90, 120, 180, 300];
const MAX_SEC = 30 * 60;

const leftOf = (run: RestRun, now: number) => (run.endAt === null ? run.leftMs : Math.max(0, run.endAt - now));

/**
 * Rest countdown that never covers the form: the next set and the plates to load stay visible,
 * and the inputs underneath keep working.
 */
export function RestBanner({ run, unit, onChange, onDone }: { run: RestRun; unit: Unit; onChange: (run: RestRun) => void; onDone: () => void }) {
  const [now, setNow] = useState(Date.now());
  const remaining = leftOf(run, now);
  const sec = Math.ceil(remaining / 1000);
  const running = run.endAt !== null;
  const finished = running && remaining === 0;

  useEffect(() => {
    unlockAudio();
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, []);

  const endAt = run.endAt;
  useBackgroundStatus(
    endAt !== null && !finished
      ? (t) => ({ title: `休憩 残り ${formatClock(Math.max(0, endAt - t))}`, body: `${endClock(endAt)} に休憩終了` })
      : null,
  );

  const lastSec = useRef(sec);
  useEffect(() => {
    if (lastSec.current === sec) return;
    lastSec.current = sec;
    if (running && sec > 0 && sec <= 3) {
      beep(880, 0.09);
      haptic(20);
    }
  }, [sec, running]);

  useEffect(() => {
    if (!finished) return;
    beep(1175, 0.4);
    haptic([80, 40, 80]);
    const t = setTimeout(onDone, 1600);
    return () => clearTimeout(t);
  }, [finished]);

  const start = () => {
    haptic(12);
    unlockAudio();
    onChange({ ...run, started: true, endAt: Date.now() + run.leftMs });
  };
  const pause = () => {
    haptic(12);
    onChange({ ...run, endAt: null, leftMs: remaining });
  };
  // Setting the time: before the start it sets the countdown, while running it moves the end.
  const setLeft = (ms: number) => {
    const left = Math.min(MAX_SEC * 1000, Math.max(running ? 0 : 5000, ms));
    const total = Math.max(run.total, Math.ceil(left / 1000));
    onChange(running ? { ...run, total, endAt: Date.now() + left } : { ...run, total: run.started ? total : Math.ceil(left / 1000), leftMs: left });
  };

  const plates = run.next && run.next.set.weight > 0 ? platesPerSide(run.next.set.weight, unit) : null;
  const meta = SET_TYPE[run.type];
  const state = finished ? "finished" : running ? "running" : run.started ? "paused" : "ready";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12, scale: 0.97 }}
      transition={spring}
      className="sticky top-0 z-10 -mx-1 overflow-hidden rounded-2xl bg-white/90 shadow-[0_12px_30px_-12px_rgb(15_23_42/0.35)] backdrop-blur-xl"
      data-testid="rest-banner"
      data-state={state}
      data-finished={finished}
    >
      <motion.div
        className="absolute inset-y-0 left-0 bg-rest/12"
        animate={{ width: `${Math.min(100, (remaining / (run.total * 1000)) * 100)}%` }}
        transition={{ ease: "linear", duration: 0.2 }}
      />
      <div className="relative flex items-center gap-3 px-3 pt-2 pb-1.5">
        <div className="flex flex-col items-center">
          <span className="text-[9px] font-extrabold tracking-wider" style={{ color: finished ? "#14C38E" : "#00A3FF" }}>
            {finished ? "GO" : state === "ready" ? "休憩を設定" : state === "paused" ? "一時停止中" : "REST"}
          </span>
          <span className="relative" data-testid="rest-clock" data-sec={sec}>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={finished ? "go" : sec}
                initial={{ y: 14, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -14, opacity: 0 }}
                className={`block font-display text-[34px] leading-none font-extrabold italic tabular-nums ${state === "paused" ? "animate-pulse" : ""}`}
              >
                {finished ? "GO" : formatClock(remaining)}
              </motion.span>
            </AnimatePresence>
          </span>
          <span className="text-[9px] font-bold" style={{ color: meta.color }}>
            {meta.label}後
          </span>
        </div>
        <div className="min-w-0 flex-1 text-xs">
          {run.next ? (
            <>
              <div className="font-bold text-mute">次 · SET {run.next.index + 1}</div>
              <div className="font-display text-xl font-extrabold" data-testid="rest-next">
                {formatWeight(run.next.set.weight, unit)} × {run.next.set.reps}
              </div>
              {plates && (
                <div className="truncate font-semibold text-mute" data-testid="rest-plates">
                  片側 {plates.plates.join(" + ")}
                  {unitLabel(unit)}
                  <span className="text-slate-400">（バー{plates.bar}{unitLabel(unit)}）</span>
                </div>
              )}
            </>
          ) : (
            <div className="font-bold text-mute">最後のセットです。記録しましょう</div>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex gap-1">
            {[-15, 15].map((d) => (
              <motion.button
                key={d}
                type="button"
                whileTap={{ scale: 0.88 }}
                onClick={() => setLeft(remaining + d * 1000)}
                aria-label={d > 0 ? "15秒延ばす" : "15秒縮める"}
                data-testid={d > 0 ? "rest-plus" : "rest-minus"}
                className="h-8 w-10 rounded-lg bg-slate-900/6 font-display text-xs font-bold"
              >
                {d > 0 ? "+15" : "−15"}
              </motion.button>
            ))}
          </div>
          <div className="flex gap-1">
            <motion.button
              type="button"
              whileTap={{ scale: 0.92 }}
              onClick={running ? pause : start}
              aria-label={running ? "一時停止" : state === "ready" ? "休憩をスタート" : "再開"}
              data-testid="rest-toggle"
              className={`flex h-8 w-10 items-center justify-center rounded-lg text-white ${running ? "bg-ink" : "bg-rest"}`}
            >
              {running ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
            </motion.button>
            <motion.button
              type="button"
              whileTap={{ scale: 0.92 }}
              onClick={onDone}
              aria-label="休憩タイマーを停止"
              data-testid="rest-stop"
              className="flex h-8 w-10 items-center justify-center rounded-lg bg-slate-900/6 text-ink"
            >
              <Square size={12} fill="currentColor" />
            </motion.button>
          </div>
        </div>
      </div>
      {/* Before the start: pick a length, then start. */}
      {!running && !finished && (
        <div className="relative flex items-center gap-1.5 px-3 pb-2.5">
          <div className="no-scrollbar flex min-w-0 flex-1 gap-1 overflow-x-auto">
            {PRESETS.map((p) => (
              <motion.button
                key={p}
                type="button"
                whileTap={{ scale: 0.9 }}
                onClick={() => setLeft(p * 1000)}
                data-testid="rest-preset"
                data-sec={p}
                className={`h-8 shrink-0 rounded-lg px-2.5 font-display text-xs font-bold ${sec === p ? "bg-rest text-white" : "bg-slate-900/6"}`}
              >
                {p % 60 ? `${Math.floor(p / 60)}分${p % 60}秒` : `${p / 60}分`}
              </motion.button>
            ))}
          </div>
          <motion.button
            type="button"
            whileTap={{ scale: 0.94 }}
            onClick={start}
            data-testid="rest-start"
            className="flex h-8 shrink-0 items-center gap-1 rounded-lg bg-rest px-3 text-xs font-extrabold text-white"
          >
            <Play size={12} fill="currentColor" /> {state === "ready" ? "スタート" : "再開"}
          </motion.button>
        </div>
      )}
    </motion.div>
  );
}

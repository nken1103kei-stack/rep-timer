import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { SkipForward } from "lucide-react";
import { beep, haptic, unlockAudio } from "../lib/feedback";
import { formatClock } from "../lib/timer";
import { platesPerSide } from "../lib/plates";
import { formatWeight, unitLabel } from "../lib/stats";
import type { Unit } from "../lib/catalog";
import type { SetEntry, SetType } from "../lib/types";
import { SET_TYPE } from "../lib/record";
import { spring } from "./ui";

export type RestRun = { id: number; type: SetType; endAt: number; total: number; next: { index: number; set: SetEntry } | null };

/**
 * Rest countdown that never covers the form: the next set and the plates to load stay visible,
 * and the inputs underneath keep working.
 */
export function RestBanner({ run, unit, onAdjust, onDone }: { run: RestRun; unit: Unit; onAdjust: (deltaSec: number) => void; onDone: () => void }) {
  const [now, setNow] = useState(Date.now());
  const remaining = Math.max(0, run.endAt - now);
  const sec = Math.ceil(remaining / 1000);
  const finished = remaining === 0;

  useEffect(() => {
    unlockAudio();
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, []);

  const lastSec = useRef(sec);
  useEffect(() => {
    if (lastSec.current === sec) return;
    lastSec.current = sec;
    if (sec > 0 && sec <= 3) {
      beep(880, 0.09);
      haptic(20);
    }
  }, [sec]);

  useEffect(() => {
    if (!finished) return;
    beep(1175, 0.4);
    haptic([80, 40, 80]);
    const t = setTimeout(onDone, 1600);
    return () => clearTimeout(t);
  }, [finished]);

  const plates = run.next && run.next.set.weight > 0 ? platesPerSide(run.next.set.weight, unit) : null;
  const meta = SET_TYPE[run.type];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12, scale: 0.97 }}
      transition={spring}
      className="sticky top-0 z-10 -mx-1 overflow-hidden rounded-2xl bg-white/90 shadow-[0_12px_30px_-12px_rgb(15_23_42/0.35)] backdrop-blur-xl"
      data-testid="rest-banner"
      data-finished={finished}
    >
      <motion.div
        className="absolute inset-y-0 left-0 bg-rest/12"
        animate={{ width: `${(remaining / (run.total * 1000)) * 100}%` }}
        transition={{ ease: "linear", duration: 0.2 }}
      />
      <div className="relative flex items-center gap-3 px-3 py-2">
        <div className="flex flex-col items-center">
          <span className="text-[9px] font-extrabold tracking-wider" style={{ color: finished ? "#14C38E" : "#00A3FF" }}>
            {finished ? "GO" : "REST"}
          </span>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={finished ? "go" : sec}
              initial={{ y: 14, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -14, opacity: 0 }}
              className="font-display text-[34px] leading-none font-extrabold italic tabular-nums"
              data-testid="rest-clock"
              data-sec={sec}
            >
              {finished ? "GO" : formatClock(remaining)}
            </motion.span>
          </AnimatePresence>
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
                onClick={() => onAdjust(d)}
                aria-label={d > 0 ? "15秒延ばす" : "15秒縮める"}
                className="h-8 w-10 rounded-lg bg-slate-900/6 font-display text-xs font-bold"
              >
                {d > 0 ? "+15" : "−15"}
              </motion.button>
            ))}
          </div>
          <motion.button
            type="button"
            whileTap={{ scale: 0.92 }}
            onClick={onDone}
            aria-label="休憩をスキップ"
            data-testid="rest-skip"
            className="flex h-8 items-center justify-center gap-1 rounded-lg bg-ink text-[11px] font-bold text-white"
          >
            <SkipForward size={12} fill="currentColor" /> スキップ
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Pause, Play, SkipForward, X } from "lucide-react";
import { useStore } from "../lib/store";
import { buildSegments, formatClock, formatDuration, segmentStart, timerAt, type Phase } from "../lib/timer";
import type { Exercise, Preset } from "../lib/types";
import { beep, haptic, keepAwake } from "../lib/feedback";
import { PrimaryButton, spring, Stepper } from "./ui";

const PHASE: Record<Phase, { label: string; color: string; tint: string }> = {
  prepare: { label: "READY", color: "#FFB800", tint: "rgb(255 184 0 / 0.28)" },
  work: { label: "WORK", color: "#FF4F00", tint: "rgb(255 79 0 / 0.26)" },
  rest: { label: "REST", color: "#00A3FF", tint: "rgb(0 163 255 / 0.24)" },
  done: { label: "DONE", color: "#14C38E", tint: "rgb(20 195 142 / 0.26)" },
};

const R = 128;
const C = 2 * Math.PI * R;

export function TimerOverlay({ preset, exercise, onClose }: { preset: Preset; exercise: Exercise | null; onClose: () => void }) {
  const segments = useMemo(() => buildSegments({ prepare: preset.work > 0 ? 5 : 0, ...preset }), [preset]);
  const startRef = useRef(Date.now());
  const pausedTotal = useRef(0);
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  const elapsed = (pausedAt ?? now) - startRef.current - pausedTotal.current;
  const st = timerAt(segments, elapsed);
  const sec = Math.ceil(st.remainingMs / 1000);
  const meta = PHASE[st.phase];

  useEffect(() => {
    void keepAwake(true);
    let raf = 0;
    const loop = () => {
      setNow(Date.now());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      void keepAwake(false);
    };
  }, []);

  // Cues: a long tone on every phase change, short ticks for the final three seconds.
  const lastIndex = useRef(st.index);
  useEffect(() => {
    if (st.index === lastIndex.current) return;
    lastIndex.current = st.index;
    if (st.phase === "done") {
      beep(1320, 0.5);
      haptic([60, 60, 60, 60, 200]);
    } else {
      beep(st.phase === "work" ? 1175 : 660, 0.35);
      haptic(st.phase === "work" ? [80, 40, 80] : 120);
    }
  }, [st.index, st.phase]);

  useEffect(() => {
    if (st.phase !== "done" && pausedAt === null && sec > 0 && sec <= 3) {
      beep(880, 0.09);
      haptic(20);
    }
  }, [sec, st.phase, pausedAt]);

  useEffect(() => {
    if (st.phase === "done") void keepAwake(false);
  }, [st.phase]);

  const togglePause = () => {
    haptic(12);
    if (pausedAt === null) setPausedAt(Date.now());
    else {
      pausedTotal.current += Date.now() - pausedAt;
      setPausedAt(null);
    }
  };

  const skip = () => {
    haptic(12);
    startRef.current -= segmentStart(segments, st.index + 1) - elapsed;
    setNow(Date.now());
  };

  return (
    <motion.div
      data-testid="timer-overlay"
      data-phase={st.phase}
      className="fixed inset-0 z-[60] overflow-hidden bg-[#f6f7f9]"
      initial={{ clipPath: "circle(0% at 50% 85%)" }}
      animate={{ clipPath: "circle(150% at 50% 85%)" }}
      exit={{ opacity: 0, scale: 1.04 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
    >
      <AnimatePresence>
        <motion.div
          key={st.phase}
          className="absolute inset-0"
          style={{ background: `radial-gradient(120% 70% at 50% 35%, ${meta.tint}, transparent 70%)` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
        />
      </AnimatePresence>

      <div className="relative mx-auto flex h-full max-w-md flex-col px-5 pt-[max(env(safe-area-inset-top),16px)] pb-[max(env(safe-area-inset-bottom),24px)]">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <div className="truncate text-sm font-bold">{exercise?.name ?? preset.name}</div>
            <div className="font-display text-xs font-semibold text-mute">
              {preset.work > 0 ? `${preset.work}/${preset.rest} × ${preset.rounds}` : `REST ${formatDuration(preset.rest * 1000)}`}
            </div>
          </div>
          <motion.button
            type="button"
            whileTap={{ scale: 0.85 }}
            onClick={onClose}
            aria-label="閉じる"
            data-testid="timer-close"
            className="glass grid size-11 place-items-center rounded-full"
          >
            <X size={20} />
          </motion.button>
        </div>

        <AnimatePresence mode="wait">
          {st.phase === "done" ? (
            <DoneView key="done" exercise={exercise} preset={preset} totalMs={st.totalMs} onClose={onClose} />
          ) : (
            <motion.div key="run" className="flex flex-1 flex-col" exit={{ opacity: 0, scale: 0.9 }}>
              <div className="relative mx-auto mt-6 grid aspect-square w-full max-w-[320px] place-items-center">
                <svg viewBox="0 0 300 300" className="absolute inset-0 -rotate-90">
                  <circle cx="150" cy="150" r={R} fill="none" stroke="rgb(15 23 42 / 0.07)" strokeWidth="14" />
                  <motion.circle
                    cx="150"
                    cy="150"
                    r={R}
                    fill="none"
                    strokeWidth="14"
                    strokeLinecap="round"
                    strokeDasharray={C}
                    animate={{ stroke: meta.color }}
                    style={{ strokeDashoffset: C * st.progress, filter: `drop-shadow(0 0 10px ${meta.tint})` }}
                  />
                </svg>
                <div className="glass absolute inset-[34px] rounded-full" />
                <div className="relative flex flex-col items-center">
                  <motion.div
                    key={st.phase}
                    initial={{ y: 10, opacity: 0, letterSpacing: "0.5em" }}
                    animate={{ y: 0, opacity: 1, letterSpacing: "0.22em" }}
                    className="text-sm font-extrabold"
                    style={{ color: meta.color }}
                    data-testid="timer-phase"
                  >
                    {meta.label}
                  </motion.div>
                  <div className="relative h-[120px] overflow-hidden" data-testid="timer-clock" data-sec={sec} aria-live="polite">
                    <AnimatePresence mode="popLayout" initial={false}>
                      <motion.div
                        key={sec}
                        initial={{ y: 60, opacity: 0, scale: 0.8 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        exit={{ y: -60, opacity: 0, scale: 0.8 }}
                        transition={{ type: "spring", stiffness: 500, damping: 34 }}
                        className="font-display text-[112px] leading-[120px] font-extrabold italic tabular-nums"
                      >
                        {formatClock(st.remainingMs)}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                  {st.rounds > 1 && (
                    <div className="font-display text-xl font-bold text-mute" data-testid="timer-round">
                      {st.round} / {st.rounds}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6 flex justify-center gap-1.5">
                {Array.from({ length: Math.min(st.rounds, 20) }, (_, i) => (
                  <motion.span
                    key={i}
                    className="h-1.5 rounded-full"
                    animate={{
                      width: i + 1 === st.round ? 22 : 8,
                      backgroundColor: i + 1 < st.round ? "#0b0c0f" : i + 1 === st.round ? meta.color : "rgb(15 23 42 / 0.12)",
                    }}
                    transition={spring}
                  />
                ))}
              </div>

              <div className="mt-auto flex items-center justify-center gap-6">
                <div className="size-14" />
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.88 }}
                  onClick={togglePause}
                  aria-label={pausedAt === null ? "一時停止" : "再開"}
                  data-testid="timer-pause"
                  className="grid size-22 place-items-center rounded-full text-white"
                  animate={{ backgroundColor: pausedAt === null ? "#0b0c0f" : meta.color }}
                  style={{ boxShadow: `0 16px 40px -10px ${meta.color}` }}
                >
                  {pausedAt === null ? <Pause size={34} fill="currentColor" /> : <Play size={34} fill="currentColor" className="ml-1" />}
                </motion.button>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.85 }}
                  onClick={skip}
                  aria-label="スキップ"
                  data-testid="timer-skip"
                  className="glass grid size-14 place-items-center rounded-full"
                >
                  <SkipForward size={22} fill="currentColor" />
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function DoneView({ exercise, preset, totalMs, onClose }: { exercise: Exercise | null; preset: Preset; totalMs: number; onClose: () => void }) {
  const addLog = useStore((s) => s.addLog);
  const [form, setForm] = useState({
    weight: exercise?.weight ?? 0,
    reps: exercise?.reps ?? 10,
    sets: exercise ? (preset.work > 0 ? preset.rounds : exercise.sets) : 1,
  });
  return (
    <motion.div
      className="flex flex-1 flex-col"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
      data-testid="timer-done"
    >
      <div className="mt-10 flex flex-col items-center">
        <motion.div
          initial={{ scale: 0, rotate: -120 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 14, delay: 0.1 }}
          className="grid size-24 place-items-center rounded-full bg-go text-white shadow-[0_18px_40px_-10px_rgb(20_195_142/0.8)]"
        >
          <Check size={48} strokeWidth={3.5} />
        </motion.div>
        <div className="mt-4 font-display text-5xl font-extrabold italic">DONE</div>
        <div className="font-display text-lg font-semibold text-mute">{formatDuration(totalMs)}</div>
      </div>
      <div className="mt-auto space-y-3">
        {exercise && (
          <>
            <Stepper label="重量" unit="kg" step={2.5} max={500} value={form.weight} onChange={(weight) => setForm({ ...form, weight })} />
            <div className="grid grid-cols-2 gap-3">
              <Stepper label="回数" min={1} value={form.reps} onChange={(reps) => setForm({ ...form, reps })} />
              <Stepper label="セット" min={1} max={99} value={form.sets} onChange={(sets) => setForm({ ...form, sets })} />
            </div>
            <PrimaryButton
              testId="record-save"
              onClick={() => {
                addLog({ exerciseId: exercise.id, ...form });
                onClose();
              }}
            >
              記録して終了
            </PrimaryButton>
          </>
        )}
        <PrimaryButton tone="ghost" onClick={onClose} testId="done-close">
          閉じる
        </PrimaryButton>
      </div>
    </motion.div>
  );
}

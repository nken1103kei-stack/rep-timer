import { AnimatePresence, motion } from "motion/react";
import { Dumbbell, Play, Plus, X } from "lucide-react";
import { useStore } from "../lib/store";
import { buildSegments, formatDuration, totalMs } from "../lib/timer";
import type { Preset } from "../lib/types";
import { haptic } from "../lib/feedback";
import { formatWeight, spring } from "./ui";

export const presetLabel = (p: Preset) =>
  p.work === 0 ? formatDuration(p.rest * 1000) : `${p.work}/${p.rest}`;

export function TimerPanel({ onStart, onEditPreset }: { onStart: () => void; onEditPreset: (id?: string) => void }) {
  const presets = useStore((s) => s.presets);
  const selectedPresetId = useStore((s) => s.selectedPresetId);
  const selectPreset = useStore((s) => s.selectPreset);
  const exercise = useStore((s) => s.exercises.find((e) => e.id === s.selectedExerciseId));
  const selectExercise = useStore((s) => s.selectExercise);
  const preset = presets.find((p) => p.id === selectedPresetId) ?? presets[0];
  const total = totalMs(buildSegments({ prepare: 0, ...preset }));

  return (
    <section className="glass sheen rounded-[28px] p-4" data-testid="timer-panel">
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label="タイマー">
        {presets.map((p) => {
          const active = p.id === preset.id;
          return (
            <motion.button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid="preset-chip"
              whileTap={{ scale: 0.92 }}
              onClick={() => {
                haptic(8);
                // Tapping the active chip again opens its editor.
                if (active) onEditPreset(p.id);
                else selectPreset(p.id);
              }}
              className={`relative h-10 shrink-0 rounded-full px-4 text-sm font-bold whitespace-nowrap transition-colors ${
                active ? "text-white" : "bg-white/60 text-ink"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="preset-pill"
                  transition={spring}
                  className="absolute inset-0 rounded-full bg-ink shadow-[0_8px_20px_-8px_rgb(11_12_15/0.7)]"
                />
              )}
              <span className="relative">
                {p.name} <span className={active ? "text-white/60" : "text-mute"}>{presetLabel(p)}</span>
              </span>
            </motion.button>
          );
        })}
        <motion.button
          type="button"
          whileTap={{ scale: 0.9 }}
          aria-label="タイマーを追加"
          data-testid="preset-add"
          onClick={() => onEditPreset()}
          className="grid size-10 shrink-0 place-items-center rounded-full border border-dashed border-slate-900/20 text-mute"
        >
          <Plus size={18} />
        </motion.button>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={preset.id + preset.work + preset.rest + preset.rounds}
            initial={{ opacity: 0, y: 14, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -14, filter: "blur(4px)" }}
            transition={{ duration: 0.25 }}
            data-testid="preset-summary"
          >
            {preset.work === 0 ? (
              <Big value={formatDuration(preset.rest * 1000)} label="REST" color="text-rest" />
            ) : (
              <div className="flex items-end gap-3">
                <Big value={preset.work} label="WORK" color="text-accent" />
                <Big value={preset.rest} label="REST" color="text-rest" />
                <Big value={`×${preset.rounds}`} label="SETS" color="text-ink" />
              </div>
            )}
            <div className="mt-1 text-xs font-semibold text-mute">TOTAL {formatDuration(total)}</div>
          </motion.div>
        </AnimatePresence>

        <motion.button
          type="button"
          aria-label="スタート"
          data-testid="start-button"
          whileTap={{ scale: 0.88 }}
          whileHover={{ scale: 1.04 }}
          transition={spring}
          onClick={onStart}
          className="relative grid size-20 shrink-0 place-items-center rounded-full bg-accent text-white shadow-[0_14px_36px_-8px_rgb(255_79_0/0.75)]"
        >
          <motion.span
            className="absolute inset-0 rounded-full bg-accent"
            animate={{ scale: [1, 1.35], opacity: [0.45, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
          />
          <Play size={30} fill="currentColor" className="relative ml-1" />
        </motion.button>
      </div>

      <div className="mt-4 flex h-11 items-center gap-2 rounded-2xl bg-white/55 px-3" data-testid="selected-menu">
        <Dumbbell size={16} className="shrink-0 text-mute" />
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={exercise?.id ?? "none"}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            className="min-w-0 flex-1 truncate text-sm font-semibold"
          >
            {exercise ? (
              <>
                <span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: exercise.color }} />
                {exercise.name}
                <span className="ml-2 text-mute">
                  {formatWeight(exercise.weight)} × {exercise.reps}
                </span>
              </>
            ) : (
              <span className="text-mute">メニュー未選択</span>
            )}
          </motion.span>
        </AnimatePresence>
        {exercise && (
          <button type="button" aria-label="選択解除" onClick={() => selectExercise(null)} className="text-mute">
            <X size={16} />
          </button>
        )}
      </div>
    </section>
  );
}

function Big({ value, label, color }: { value: string | number; label: string; color: string }) {
  return (
    <div className="flex flex-col">
      <span className={`font-display text-[52px] leading-[0.9] font-extrabold italic ${color}`}>{value}</span>
      <span className="text-[10px] font-bold tracking-[0.16em] text-mute">{label}</span>
    </div>
  );
}

import { AnimatePresence, motion, useDragControls } from "motion/react";
import { Minus, Plus, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { haptic } from "../lib/feedback";
import { useStore } from "../lib/store";
import { category, displayWeight, fromUnit, type CategoryId } from "../lib/catalog";
import { unitLabel } from "../lib/stats";
import type { SetEntry } from "../lib/types";
import type { CardioForm } from "../lib/record";

export const spring = { type: "spring", stiffness: 420, damping: 32 } as const;

export function Sheet({
  open,
  onClose,
  title,
  children,
  testId,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  const controls = useDragControls();
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="scrim"
            className="fixed inset-0 z-40 bg-slate-900/25 backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            data-testid="sheet-scrim"
          />
          <motion.div
            key="sheet"
            role="dialog"
            aria-modal="true"
            data-testid={testId}
            className="glass-strong fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[88dvh] max-w-md flex-col rounded-t-[32px] pb-[max(env(safe-area-inset-bottom),16px)]"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
            drag="y"
            dragControls={controls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.7 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 110 || info.velocity.y > 600) onClose();
            }}
          >
            <div
              className="flex shrink-0 cursor-grab touch-none flex-col items-center px-5 pt-3 pb-2"
              onPointerDown={(e) => controls.start(e)}
            >
              <div className="h-1.5 w-10 rounded-full bg-slate-900/15" />
              <div className="mt-3 w-full text-lg font-bold">{title}</div>
            </div>
            <div className="no-scrollbar overflow-y-auto px-5 pb-2">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export function NumberInput({
  value,
  onChange,
  label,
  min = 0,
  max = 9999,
  className = "",
  testId,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
  min?: number;
  max?: number;
  className?: string;
  testId?: string;
}) {
  const [text, setText] = useState(String(value));
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setText(String(value));
  }, [value]);
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v * 100) / 100));
  return (
    <input
      type="text"
      inputMode="decimal"
      enterKeyHint="done"
      aria-label={label}
      data-testid={testId}
      value={text}
      onFocus={(e) => {
        editing.current = true;
        e.target.select();
      }}
      onChange={(e) => {
        const t = e.target.value.replace(/[^0-9.]/g, "");
        setText(t);
        const v = Number(t);
        if (t !== "" && !Number.isNaN(v)) onChange(clamp(v));
      }}
      onBlur={() => {
        editing.current = false;
        setText(String(value));
      }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className={`bg-transparent text-center font-display font-bold italic outline-none ${className}`}
    />
  );
}

export function Stepper({
  label,
  value,
  onChange,
  step = 1,
  min = 0,
  max = 999,
  unit,
  testId,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  testId?: string;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v * 100) / 100));
  const bump = (d: number) => {
    haptic(8);
    onChange(clamp(value + d));
  };
  return (
    <div className="glass flex items-center justify-between rounded-2xl px-2 py-1.5" data-testid={testId}>
      <motion.button
        type="button"
        whileTap={{ scale: 0.85 }}
        className="grid size-10 place-items-center rounded-xl bg-white/80 shadow-sm"
        aria-label={`${label}を減らす`}
        onClick={() => bump(-step)}
      >
        <Minus size={18} strokeWidth={2.6} />
      </motion.button>
      <label className="flex flex-col items-center">
        <span className="text-[10px] font-semibold tracking-wider text-mute">{label}</span>
        <span className="flex items-baseline gap-0.5">
          <NumberInput
            label={label}
            value={value}
            min={min}
            max={max}
            onChange={onChange}
            className="w-20 rounded-lg text-3xl focus:bg-white/80"
          />
          {unit && <span className="text-xs font-semibold text-mute">{unit}</span>}
        </span>
      </label>
      <motion.button
        type="button"
        whileTap={{ scale: 0.85 }}
        className="grid size-10 place-items-center rounded-xl bg-white/80 shadow-sm"
        aria-label={`${label}を増やす`}
        onClick={() => bump(step)}
      >
        <Plus size={18} strokeWidth={2.6} />
      </motion.button>
    </div>
  );
}

export function PrimaryButton({
  children,
  onClick,
  tone = "accent",
  testId,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  tone?: "accent" | "ink" | "danger" | "ghost";
  testId?: string;
  disabled?: boolean;
}) {
  const tones = {
    accent: "bg-accent text-white shadow-[0_10px_30px_-8px_rgb(255_79_0/0.7)]",
    ink: "bg-ink text-white shadow-[0_10px_30px_-10px_rgb(11_12_15/0.6)]",
    danger: "bg-danger/10 text-danger",
    ghost: "glass text-ink",
  };
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.96 }}
      transition={spring}
      disabled={disabled}
      data-testid={testId}
      onClick={() => {
        haptic(10);
        onClick();
      }}
      className={`flex h-13 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-bold disabled:opacity-40 ${tones[tone]}`}
    >
      {children}
    </motion.button>
  );
}

type SetForm = { weight: number; reps: number; sets: number };

export function WeightStepper({ value, onChange }: { value: number; onChange: (kg: number) => void }) {
  const unit = useStore((s) => s.unit);
  return (
    <Stepper
      label="重量"
      unit={unitLabel(unit)}
      step={unit === "kg" ? 2.5 : 5}
      max={unit === "kg" ? 500 : 1100}
      value={displayWeight(value, unit)}
      onChange={(v) => onChange(fromUnit(v, unit))}
      testId="weight"
    />
  );
}

/** Work minutes, rest minutes (0 = no rest) and rounds; these drive the interval timer. */
export function CardioFields({ value, onChange }: { value: CardioForm; onChange: (v: CardioForm) => void }) {
  return (
    <div className="space-y-3" data-testid="cardio-fields">
      <div className="grid grid-cols-2 gap-3">
        <Stepper label="運動" unit="分" min={1} max={600} value={value.reps} onChange={(reps) => onChange({ ...value, reps })} testId="minutes" />
        <Stepper label="休憩" unit="分" min={0} max={120} value={value.rest} onChange={(rest) => onChange({ ...value, rest })} testId="rest-minutes" />
      </div>
      <Stepper label="セット" min={1} max={50} value={value.sets} onChange={(sets) => onChange({ ...value, sets })} testId="cardio-sets" />
    </div>
  );
}

/** Menu defaults: weight / reps / sets, or the cardio timer settings. */
export function SetFields({ category, form, onChange }: { category: CategoryId; form: SetForm & { rest?: number }; onChange: (f: SetForm & { rest?: number }) => void }) {
  if (category === "cardio") {
    return (
      <CardioFields
        value={{ reps: form.reps, rest: form.rest ?? 0, sets: form.sets }}
        onChange={(v) => onChange({ weight: 0, ...v })}
      />
    );
  }
  return (
    <>
      <WeightStepper value={form.weight} onChange={(weight) => onChange({ ...form, weight })} />
      <div className="grid grid-cols-2 gap-3">
        <Stepper label="回数" min={1} value={form.reps} onChange={(reps) => onChange({ ...form, reps })} />
        <Stepper label="セット" min={1} max={99} value={form.sets} onChange={(sets) => onChange({ ...form, sets })} />
      </div>
    </>
  );
}

/** One row per set, each with its own weight and reps. */
export function SetRows({ sets, onChange }: { sets: SetEntry[]; onChange: (s: SetEntry[]) => void }) {
  const unit = useStore((s) => s.unit);
  const update = (i: number, patch: Partial<SetEntry>) => onChange(sets.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <div className="space-y-2" data-testid="set-rows">
      <AnimatePresence initial={false}>
        {sets.map((set, i) => (
          <motion.div
            key={i}
            layout
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={spring}
            data-testid="set-row"
          >
            <div className="glass flex items-center gap-2 rounded-2xl py-1.5 pr-1.5 pl-3">
              <span className="w-10 shrink-0 font-display text-sm font-bold text-mute">SET {i + 1}</span>
              <label className="flex flex-1 items-baseline justify-center gap-1 rounded-xl bg-white/70 py-1">
                <NumberInput
                  label={`${i + 1}セット目の重量`}
                  value={displayWeight(set.weight, unit)}
                  max={unit === "kg" ? 500 : 1100}
                  onChange={(v) => update(i, { weight: fromUnit(v, unit) })}
                  className="w-16 text-2xl"
                />
                <span className="text-xs font-semibold text-mute">{unitLabel(unit)}</span>
              </label>
              <span className="text-mute">×</span>
              <label className="flex w-24 items-baseline justify-center gap-1 rounded-xl bg-white/70 py-1">
                <NumberInput
                  label={`${i + 1}セット目の回数`}
                  value={set.reps}
                  min={0}
                  max={999}
                  onChange={(reps) => update(i, { reps })}
                  className="w-12 text-2xl"
                />
                <span className="text-xs font-semibold text-mute">回</span>
              </label>
              <motion.button
                type="button"
                whileTap={{ scale: 0.85 }}
                disabled={sets.length <= 1}
                aria-label={`${i + 1}セット目を削除`}
                onClick={() => {
                  haptic(8);
                  onChange(sets.filter((_, j) => j !== i));
                }}
                className="grid size-9 shrink-0 place-items-center rounded-full text-mute disabled:opacity-20"
              >
                <X size={16} />
              </motion.button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
      <motion.button
        type="button"
        whileTap={{ scale: 0.97 }}
        data-testid="set-add"
        onClick={() => {
          haptic(8);
          onChange([...sets, { ...sets[sets.length - 1] }]);
        }}
        className="flex h-11 w-full items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-slate-900/15 text-sm font-bold text-mute"
      >
        <Plus size={16} /> セットを追加
      </motion.button>
    </div>
  );
}

export function CategoryBadge({ id, size = "sm" }: { id: CategoryId; size?: "sm" | "xs" }) {
  const c = category(id);
  return (
    <span
      data-testid="category-badge"
      className={`inline-flex shrink-0 items-center gap-1 rounded-full font-bold ${size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-1.5 text-[10px]"}`}
      style={{ background: `${c.color}22`, color: c.id === "abs" ? "#9a7a00" : c.color }}
    >
      <span className="size-1.5 rounded-full" style={{ background: c.color }} />
      {c.label}
    </span>
  );
}

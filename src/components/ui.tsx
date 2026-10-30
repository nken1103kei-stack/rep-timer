import { AnimatePresence, motion, useDragControls } from "motion/react";
import { Minus, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { haptic } from "../lib/feedback";

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
          <input
            type="number"
            inputMode="decimal"
            aria-label={label}
            className="w-16 bg-transparent text-center font-display text-3xl font-bold italic outline-none"
            value={value}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!Number.isNaN(v)) onChange(clamp(v));
            }}
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

export const formatWeight = (w: number) => (w === 0 ? "自重" : `${w}kg`);

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];
export const formatDate = (ms: number) => {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()} (${WEEK[d.getDay()]})`;
};

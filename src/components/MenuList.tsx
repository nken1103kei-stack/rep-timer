import {
  animate,
  AnimatePresence,
  motion,
  Reorder,
  useDragControls,
  useMotionValue,
  useTransform,
} from "motion/react";
import { useMemo, useRef } from "react";
import {
  Check,
  GripVertical,
  NotebookPen,
  Plus,
  Share2,
  Trash2,
} from "lucide-react";
import { lastLogFor, useStore } from "../lib/store";
import type { Exercise } from "../lib/types";
import { haptic } from "../lib/feedback";
import { CategoryBadge, spring } from "./ui";
import { category } from "../lib/catalog";
import {
  dayKey,
  dayShareText,
  formatDate,
  formatSet,
  resolveLog,
  shareText,
} from "../lib/stats";

const SWIPE = 96;

export function MenuList({
  onAdd,
  onLog,
  onDelete,
  onShared,
}: {
  onAdd: () => void;
  onLog: (id: string) => void;
  onDelete: (id: string) => void;
  onShared: (result: string) => void;
}) {
  const exercises = useStore((s) => s.exercises);
  const reorder = useStore((s) => s.reorderExercises);
  const logs = useStore((s) => s.logs);
  const unit = useStore((s) => s.unit);
  // Today's records, newest first like the calendar.
  const todayLogs = useMemo(() => {
    const today = dayKey(Date.now());
    return logs
      .filter((l) => dayKey(l.at) === today)
      .map((l) => resolveLog(l, exercises));
  }, [logs, exercises]);

  return (
    <section className="mt-7 pb-28">
      <div className="flex items-center justify-between">
        <h2 className="flex items-baseline gap-2 text-lg font-extrabold">
          メニュー
          <motion.span
            key={exercises.length}
            initial={{ scale: 1.6 }}
            animate={{ scale: 1 }}
            className="text-sm text-mute"
          >
            {exercises.length}
          </motion.span>
        </h2>
        <div className="flex items-center gap-2">
          <motion.button
            type="button"
            whileTap={{ scale: 0.92 }}
            aria-label="今日のトレーニングを共有"
            data-testid="share-today"
            disabled={todayLogs.length === 0}
            onClick={async () => {
              haptic(10);
              onShared(
                await shareText(dayShareText(Date.now(), todayLogs, unit)),
              );
            }}
            className="glass flex h-10 items-center gap-1.5 rounded-full px-3.5 text-sm font-bold text-ink transition-opacity disabled:opacity-35"
          >
            <Share2 size={16} strokeWidth={2.4} />
            今日
            <AnimatePresence mode="popLayout" initial={false}>
              {todayLogs.length > 0 && (
                <motion.span
                  key={todayLogs.length}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  transition={spring}
                  data-testid="today-count"
                  className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 font-display text-xs text-white"
                >
                  {todayLogs.length}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
          <motion.button
            type="button"
            whileTap={{ scale: 0.88, rotate: 90 }}
            aria-label="メニューを追加"
            data-testid="menu-add"
            onClick={onAdd}
            className="grid size-10 place-items-center rounded-full bg-ink text-white shadow-[0_8px_20px_-8px_rgb(11_12_15/0.7)]"
          >
            <Plus size={20} strokeWidth={2.6} />
          </motion.button>
        </div>
      </div>

      <Reorder.Group
        axis="y"
        values={exercises}
        onReorder={reorder}
        className="mt-3 space-y-2.5"
        data-testid="menu-list"
      >
        <AnimatePresence initial={false}>
          {exercises.map((ex, i) => (
            <MenuRow
              key={ex.id}
              ex={ex}
              index={i}
              onLog={() => onLog(ex.id)}
              onDelete={() => onDelete(ex.id)}
            />
          ))}
        </AnimatePresence>
      </Reorder.Group>

      {exercises.length === 0 && (
        <motion.button
          type="button"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={onAdd}
          className="mt-3 flex h-[76px] w-full items-center justify-center gap-2 rounded-[22px] border-2 border-dashed border-slate-900/15 text-sm font-bold text-mute"
        >
          <Plus size={18} /> メニューを追加
        </motion.button>
      )}
    </section>
  );
}

function MenuRow({
  ex,
  index,
  onLog,
  onDelete,
}: {
  ex: Exercise;
  index: number;
  onLog: () => void;
  onDelete: () => void;
}) {
  const controls = useDragControls();
  const x = useMotionValue(0);
  // A flick is not a tap: the drag that opens the log must not also select the menu.
  const dragged = useRef(false);
  const logOpacity = useTransform(x, [12, SWIPE], [0, 1]);
  const logScale = useTransform(x, [12, SWIPE], [0.6, 1.1]);
  const delOpacity = useTransform(x, [-SWIPE, -12], [1, 0]);
  const delScale = useTransform(x, [-SWIPE, -12], [1.1, 0.6]);
  const selected = useStore((s) => s.selectedExerciseId === ex.id);
  const selectExercise = useStore((s) => s.selectExercise);
  const last = useStore((s) => lastLogFor(s.logs, ex.id));
  const unit = useStore((s) => s.unit);
  const color = category(ex.category).color;

  return (
    <Reorder.Item
      value={ex}
      dragListener={false}
      dragControls={controls}
      data-testid="menu-item"
      data-name={ex.name}
      data-cat={ex.category}
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{
        opacity: 1,
        y: 0,
        scale: 1,
        transition: { ...spring, delay: Math.min(index, 8) * 0.04 },
      }}
      exit={{
        opacity: 0,
        height: 0,
        marginTop: 0,
        transition: { duration: 0.22 },
      }}
      whileDrag={{
        scale: 1.03,
        zIndex: 10,
        boxShadow: "0 24px 48px -16px rgb(15 23 42 / 0.35)",
      }}
      className="relative list-none rounded-[22px]"
    >
      <div className="absolute inset-0 flex items-center justify-between overflow-hidden rounded-[22px] px-5">
        <motion.div
          style={{ opacity: logOpacity, scale: logScale }}
          className="flex items-center gap-1.5 font-bold text-go"
        >
          <NotebookPen size={20} /> 記録
        </motion.div>
        <motion.div
          style={{ opacity: delOpacity, scale: delScale }}
          className="flex items-center gap-1.5 font-bold text-danger"
        >
          削除 <Trash2 size={20} />
        </motion.div>
      </div>

      <motion.div
        data-testid="menu-card"
        aria-pressed={selected}
        role="button"
        tabIndex={0}
        style={{ x, touchAction: "pan-y" }}
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.85}
        dragSnapToOrigin={false}
        onPointerDown={() => (dragged.current = false)}
        onDragStart={() => (dragged.current = true)}
        onDragEnd={(_, info) => {
          if (info.offset.x < -SWIPE || info.velocity.x < -800) {
            haptic([10, 40, 10]);
            void animate(x, -480, { duration: 0.22 }).then(onDelete);
          } else if (info.offset.x > SWIPE || info.velocity.x > 800) {
            haptic(14);
            void animate(x, 0, spring);
            onLog();
          } else {
            void animate(x, 0, spring);
          }
        }}
        onTap={() => {
          if (dragged.current) return;
          haptic(8);
          selectExercise(selected ? null : ex.id);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ")
            selectExercise(selected ? null : ex.id);
        }}
        whileTap={{ scale: 0.98 }}
        className={`glass sheen flex h-[76px] items-center gap-3 rounded-[22px] pr-1 pl-4 transition-[outline-color] ${
          selected
            ? "outline-2 outline-accent"
            : "outline-2 outline-transparent"
        }`}
      >
        <motion.span
          className="w-1.5 rounded-full"
          style={{ background: color }}
          animate={{ height: selected ? 44 : 32 }}
          transition={spring}
        />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[15px] font-bold">{ex.name}</span>
            <CategoryBadge id={ex.category} size="xs" />
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs font-medium text-mute">
            <span className="font-display text-sm font-semibold text-ink/80">
              {formatSet(ex, unit)}
            </span>
            {last && <span>· {formatDate(last.at)}</span>}
          </div>
        </div>
        <AnimatePresence>
          {selected && (
            <motion.span
              initial={{ scale: 0, rotate: -90 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0 }}
              transition={spring}
              className="grid size-6 place-items-center rounded-full bg-accent text-white"
            >
              <Check size={14} strokeWidth={3.5} />
            </motion.span>
          )}
        </AnimatePresence>
        <button
          type="button"
          aria-label="並べ替え"
          data-testid="menu-grip"
          className="grid h-full w-10 cursor-grab touch-none place-items-center text-slate-400 active:cursor-grabbing"
          onPointerDown={(e) => {
            e.stopPropagation();
            haptic(6);
            controls.start(e);
          }}
        >
          <GripVertical size={18} />
        </button>
      </motion.div>
    </Reorder.Item>
  );
}

import { useMemo, useState } from "react";
import { AdSlot, ProBadge, ProLock } from "./Pro";
import { BodyHeatmap } from "./Charts";
import { setsByCategory } from "../lib/analytics";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight, Share2, X } from "lucide-react";
import { useStore } from "../lib/store";
import { category } from "../lib/catalog";
import {
  dayKey,
  dayShareText,
  formatDate,
  formatSet,
  formatVolume,
  groupByDay,
  inMonth,
  monthShareText,
  resolveLog,
  shareText,
  summarize,
} from "../lib/stats";
import { haptic } from "../lib/feedback";
import { CategoryBadge, spring } from "./ui";

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

export function CalendarView({ onClose, onShared }: { onClose: () => void; onShared: (result: string) => void }) {
  const rawLogs = useStore((s) => s.logs);
  const exercises = useStore((s) => s.exercises);
  const unit = useStore((s) => s.unit);
  const today = new Date();
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [dir, setDir] = useState(1);
  const [selected, setSelected] = useState(dayKey(today.getTime()));

  const logs = useMemo(() => rawLogs.map((l) => resolveLog(l, exercises)), [rawLogs, exercises]);
  const byDay = useMemo(() => groupByDay(logs), [logs]);
  const monthLogs = inMonth(logs, cursor.y, cursor.m);
  const summary = summarize(monthLogs);
  const dayLogs = byDay.get(selected) ?? [];

  const first = new Date(cursor.y, cursor.m, 1);
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells = [...Array(first.getDay()).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const shift = (d: number) => {
    haptic(8);
    setDir(d);
    setCursor(({ y, m }) => {
      const next = new Date(y, m + d, 1);
      return { y: next.getFullYear(), m: next.getMonth() };
    });
  };

  const share = async (text: string) => {
    haptic(10);
    onShared(await shareText(text));
  };

  const selectedMs = new Date(`${selected}T12:00:00`).getTime();
  const isToday = selected === dayKey(today.getTime());

  return (
    <motion.div
      data-testid="calendar"
      className="fixed inset-0 z-[55] overflow-y-auto bg-[#f3f4f7]"
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", stiffness: 340, damping: 36 }}
    >
      <div aria-hidden className="blob -top-24 -left-24 size-72 bg-rest/20" />
      <div className="relative mx-auto max-w-md px-4 pt-[env(safe-area-inset-top)] pb-[max(env(safe-area-inset-bottom),24px)]">
        <header className="flex h-16 items-center justify-between">
          <motion.button type="button" whileTap={{ scale: 0.85 }} onClick={() => shift(-1)} aria-label="前の月" data-testid="cal-prev" className="glass grid size-10 place-items-center rounded-full">
            <ChevronLeft size={20} />
          </motion.button>
          <AnimatePresence mode="popLayout" initial={false} custom={dir}>
            <motion.div
              key={`${cursor.y}-${cursor.m}`}
              custom={dir}
              initial={{ y: dir * 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: dir * -16, opacity: 0 }}
              className="font-display text-2xl font-extrabold italic"
              data-testid="cal-month"
            >
              {cursor.y}.{String(cursor.m + 1).padStart(2, "0")}
            </motion.div>
          </AnimatePresence>
          <div className="flex gap-2">
            <motion.button type="button" whileTap={{ scale: 0.85 }} onClick={() => shift(1)} aria-label="次の月" data-testid="cal-next" className="glass grid size-10 place-items-center rounded-full">
              <ChevronRight size={20} />
            </motion.button>
            <motion.button type="button" whileTap={{ scale: 0.85 }} onClick={onClose} aria-label="閉じる" data-testid="cal-close" className="grid size-10 place-items-center rounded-full bg-ink text-white">
              <X size={18} />
            </motion.button>
          </div>
        </header>

        <section className="glass sheen rounded-[28px] p-4" data-testid="month-summary">
          <div className="flex items-start justify-between">
            <div className="grid flex-1 grid-cols-4 gap-1">
              <SummaryStat label="DAYS" value={summary.days} testId="sum-days" />
              <SummaryStat label="SETS" value={summary.sets} testId="sum-sets" />
              <SummaryStat label="VOLUME" value={summary.volumeKg ? formatVolume(summary.volumeKg, unit) : "0"} testId="sum-volume" />
              <SummaryStat label="CARDIO" value={`${summary.cardioMin}分`} testId="sum-cardio" />
            </div>
            <motion.button
              type="button"
              whileTap={{ scale: 0.85 }}
              aria-label="月間サマリーを共有"
              data-testid="share-month"
              onClick={() => share(monthShareText(cursor.y, cursor.m, summary, unit))}
              className="grid size-10 shrink-0 place-items-center rounded-full bg-ink text-white"
            >
              <Share2 size={17} />
            </motion.button>
          </div>
          <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-slate-900/6">
            {summary.byCategory.map((c) => (
              <motion.div
                key={c.id}
                initial={{ width: 0 }}
                animate={{ width: `${(c.count / summary.entries) * 100}%` }}
                transition={spring}
                style={{ background: c.color }}
              />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5" data-testid="sum-categories">
            {summary.byCategory.map((c) => (
              <span key={c.id} className="flex items-center gap-1 rounded-full bg-white/70 px-2 py-0.5 text-xs font-bold">
                <span className="size-2 rounded-full" style={{ background: c.color }} />
                {c.label}
                <span className="text-mute">{c.count}</span>
              </span>
            ))}
          </div>
        </section>

        <section className="glass mt-4 rounded-[28px] p-4" data-testid="heatmap-section">
          <div className="mb-2 flex items-center gap-2 text-sm font-extrabold">
            部位ヒートマップ <span className="text-xs font-bold text-mute">セット数</span> <ProBadge />
          </div>
          <ProLock label="部位ヒートマップは Pro で使えます" testId="heatmap-lock">
            <BodyHeatmap counts={setsByCategory(monthLogs)} />
          </ProLock>
        </section>

        <AdSlot className="mt-4" />

        <section className="glass mt-4 overflow-hidden rounded-[28px] p-3">
          <div className="grid grid-cols-7 text-center text-[11px] font-bold text-mute">
            {WEEK.map((w, i) => (
              <div key={w} className={i === 0 ? "text-danger" : i === 6 ? "text-rest" : ""}>
                {w}
              </div>
            ))}
          </div>
          <AnimatePresence mode="popLayout" initial={false} custom={dir}>
            <motion.div
              key={`${cursor.y}-${cursor.m}`}
              custom={dir}
              initial={{ x: dir * 80, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: dir * -80, opacity: 0 }}
              transition={{ duration: 0.25 }}
              drag="x"
              dragDirectionLock
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.3}
              style={{ touchAction: "pan-y" }}
              onDragEnd={(_, info) => {
                if (info.offset.x < -60) shift(1);
                else if (info.offset.x > 60) shift(-1);
              }}
              className="mt-2 grid grid-cols-7 gap-y-1"
              data-testid="cal-grid"
            >
              {cells.map((d, i) => {
                if (d === null) return <div key={`e${i}`} />;
                const key = `${cursor.y}-${String(cursor.m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                const entries = byDay.get(key) ?? [];
                const cats = [...new Set(entries.map((e) => e.category))].slice(0, 4);
                const active = key === selected;
                const todayCell = key === dayKey(today.getTime());
                return (
                  <motion.button
                    key={key}
                    type="button"
                    whileTap={{ scale: 0.88 }}
                    onClick={() => {
                      haptic(6);
                      setSelected(key);
                    }}
                    data-testid="cal-day"
                    data-date={key}
                    data-count={entries.length}
                    aria-pressed={active}
                    className="relative flex aspect-square flex-col items-center justify-center rounded-2xl"
                  >
                    {active && <motion.span layoutId="cal-sel" transition={spring} className="absolute inset-1 rounded-xl bg-ink" />}
                    <span
                      className={`relative font-display text-lg leading-none font-bold ${active ? "text-white" : todayCell ? "text-accent" : ""}`}
                    >
                      {d}
                    </span>
                    <span className="relative mt-1 flex h-1.5 gap-0.5">
                      {cats.map((c) => (
                        <span key={c} className="size-1.5 rounded-full" style={{ background: category(c).color }} />
                      ))}
                    </span>
                  </motion.button>
                );
              })}
            </motion.div>
          </AnimatePresence>
        </section>

        <section className="mt-5" data-testid="day-detail">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-extrabold">{isToday ? `今日 ${formatDate(selectedMs)}` : formatDate(selectedMs)}</h2>
            <motion.button
              type="button"
              whileTap={{ scale: 0.88 }}
              disabled={dayLogs.length === 0}
              onClick={() => share(dayShareText(selectedMs, dayLogs, unit))}
              data-testid="share-day"
              className="flex h-10 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-bold text-white shadow-[0_8px_20px_-8px_rgb(255_79_0/0.7)] disabled:opacity-30"
            >
              <Share2 size={15} /> 共有
            </motion.button>
          </div>
          <ul className="mt-3 space-y-2">
            <AnimatePresence mode="popLayout" initial={false}>
              {dayLogs.map((l, i) => (
                <motion.li
                  key={l.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0, transition: { delay: i * 0.04 } }}
                  exit={{ opacity: 0 }}
                  data-testid="day-entry"
                  className="glass flex items-center gap-3 rounded-2xl px-4 py-3"
                >
                  <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: category(l.category).color }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-bold">{l.name}</span>
                      <CategoryBadge id={l.category} size="xs" />
                    </div>
                    <div className="font-display text-sm font-semibold text-mute">{formatSet(l, unit)}</div>
                  </div>
                  <span className="text-xs font-semibold text-mute">
                    {new Date(l.at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </motion.li>
              ))}
            </AnimatePresence>
            {dayLogs.length === 0 && <li className="py-8 text-center text-sm font-semibold text-mute">記録なし</li>}
          </ul>
        </section>
      </div>
    </motion.div>
  );
}

function SummaryStat({ label, value, testId }: { label: string; value: string | number; testId: string }) {
  return (
    <div className="min-w-0">
      <motion.div
        key={String(value)}
        initial={{ y: 8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="truncate font-display text-2xl leading-tight font-extrabold italic"
        data-testid={testId}
      >
        {value}
      </motion.div>
      <div className="text-[9px] font-bold tracking-[0.14em] text-mute">{label}</div>
    </div>
  );
}

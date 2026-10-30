import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Copy, Undo2 } from "lucide-react";
import { useStore } from "./lib/store";
import { bootstrap, refreshPlan, useSession } from "./lib/sync";
import { unlockAudio } from "./lib/feedback";
import { cardioTimer } from "./lib/record";
import type { Exercise, Preset } from "./lib/types";
import { Skeleton } from "./components/Skeleton";
import { Header } from "./components/Header";
import { TimerPanel } from "./components/TimerPanel";
import { MenuList } from "./components/MenuList";
import { QuoteCard } from "./components/QuoteCard";
import { AccountSheet, LogSheet, MenuEditor, PresetEditor } from "./components/Sheets";
import { TimerOverlay } from "./components/TimerOverlay";
import { LibrarySheet } from "./components/LibrarySheet";
import { CalendarView } from "./components/CalendarView";
import { PrimaryButton, Sheet, spring } from "./components/ui";
import { copyText, type ShareResult } from "./lib/stats";
import { openProSheet, ProSheet } from "./components/Pro";

type SheetState =
  | { type: "library" }
  | { type: "menu"; id: string | null }
  | { type: "log"; id: string }
  | { type: "preset"; id: string | null }
  | { type: "account" }
  | null;

type Toast = { id: number; text: string; undo?: () => void; expire?: () => void };

const MIN_SKELETON_MS = 500;

export default function App() {
  const ready = useSession((s) => s.ready);
  const [minElapsed, setMinElapsed] = useState(false);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [run, setRun] = useState<{ preset: Preset; exercise: Exercise | null } | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    // Back from Stripe Checkout / the customer portal.
    const back = new URLSearchParams(location.search).get("pro");
    if (back) history.replaceState(null, "", location.pathname);
    void bootstrap().then(async () => {
      if (back === "success" || back === "portal") await refreshPlan();
      if (back === "success" && useSession.getState().plan.pro) showToast({ text: "Pro になりました。ありがとうございます！" });
    });
    const t = setTimeout(() => setMinElapsed(true), MIN_SKELETON_MS);
    return () => clearTimeout(t);
  }, []);

  // Text to copy by hand when neither the share sheet nor the clipboard worked.
  const [manualShare, setManualShare] = useState<string | null>(null);

  const onShared = (r: ShareResult | "empty", text = "") => {
    if (r === "copied") showToast({ text: "クリップボードにコピーしました。LINE や SNS に貼り付けて共有できます" });
    else if (r === "failed") setManualShare(text);
    else if (r === "empty") showToast({ text: "今日の記録はまだありません。メニューをタップして記録すると共有できます" });
  };

  const showToast = (t: Omit<Toast, "id">) => {
    clearTimeout(toastTimer.current);
    toast?.expire?.();
    const next = { ...t, id: Date.now() };
    setToast(next);
    toastTimer.current = setTimeout(() => {
      next.expire?.();
      setToast(null);
    }, next.undo ? 4000 : 2200);
  };

  const deleteExercise = (id: string) => {
    const removed = useStore.getState().removeExercise(id);
    if (!removed) return;
    showToast({
      text: `${removed.exercise.name}を削除`,
      undo: () => useStore.getState().restoreExercise(removed.exercise, removed.index),
      expire: () => useStore.getState().purgeLogs(removed.exercise.id),
    });
  };

  const start = () => {
    unlockAudio();
    const s = useStore.getState();
    const exercise = s.exercises.find((e) => e.id === s.selectedExerciseId) ?? null;
    // A selected cardio menu drives the timer with its own work/rest/sets.
    const preset =
      exercise?.category === "cardio" ? cardioTimer(exercise) : (s.presets.find((p) => p.id === s.selectedPresetId) ?? s.presets[0]);
    // Superset and tempo timers stay saved after a plan ends, but running them needs Pro.
    if ("kind" in preset && preset.kind && preset.kind !== "interval" && !useSession.getState().plan.pro) return openProSheet();
    setRun({ preset, exercise });
  };

  const close = () => setSheet(null);

  return (
    <>
      <div aria-hidden className="blob -top-24 -right-24 size-80 bg-accent/25" />
      <div aria-hidden className="blob top-1/3 -left-32 size-80 bg-rest/20 [animation-delay:-6s]" />
      <div aria-hidden className="blob -bottom-24 right-0 size-72 bg-[#c6ff3d]/35 [animation-delay:-12s]" />

      <AnimatePresence mode="wait">
        {!(ready && minElapsed) ? (
          <Skeleton key="skeleton" />
        ) : (
          <motion.main
            key="app"
            className="relative mx-auto min-h-dvh max-w-md px-4"
            initial="hidden"
            animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07 } } }}
          >
            {[
              <Header key="h" onAccount={() => setSheet({ type: "account" })} onCalendar={() => setCalendarOpen(true)} onPro={openProSheet} />,
              <QuoteCard key="q" />,
              <TimerPanel key="t" onStart={start} onEditPreset={(id) => setSheet({ type: "preset", id: id ?? null })} />,
              <MenuList
                key="m"
                onAdd={() => setSheet({ type: "library" })}
                onLog={(id) => setSheet({ type: "log", id })}
                onDelete={deleteExercise}
                onShared={onShared}
              />,
            ].map((child) => (
              <motion.div
                key={child.key}
                variants={{
                  hidden: { opacity: 0, y: 24, filter: "blur(8px)" },
                  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: spring },
                }}
              >
                {child}
              </motion.div>
            ))}
          </motion.main>
        )}
      </AnimatePresence>

      <LibrarySheet open={sheet?.type === "library"} onClose={close} />
      <MenuEditor open={sheet?.type === "menu"} id={sheet?.type === "menu" ? sheet.id : null} onClose={close} />
      <LogSheet
        id={sheet?.type === "log" ? sheet.id : null}
        onClose={close}
        onEdit={(id) => setSheet({ type: "menu", id })}
      />
      <PresetEditor open={sheet?.type === "preset"} id={sheet?.type === "preset" ? sheet.id : null} onClose={close} />
      <AccountSheet open={sheet?.type === "account"} onClose={close} />
      <ProSheet onLogin={() => setSheet({ type: "account" })} />
      <Sheet open={manualShare !== null} onClose={() => setManualShare(null)} title="共有する内容" testId="share-sheet" above>
        <div className="space-y-3 pt-1 pb-2">
          <p className="text-xs font-semibold text-mute">この端末では共有画面を開けませんでした。下の文章をコピーして、LINE や SNS に貼り付けてください。</p>
          <textarea
            readOnly
            data-testid="share-text"
            value={manualShare ?? ""}
            rows={Math.min(10, (manualShare ?? "").split(String.fromCharCode(10)).length + 1)}
            onFocus={(e) => e.target.select()}
            className="glass w-full resize-none rounded-2xl p-3 text-[15px] leading-relaxed font-semibold outline-none"
          />
          <PrimaryButton
            testId="share-copy"
            onClick={async () => {
              const ok = await copyText(manualShare ?? "");
              showToast({ text: ok ? "コピーしました" : "文章を長押しして選択し、コピーしてください" });
              if (ok) setManualShare(null);
            }}
          >
            <Copy size={18} /> コピーする
          </PrimaryButton>
        </div>
      </Sheet>

      <AnimatePresence>
        {calendarOpen && (
          <CalendarView
            key="calendar"
            onClose={() => setCalendarOpen(false)}
            onShared={onShared}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {run && <TimerOverlay key="timer" preset={run.preset} exercise={run.exercise} onClose={() => setRun(null)} />}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            role="status"
            data-testid="toast"
            initial={{ y: 80, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={spring}
            className="fixed inset-x-4 bottom-[max(env(safe-area-inset-bottom),20px)] z-[70] mx-auto flex max-w-sm items-center justify-between gap-3 rounded-2xl bg-ink/90 py-2 pr-2 pl-4 text-white shadow-2xl backdrop-blur-xl"
          >
            <span className="truncate text-sm font-semibold">{toast.text}</span>
            {toast.undo && (
            <motion.button
              type="button"
              whileTap={{ scale: 0.9 }}
              data-testid="toast-undo"
              onClick={() => {
                clearTimeout(toastTimer.current);
                toast.undo?.();
                setToast(null);
              }}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-white/15 px-3 text-sm font-bold"
            >
              <Undo2 size={15} /> 元に戻す
            </motion.button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

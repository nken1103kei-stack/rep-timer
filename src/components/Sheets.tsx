import { useEffect, useRef, useState } from "react";
import { animate, AnimatePresence, motion, useMotionValue } from "motion/react";
import { Check, LogOut, Pencil, Trash2 } from "lucide-react";
import { COLORS, useStore } from "../lib/store";
import { signInWithGoogle, signOut, useSession } from "../lib/sync";
import { buildSegments, formatDuration, totalMs } from "../lib/timer";
import type { LogEntry } from "../lib/types";
import { haptic } from "../lib/feedback";
import { formatDate, formatWeight, PrimaryButton, Sheet, spring, Stepper } from "./ui";

const inputClass =
  "glass h-13 w-full rounded-2xl px-4 text-base font-semibold outline-none placeholder:text-slate-400 focus:outline-2 focus:outline-accent";

export function MenuEditor({ open, id, onClose }: { open: boolean; id: string | null; onClose: () => void }) {
  const existing = useStore((s) => s.exercises.find((e) => e.id === id));
  const addExercise = useStore((s) => s.addExercise);
  const updateExercise = useStore((s) => s.updateExercise);
  const [form, setForm] = useState({ name: "", weight: 20, reps: 10, sets: 3, color: COLORS[0] });

  useEffect(() => {
    if (!open) return;
    const used = new Set(useStore.getState().exercises.map((e) => e.color));
    setForm(
      existing
        ? { name: existing.name, weight: existing.weight, reps: existing.reps, sets: existing.sets, color: existing.color }
        : { name: "", weight: 20, reps: 10, sets: 3, color: COLORS.find((c) => !used.has(c)) ?? COLORS[0] },
    );
  }, [open, existing]);

  const save = () => {
    const name = form.name.trim();
    if (!name) return;
    if (existing) updateExercise(existing.id, { ...form, name });
    else addExercise({ ...form, name });
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={existing ? "メニューを編集" : "メニューを追加"} testId="menu-editor">
      <div className="space-y-3 pt-1">
        <input
          autoFocus={!existing}
          className={inputClass}
          placeholder="種目名"
          aria-label="種目名"
          value={form.name}
          maxLength={40}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
        <div className="flex justify-between px-1" role="radiogroup" aria-label="カラー">
          {COLORS.map((c) => (
            <motion.button
              key={c}
              type="button"
              role="radio"
              aria-checked={form.color === c}
              aria-label={c}
              whileTap={{ scale: 0.8 }}
              onClick={() => setForm({ ...form, color: c })}
              className="grid size-10 place-items-center rounded-full"
              style={{ background: c, boxShadow: form.color === c ? `0 0 0 3px white, 0 0 0 5px ${c}` : undefined }}
            >
              {form.color === c && (
                <motion.span layoutId="color-check" transition={spring}>
                  <Check size={18} strokeWidth={3} className="text-white" />
                </motion.span>
              )}
            </motion.button>
          ))}
        </div>
        <Stepper label="重量" unit="kg" step={2.5} max={500} value={form.weight} onChange={(weight) => setForm({ ...form, weight })} />
        <div className="grid grid-cols-2 gap-3">
          <Stepper label="回数" min={1} value={form.reps} onChange={(reps) => setForm({ ...form, reps })} />
          <Stepper label="セット" min={1} max={30} value={form.sets} onChange={(sets) => setForm({ ...form, sets })} />
        </div>
        <div className="pt-2 pb-2">
          <PrimaryButton onClick={save} disabled={!form.name.trim()} testId="menu-save">
            {existing ? "保存" : "追加"}
          </PrimaryButton>
        </div>
      </div>
    </Sheet>
  );
}

export function LogSheet({ id, onClose, onEdit }: { id: string | null; onClose: () => void; onEdit: (id: string) => void }) {
  const exercise = useStore((s) => s.exercises.find((e) => e.id === id));
  const logs = useStore((s) => s.logs);
  const addLog = useStore((s) => s.addLog);
  const [form, setForm] = useState({ weight: 0, reps: 0, sets: 0 });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (exercise) setForm({ weight: exercise.weight, reps: exercise.reps, sets: exercise.sets });
    setSaved(false);
    // Only reset when a different menu is opened, not after each record.
  }, [id]);

  const history = logs.filter((l) => l.exerciseId === id);
  const best = history.reduce((m, l) => Math.max(m, l.weight), 0);
  const volume = history.reduce((sum, l) => sum + l.weight * l.reps * l.sets, 0);

  return (
    <Sheet
      open={!!exercise}
      onClose={onClose}
      testId="log-sheet"
      title={
        exercise && (
          <div className="flex items-center gap-2">
            <span className="size-3 rounded-full" style={{ background: exercise.color }} />
            <span className="flex-1 truncate">{exercise.name}</span>
            <motion.button
              type="button"
              whileTap={{ scale: 0.85 }}
              aria-label="メニューを編集"
              data-testid="log-edit"
              onClick={() => onEdit(exercise.id)}
              className="glass grid size-9 place-items-center rounded-full"
            >
              <Pencil size={15} />
            </motion.button>
          </div>
        )
      }
    >
      {exercise && (
        <div className="space-y-3 pt-1">
          <div className="grid grid-cols-3 gap-2">
            <Stat label="ベスト" value={best ? formatWeight(best) : "–"} />
            <Stat label="記録" value={`${history.length}`} />
            <Stat label="総ボリューム" value={volume ? `${Math.round(volume / 100) / 10}t` : "–"} />
          </div>
          <Stepper label="重量" unit="kg" step={2.5} max={500} value={form.weight} onChange={(weight) => setForm({ ...form, weight })} />
          <div className="grid grid-cols-2 gap-3">
            <Stepper label="回数" min={1} value={form.reps} onChange={(reps) => setForm({ ...form, reps })} />
            <Stepper label="セット" min={1} max={30} value={form.sets} onChange={(sets) => setForm({ ...form, sets })} />
          </div>
          <PrimaryButton
            testId="log-save"
            tone={saved ? "ink" : "accent"}
            onClick={() => {
              addLog({ exerciseId: exercise.id, ...form });
              setSaved(true);
              setTimeout(() => setSaved(false), 1200);
            }}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={String(saved)}
                initial={{ y: 12, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -12, opacity: 0 }}
                className="flex items-center gap-2"
              >
                {saved ? (
                  <>
                    <Check size={18} strokeWidth={3} /> 記録しました
                  </>
                ) : (
                  "記録する"
                )}
              </motion.span>
            </AnimatePresence>
          </PrimaryButton>

          <div className="pt-2">
            <div className="mb-2 text-xs font-bold tracking-wider text-mute">履歴</div>
            <ul className="space-y-2 pb-2" data-testid="log-history">
              <AnimatePresence initial={false}>
                {history.map((log) => (
                  <LogRow key={log.id} log={log} />
                ))}
              </AnimatePresence>
              {history.length === 0 && <li className="py-6 text-center text-sm text-mute">まだ記録はありません</li>}
            </ul>
          </div>
        </div>
      )}
    </Sheet>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass rounded-2xl px-3 py-2">
      <div className="text-[10px] font-bold tracking-wider text-mute">{label}</div>
      <div className="font-display text-2xl font-extrabold italic">{value}</div>
    </div>
  );
}

function LogRow({ log }: { log: LogEntry }) {
  const removeLog = useStore((s) => s.removeLog);
  const x = useMotionValue(0);
  return (
    <motion.li
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="relative"
      data-testid="log-row"
    >
      <div className="absolute inset-0 flex items-center justify-end rounded-2xl bg-danger/10 px-4 text-danger">
        <Trash2 size={18} />
      </div>
      <motion.div
        style={{ x, touchAction: "pan-y" }}
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.9, right: 0 }}
        onDragEnd={(_, info) => {
          if (info.offset.x < -80) {
            haptic([10, 30, 10]);
            void animate(x, -400, { duration: 0.2 }).then(() => removeLog(log.id));
          } else void animate(x, 0, spring);
        }}
        className="relative flex items-center justify-between rounded-2xl bg-white px-4 py-3"
      >
        <span className="text-sm font-semibold text-mute">{formatDate(log.at)}</span>
        <span className="font-display text-lg font-bold">
          {formatWeight(log.weight)} × {log.reps} × {log.sets}
        </span>
      </motion.div>
    </motion.li>
  );
}

export function PresetEditor({ open, id, onClose }: { open: boolean; id: string | null; onClose: () => void }) {
  const existing = useStore((s) => s.presets.find((p) => p.id === id));
  const canDelete = useStore((s) => s.presets.length > 1);
  const savePreset = useStore((s) => s.savePreset);
  const removePreset = useStore((s) => s.removePreset);
  const selectPreset = useStore((s) => s.selectPreset);
  const [form, setForm] = useState({ name: "", work: 30, rest: 15, rounds: 8 });

  useEffect(() => {
    if (!open) return;
    setForm(existing ? { name: existing.name, work: existing.work, rest: existing.rest, rounds: existing.rounds } : { name: "", work: 30, rest: 15, rounds: 8 });
  }, [open, existing]);

  const valid = form.work + form.rest > 0;
  const total = totalMs(buildSegments({ prepare: 0, ...form }));

  return (
    <Sheet open={open} onClose={onClose} title={existing ? "タイマーを編集" : "タイマーを追加"} testId="preset-editor">
      <div className="space-y-3 pt-1">
        <input
          className={inputClass}
          placeholder="名前"
          aria-label="タイマー名"
          value={form.name}
          maxLength={16}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <div className="grid grid-cols-2 gap-3">
          <Stepper label="WORK" unit="秒" step={5} max={3600} value={form.work} onChange={(work) => setForm({ ...form, work })} testId="preset-work" />
          <Stepper label="REST" unit="秒" step={5} max={3600} value={form.rest} onChange={(rest) => setForm({ ...form, rest })} testId="preset-rest" />
        </div>
        <Stepper label="セット数" min={1} max={99} value={form.rounds} onChange={(rounds) => setForm({ ...form, rounds })} testId="preset-rounds" />
        <div className="text-center font-display text-sm font-semibold text-mute">TOTAL {formatDuration(total)}</div>
        <PrimaryButton
          testId="preset-save"
          disabled={!valid}
          onClick={() => {
            const name = form.name.trim() || (form.work === 0 ? "REST" : `${form.work}/${form.rest}`);
            selectPreset(savePreset({ ...form, name, id: existing?.id }));
            onClose();
          }}
        >
          {existing ? "保存" : "追加"}
        </PrimaryButton>
        {existing && canDelete && (
          <div className="pb-2">
            <PrimaryButton
              tone="danger"
              testId="preset-delete"
              onClick={() => {
                removePreset(existing.id);
                onClose();
              }}
            >
              <Trash2 size={16} /> 削除
            </PrimaryButton>
          </div>
        )}
      </div>
    </Sheet>
  );
}

type GoogleId = {
  accounts: {
    id: {
      initialize: (o: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: string }) => void;
      renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
    };
  };
};

let gisPromise: Promise<GoogleId> | null = null;
function loadGis(): Promise<GoogleId> {
  gisPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => resolve((window as unknown as { google: GoogleId }).google);
    script.onerror = () => {
      gisPromise = null;
      reject(new Error("gis"));
    };
    document.head.appendChild(script);
  });
  return gisPromise;
}

export function AccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { clientId, user, status, syncedAt } = useSession();
  const buttonRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !clientId || user) return;
    setError(null);
    let cancelled = false;
    loadGis()
      .then((google) => {
        if (cancelled || !buttonRef.current) return;
        google.accounts.id.initialize({
          client_id: clientId,
          ux_mode: "popup",
          callback: ({ credential }) => {
            signInWithGoogle(credential).catch(() => setError("ログインに失敗しました"));
          },
        });
        google.accounts.id.renderButton(buttonRef.current, {
          theme: "outline",
          size: "large",
          shape: "pill",
          text: "continue_with",
          locale: "ja",
          width: 300,
        });
      })
      .catch(() => setError("Googleに接続できません"));
    return () => {
      cancelled = true;
    };
  }, [open, clientId, user]);

  const statusText = { off: "", syncing: "同期中…", synced: "同期済み", error: "同期エラー" }[status];

  return (
    <Sheet open={open} onClose={onClose} title="アカウント" testId="account-sheet">
      <div className="space-y-4 pt-2 pb-2">
        {user ? (
          <>
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass flex items-center gap-3 rounded-2xl p-3">
              {user.picture && <img src={user.picture} alt="" referrerPolicy="no-referrer" className="size-12 rounded-full" />}
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold">{user.name ?? user.email}</div>
                <div className="truncate text-sm text-mute">{user.email}</div>
              </div>
            </motion.div>
            <div className="text-center text-sm font-semibold text-mute" data-testid="sync-status">
              {statusText}
              {syncedAt && status === "synced" && ` · ${new Date(syncedAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}`}
            </div>
            <PrimaryButton tone="ghost" onClick={() => void signOut()} testId="logout">
              <LogOut size={16} /> ログアウト
            </PrimaryButton>
          </>
        ) : clientId ? (
          <div className="flex min-h-14 flex-col items-center gap-3">
            <div ref={buttonRef} data-testid="google-button" />
            {error && <div className="text-sm font-semibold text-danger">{error}</div>}
          </div>
        ) : (
          <div className="py-4 text-center text-sm font-semibold text-mute" data-testid="auth-unavailable">
            ログインは現在利用できません
          </div>
        )}
      </div>
    </Sheet>
  );
}

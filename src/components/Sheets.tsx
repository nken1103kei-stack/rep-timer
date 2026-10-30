import { useEffect, useRef, useState } from "react";
import { animate, AnimatePresence, motion, useMotionValue } from "motion/react";
import { Check, Crown, Download, Lock, LogOut, Pencil, Trash2, Upload } from "lucide-react";
import { DEFAULT_REST, uid, useStore } from "../lib/store";
import { exportCsv, importCsv } from "../lib/csv";
import { CATEGORIES, DEFAULT_TEMPLATE, type CategoryId } from "../lib/catalog";
import { cardioMinutes, formatDate, formatSet, formatVolume, formatWeight, setsOf, volumeOf } from "../lib/stats";
import { initialRecord, SET_TYPE, toLog, type RecordForm } from "../lib/record";
import { signInWithGoogle, signOut, usePro, useSession } from "../lib/sync";
import { buildSegments, formatDuration, formatTempo, totalMs, tutOf, type Tempo, type TimerKind } from "../lib/timer";
import type { Exercise, LogEntry, Preset } from "../lib/types";
import { haptic } from "../lib/feedback";
import { CardioFields, CategoryBadge, NumberInput, PrimaryButton, SetFields, SetRows, Sheet, spring, Stepper } from "./ui";
import { openProSheet, ProBadge, ProLock, useProGate } from "./Pro";
import { RestBanner, type RestRun } from "./RestTimer";
import { E1rmChart } from "./Charts";
import { e1rmSeries } from "../lib/analytics";

const inputClass =
  "glass h-13 w-full rounded-2xl px-4 text-base font-semibold outline-none placeholder:text-slate-400 focus:outline-2 focus:outline-accent";

export function MenuEditor({ open, id, onClose }: { open: boolean; id: string | null; onClose: () => void }) {
  const existing = useStore((s) => s.exercises.find((e) => e.id === id));
  const addExercise = useStore((s) => s.addExercise);
  const updateExercise = useStore((s) => s.updateExercise);
  const [form, setForm] = useState<Omit<Exercise, "id">>({ ...DEFAULT_TEMPLATE("other"), category: "other" });

  useEffect(() => {
    if (!open) return;
    setForm(existing ? { ...existing } : { ...DEFAULT_TEMPLATE("other"), category: "other" });
  }, [open, existing]);

  const setCategory = (next: CategoryId) => {
    // Switching into or out of cardio swaps between minutes and weight/reps/sets.
    const crossing = (next === "cardio") !== (form.category === "cardio");
    setForm({ ...form, ...(crossing ? { ...DEFAULT_TEMPLATE(next), detail: undefined } : {}), name: form.name, category: next });
  };

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
        <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="部位">
          {CATEGORIES.map((c) => {
            const active = form.category === c.id;
            return (
              <motion.button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={active}
                data-testid="category-option"
                data-cat={c.id}
                whileTap={{ scale: 0.9 }}
                onClick={() => setCategory(c.id)}
                className="relative flex h-10 items-center justify-center gap-1.5 rounded-xl text-sm font-bold"
                style={{ color: active ? "#fff" : "#0b0c0f" }}
              >
                {active ? (
                  <motion.span layoutId="category-pick" transition={spring} className="absolute inset-0 rounded-xl" style={{ background: c.color }} />
                ) : (
                  <span className="absolute inset-0 rounded-xl bg-white/70" />
                )}
                <span className="relative size-2 rounded-full" style={{ background: active ? "#fff" : c.color }} />
                <span className="relative">{c.label}</span>
              </motion.button>
            );
          })}
        </div>
        {form.category === "cardio" ? (
          <SetFields category={form.category} form={form} onChange={(f) => setForm({ ...form, ...f })} />
        ) : (
          <SetRows
            sets={setsOf(form)}
            onChange={(sets) => setForm({ ...form, weight: sets[0].weight, reps: sets[0].reps, sets: sets.length, detail: sets })}
          />
        )}
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
  const unit = useStore((s) => s.unit);
  const addLog = useStore((s) => s.addLog);
  const [form, setForm] = useState<RecordForm>({ sets: [], cardio: { reps: 0, rest: 0, sets: 1 } });
  const [saved, setSaved] = useState(false);
  const [rest, setRest] = useState<RestRun | null>(null);
  const restTimes = useStore((s) => s.restTimes) ?? DEFAULT_REST;
  const gate = useProGate();

  useEffect(() => {
    if (exercise) setForm(initialRecord(exercise, logs.find((l) => l.exerciseId === exercise.id)));
    setSaved(false);
    setRest(null);
    // Only reset when a different menu is opened, not after each record.
  }, [id]);

  const history = logs.filter((l) => l.exerciseId === id);
  const cardio = exercise?.category === "cardio";
  const typed = history.map((l) => ({ ...l, category: exercise?.category ?? "other" }) as const);
  const best = typed.reduce((m, l) => Math.max(m, ...setsOf(l).map((x) => x.weight)), 0);
  const volume = typed.reduce((sum, l) => sum + volumeOf(l), 0);

  return (
    <Sheet
      open={!!exercise}
      onClose={onClose}
      testId="log-sheet"
      title={
        exercise && (
          <div className="flex items-center gap-2">
            <CategoryBadge id={exercise.category} />
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
          <AnimatePresence>
            {rest && (
              <RestBanner
                key={rest.id}
                run={rest}
                unit={unit}
                onAdjust={(d) => setRest({ ...rest, endAt: Math.max(Date.now(), rest.endAt + d * 1000), total: Math.max(1, rest.total + d) })}
                onDone={() => setRest(null)}
              />
            )}
          </AnimatePresence>
          <div className="grid grid-cols-3 gap-2">
            {cardio ? (
              <Stat label="最長" value={history.length ? `${Math.max(...typed.map(cardioMinutes))}分` : "–"} />
            ) : (
              <Stat label="ベスト" value={best ? formatWeight(best, unit) : "–"} />
            )}
            <Stat label="記録" value={`${history.length}`} />
            {cardio ? (
              <Stat label="合計時間" value={history.length ? `${typed.reduce((m, l) => m + cardioMinutes(l), 0)}分` : "–"} />
            ) : (
              <Stat label="総ボリューム" value={volume ? formatVolume(volume, unit) : "–"} />
            )}
          </div>
          {!cardio && (
            <ProLock label="推定1RMグラフは Pro で使えます" testId="e1rm-lock">
              <E1rmChart points={e1rmSeries(logs, exercise.id, exercise.category)} unit={unit} />
            </ProLock>
          )}
          {cardio ? (
            <CardioFields value={form.cardio} onChange={(c) => setForm({ ...form, cardio: c })} />
          ) : (
            <SetRows
              sets={form.sets}
              onChange={(sets) => setForm({ ...form, sets })}
              resting={rest?.next ? rest.next.index - 1 : rest ? form.sets.length - 1 : null}
              onRest={(i) =>
                gate(() => {
                  const type = form.sets[i].type ?? "N";
                  const total = restTimes[type];
                  setRest({
                    id: Date.now(),
                    type,
                    total,
                    endAt: Date.now() + total * 1000,
                    next: form.sets[i + 1] ? { index: i + 1, set: form.sets[i + 1] } : null,
                  });
                })()
              }
            />
          )}
          <PrimaryButton
            testId="log-save"
            tone={saved ? "ink" : "accent"}
            onClick={() => {
              addLog(toLog(exercise, form));
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
                  <LogRow
                    key={log.id}
                    log={log}
                    text={formatSet({ ...log, category: exercise.category }, unit) + (log.tempo ? ` · TUT${tutOf(log.tempo, log.reps)}秒` : "")}
                  />
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

function LogRow({ log, text }: { log: LogEntry; text: string }) {
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
        <span className="font-display text-lg font-bold">{text}</span>
      </motion.div>
    </motion.li>
  );
}

type PresetForm = Omit<Preset, "id"> & { kind: TimerKind; tempo: Tempo };

const BLANK: PresetForm = { name: "", kind: "interval", work: 30, rest: 15, rounds: 8, work2: 30, transition: 10, tempo: [3, 1, 2, 0], reps: 10, tempoStart: "top" };

const KINDS: { id: TimerKind; label: string; pro: boolean }[] = [
  { id: "interval", label: "インターバル", pro: false },
  { id: "superset", label: "スーパーセット", pro: true },
  { id: "tempo", label: "テンポ", pro: true },
];

export function PresetEditor({ open, id, onClose }: { open: boolean; id: string | null; onClose: () => void }) {
  const existing = useStore((s) => s.presets.find((p) => p.id === id));
  const canDelete = useStore((s) => s.presets.length > 1);
  const savePreset = useStore((s) => s.savePreset);
  const removePreset = useStore((s) => s.removePreset);
  const selectPreset = useStore((s) => s.selectPreset);
  const pro = usePro();
  const [form, setForm] = useState<PresetForm>(BLANK);

  useEffect(() => {
    if (!open) return;
    setForm(existing ? { ...BLANK, ...existing, kind: existing.kind ?? "interval", tempo: existing.tempo ?? BLANK.tempo } : BLANK);
  }, [open, existing]);

  const kind = form.kind;
  const valid = kind === "interval" ? form.work + form.rest > 0 : kind === "superset" ? form.work > 0 : (form.reps ?? 0) > 0 && form.tempo.some((t) => t > 0);
  const total = totalMs(buildSegments({ prepare: 0, ...form }));
  const setTempo = (i: number, v: number) => setForm({ ...form, tempo: form.tempo.map((t, j) => (j === i ? v : t)) as Tempo });

  const defaultName = () =>
    kind === "superset" ? "スーパーセット" : kind === "tempo" ? `テンポ ${formatTempo(form.tempo)}` : form.work === 0 ? "REST" : `${form.work}/${form.rest}`;

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
        <div className="grid grid-cols-3 gap-1 rounded-2xl bg-slate-900/5 p-1" role="radiogroup" aria-label="タイマーの種類">
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              role="radio"
              aria-checked={kind === k.id}
              data-testid={`kind-${k.id}`}
              onClick={() => {
                haptic(8);
                if (k.pro && !pro) openProSheet();
                else setForm({ ...form, kind: k.id });
              }}
              className={`relative flex h-10 items-center justify-center gap-1 rounded-xl text-xs font-bold ${kind === k.id ? "text-white" : "text-ink"}`}
            >
              {kind === k.id && <motion.span layoutId="kind-pill" transition={spring} className="absolute inset-0 rounded-xl bg-ink" />}
              <span className="relative">{k.label}</span>
              {k.pro && (pro ? <Crown size={11} strokeWidth={3} className={`relative ${kind === k.id ? "text-[#ff9f0a]" : "text-accent"}`} /> : <Lock size={11} className="relative text-mute" />)}
            </button>
          ))}
        </div>

        {kind === "interval" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Stepper label="WORK" unit="秒" step={5} max={3600} value={form.work} onChange={(work) => setForm({ ...form, work })} testId="preset-work" />
              <Stepper label="REST" unit="秒" step={5} max={3600} value={form.rest} onChange={(rest) => setForm({ ...form, rest })} testId="preset-rest" />
            </div>
          </>
        )}
        {kind === "superset" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Stepper label="種目A" unit="秒" step={5} min={5} max={3600} value={form.work} onChange={(work) => setForm({ ...form, work })} testId="ss-a" />
              <Stepper label="種目B" unit="秒" step={5} min={5} max={3600} value={form.work2 ?? 30} onChange={(work2) => setForm({ ...form, work2 })} testId="ss-b" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Stepper label="移動" unit="秒" step={5} max={600} value={form.transition ?? 0} onChange={(transition) => setForm({ ...form, transition })} testId="ss-move" />
              <Stepper label="本休憩" unit="秒" step={5} max={3600} value={form.rest} onChange={(rest) => setForm({ ...form, rest })} testId="ss-rest" />
            </div>
          </>
        )}
        {kind === "tempo" && (
          <>
            <div className="grid grid-cols-4 gap-2" data-testid="tempo-fields">
              {(["下ろす", "止める", "挙げる", "締める"] as const).map((label, i) => (
                <label key={label} className="glass flex flex-col items-center rounded-2xl py-2">
                  <span className="text-[10px] font-bold text-mute">{label}</span>
                  <NumberInput label={label} value={form.tempo[i]} max={20} onChange={(v) => setTempo(i, v)} className="text-3xl" />
                  <span className="text-[10px] font-semibold text-mute">秒</span>
                </label>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Stepper label="回数" min={1} max={50} value={form.reps ?? 10} onChange={(reps) => setForm({ ...form, reps })} testId="tempo-reps" />
              <Stepper label="セット間休憩" unit="秒" step={15} max={3600} value={form.rest} onChange={(rest) => setForm({ ...form, rest })} testId="tempo-rest" />
            </div>
            <div className="glass flex items-center justify-between rounded-2xl py-2 pr-2 pl-4">
              <span className="text-xs font-bold">開始位置</span>
              <div className="flex rounded-xl bg-slate-900/5 p-1" role="radiogroup" aria-label="開始位置">
                {(
                  [
                    ["top", "上から（スクワット等）"],
                    ["bottom", "下から（デッド等）"],
                  ] as const
                ).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={form.tempoStart === v}
                    onClick={() => setForm({ ...form, tempoStart: v })}
                    className={`h-8 rounded-lg px-2 text-[11px] font-bold ${form.tempoStart === v ? "bg-ink text-white" : "text-mute"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="text-center text-xs font-bold text-mute" data-testid="editor-tut">
              TUT {tutOf(form.tempo, form.reps ?? 10)}秒 / セット
            </div>
          </>
        )}

        <Stepper label="セット数" min={1} max={99} value={form.rounds} onChange={(rounds) => setForm({ ...form, rounds })} testId="preset-rounds" />
        <div className="text-center font-display text-sm font-semibold text-mute">TOTAL {formatDuration(total)}</div>
        <PrimaryButton
          testId="preset-save"
          disabled={!valid}
          onClick={() => {
            const name = form.name.trim() || defaultName();
            const base = { name, kind, work: form.work, rest: form.rest, rounds: form.rounds };
            const extra =
              kind === "superset"
                ? { work2: form.work2, transition: form.transition }
                : kind === "tempo"
                  ? { work: 0, tempo: form.tempo, reps: form.reps, tempoStart: form.tempoStart }
                  : {};
            selectPreset(savePreset({ ...base, ...extra, id: existing?.id }));
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
    <Sheet open={open} onClose={onClose} title="設定" testId="account-sheet">
      <div className="space-y-4 pt-2 pb-2">
        <UnitToggle />
        <ProLock label="セット別の休憩時間は Pro で使えます" testId="rest-times-lock">
          <RestTimesSection />
        </ProLock>
        <DataSection />
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

/** Pro: rest seconds after warm-up, working and drop sets. */
function RestTimesSection() {
  const restTimes = useStore((s) => s.restTimes) ?? DEFAULT_REST;
  const setRestTimes = useStore((s) => s.setRestTimes);
  return (
    <div className="glass rounded-2xl p-3" data-testid="rest-times">
      <div className="mb-2 flex items-center gap-2 px-1 text-sm font-bold">
        セット別の休憩時間 <ProBadge />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {(["W", "N", "D"] as const).map((t) => (
          <label key={t} className="flex flex-col items-center rounded-xl bg-white/80 py-2">
            <span className="text-[10px] font-bold" style={{ color: SET_TYPE[t].color }}>
              {SET_TYPE[t].label}
            </span>
            <NumberInput
              label={`${SET_TYPE[t].label}の休憩`}
              value={restTimes[t]}
              max={1800}
              onChange={(v) => setRestTimes({ ...restTimes, [t]: v })}
              className="text-2xl"
            />
            <span className="text-[10px] font-semibold text-mute">秒</span>
          </label>
        ))}
      </div>
    </div>
  );
}

/** Free: export everything, and import this app's, Strong's, Hevy's or FitNotes' CSV. */
function DataSection() {
  const input = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const download = () => {
    const s = useStore.getState();
    const blob = new Blob([exportCsv(s.logs, s.exercises)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const d = new Date();
    a.download = `reps-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    haptic(8);
  };

  const upload = async (file: File) => {
    try {
      const s = useStore.getState();
      const r = importCsv(await file.text(), s, s.unit, uid);
      s.importRecords(r.exercises, r.logs);
      setResult({
        ok: true,
        text: `${r.logs.length}件の記録・${r.exercises.length}件のメニューを読み込みました${r.skipped ? `（${r.skipped}件スキップ）` : ""}`,
      });
    } catch {
      setResult({ ok: false, text: "この CSV は読み込めませんでした" });
    }
  };

  return (
    <div className="glass rounded-2xl p-3" data-testid="data-section">
      <div className="mb-2 flex items-baseline justify-between px-1">
        <span className="text-sm font-bold">データ（CSV）</span>
        <span className="text-[10px] font-semibold text-mute">Strong・Hevy・FitNotes にも対応</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <motion.button
          type="button"
          whileTap={{ scale: 0.96 }}
          onClick={download}
          data-testid="csv-export"
          className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-white/80 text-sm font-bold"
        >
          <Download size={16} /> 書き出す
        </motion.button>
        <motion.button
          type="button"
          whileTap={{ scale: 0.96 }}
          onClick={() => input.current?.click()}
          className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-white/80 text-sm font-bold"
        >
          <Upload size={16} /> 読み込む
        </motion.button>
      </div>
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv"
        hidden
        data-testid="csv-import"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = "";
        }}
      />
      <AnimatePresence>
        {result && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            data-testid="csv-result"
            className={`mt-2 px-1 text-xs font-semibold ${result.ok ? "text-go" : "text-danger"}`}
          >
            {result.text}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

function UnitToggle() {
  const unit = useStore((s) => s.unit);
  const setUnit = useStore((s) => s.setUnit);
  return (
    <div className="glass flex items-center justify-between rounded-2xl py-2 pr-2 pl-4">
      <span className="text-sm font-bold">重量の単位</span>
      <div className="relative flex rounded-xl bg-slate-900/5 p-1" role="radiogroup" aria-label="重量の単位">
        {(["kg", "lb"] as const).map((u) => (
          <button
            key={u}
            type="button"
            role="radio"
            aria-checked={unit === u}
            data-testid={`unit-${u}`}
            onClick={() => {
              haptic(8);
              setUnit(u);
            }}
            className={`relative h-9 w-16 rounded-lg text-sm font-bold ${unit === u ? "text-white" : "text-mute"}`}
          >
            {unit === u && <motion.span layoutId="unit-pill" transition={spring} className="absolute inset-0 rounded-lg bg-ink" />}
            <span className="relative">{u === "kg" ? "kg" : "lbs"}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

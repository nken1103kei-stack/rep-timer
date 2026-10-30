import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Plus, X } from "lucide-react";
import { CATEGORIES, DEFAULT_TEMPLATE, LIBRARY, type CategoryId, type Template } from "../lib/catalog";
import { useStore } from "../lib/store";
import { formatSet } from "../lib/stats";
import { haptic } from "../lib/feedback";
import { PrimaryButton, Sheet, spring } from "./ui";

type Item = Template & { category: CategoryId; customId?: string };

const keyOf = (i: { category: CategoryId; name: string }) => `${i.category}:${i.name}`;

export function LibrarySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const exercises = useStore((s) => s.exercises);
  const customLibrary = useStore((s) => s.customLibrary);
  const unit = useStore((s) => s.unit);
  const addExercises = useStore((s) => s.addExercises);
  const addCustomTemplate = useStore((s) => s.addCustomTemplate);
  const removeCustomTemplate = useStore((s) => s.removeCustomTemplate);
  const [tab, setTab] = useState<CategoryId>("chest");
  const [dir, setDir] = useState(1);
  const [picked, setPicked] = useState<Map<string, Item>>(new Map());
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (open) {
      setPicked(new Map());
      setDraft("");
    }
  }, [open]);

  const cat = CATEGORIES.find((c) => c.id === tab)!;
  const added = new Set(exercises.map((e) => keyOf(e)));
  const items: Item[] = [
    ...(tab === "other" ? [] : LIBRARY[tab]).map((t) => ({ ...t, category: tab })),
    ...customLibrary
      .filter((t) => t.category === tab)
      .map((t) => ({ ...DEFAULT_TEMPLATE(tab), name: t.name, category: tab, customId: t.id })),
  ];

  const goTo = (next: CategoryId) => {
    const from = CATEGORIES.findIndex((c) => c.id === tab);
    const to = CATEGORIES.findIndex((c) => c.id === next);
    setDir(to >= from ? 1 : -1);
    setTab(next);
    setDraft("");
  };

  const toggle = (item: Item) => {
    haptic(8);
    setPicked((prev) => {
      const next = new Map(prev);
      if (next.has(keyOf(item))) next.delete(keyOf(item));
      else next.set(keyOf(item), item);
      return next;
    });
  };

  const addCustom = () => {
    const name = draft.trim();
    if (!name) return;
    addCustomTemplate(tab, name);
    setPicked((prev) => new Map(prev).set(keyOf({ category: tab, name }), { ...DEFAULT_TEMPLATE(tab), name, category: tab }));
    setDraft("");
  };

  const submit = () => {
    addExercises([...picked.values()].map(({ name, category, weight, reps, sets }) => ({ name, category, weight, reps, sets })));
    onClose();
  };

  const countFor = (id: CategoryId) => [...picked.values()].filter((p) => p.category === id).length;

  return (
    <Sheet open={open} onClose={onClose} title="種目を追加" testId="library-sheet">
      <div className="no-scrollbar sticky top-0 z-10 -mx-5 flex gap-2 overflow-x-auto px-5 pt-1 pb-3" role="tablist" aria-label="部位">
        {CATEGORIES.map((c) => {
          const active = c.id === tab;
          const n = countFor(c.id);
          return (
            <motion.button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid="lib-tab"
              data-cat={c.id}
              whileTap={{ scale: 0.9 }}
              onClick={() => goTo(c.id)}
              className="relative flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-bold"
              style={{ color: active ? "#fff" : "#0b0c0f" }}
            >
              {active && <motion.span layoutId="lib-tab" transition={spring} className="absolute inset-0 rounded-full" style={{ background: c.color }} />}
              {!active && <span className="absolute inset-0 rounded-full bg-white/70" />}
              <span className="relative size-2 rounded-full" style={{ background: active ? "#fff" : c.color }} />
              <span className="relative">{c.label}</span>
              {n > 0 && <span className="relative rounded-full bg-black/15 px-1.5 text-[11px]">{n}</span>}
            </motion.button>
          );
        })}
      </div>

      <AnimatePresence mode="popLayout" initial={false} custom={dir}>
        <motion.div
          key={tab}
          custom={dir}
          variants={{
            enter: (d: number) => ({ x: d * 60, opacity: 0 }),
            center: { x: 0, opacity: 1 },
            exit: (d: number) => ({ x: d * -60, opacity: 0 }),
          }}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.22 }}
          drag="x"
          dragDirectionLock
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.25}
          style={{ touchAction: "pan-y" }}
          onDragEnd={(_, info) => {
            const i = CATEGORIES.findIndex((c) => c.id === tab);
            if (info.offset.x < -70 && i < CATEGORIES.length - 1) goTo(CATEGORIES[i + 1].id);
            else if (info.offset.x > 70 && i > 0) goTo(CATEGORIES[i - 1].id);
          }}
          className="space-y-2 pb-3"
          data-testid="lib-list"
        >
          {items.map((item, idx) => {
            const isAdded = added.has(keyOf(item));
            const isPicked = picked.has(keyOf(item));
            return (
              <motion.div
                key={keyOf(item)}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0, transition: { delay: idx * 0.025 } }}
                className="flex items-center gap-2"
              >
                <motion.button
                  type="button"
                  disabled={isAdded}
                  aria-pressed={isPicked}
                  data-testid="lib-item"
                  data-name={item.name}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => toggle(item)}
                  className="glass flex h-14 min-w-0 flex-1 items-center gap-3 rounded-2xl px-4 text-left disabled:opacity-45"
                  style={isPicked ? { outline: `2px solid ${cat.color}` } : undefined}
                >
                  <span className="h-7 w-1.5 shrink-0 rounded-full" style={{ background: cat.color }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-bold">{item.name}</span>
                    <span className="block font-display text-xs font-semibold text-mute">
                      {isAdded ? "追加済み" : formatSet(item, unit)}
                    </span>
                  </span>
                  <motion.span
                    className="grid size-6 shrink-0 place-items-center rounded-full border-2"
                    animate={{
                      backgroundColor: isPicked ? cat.color : "rgba(255,255,255,0)",
                      borderColor: isPicked ? cat.color : "rgba(15,23,42,0.15)",
                    }}
                  >
                    {(isPicked || isAdded) && <Check size={14} strokeWidth={3.5} className={isPicked ? "text-white" : "text-mute"} />}
                  </motion.span>
                </motion.button>
                {item.customId && (
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.85 }}
                    aria-label={`${item.name}を候補から削除`}
                    data-testid="lib-custom-remove"
                    onClick={() => {
                      removeCustomTemplate(item.customId!);
                      setPicked((prev) => {
                        const next = new Map(prev);
                        next.delete(keyOf(item));
                        return next;
                      });
                    }}
                    className="grid size-10 shrink-0 place-items-center rounded-full text-mute"
                  >
                    <X size={16} />
                  </motion.button>
                )}
              </motion.div>
            );
          })}

          <div className="flex items-center gap-2 pt-1">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCustom()}
              maxLength={40}
              placeholder={`${cat.label}の種目を追加`}
              aria-label={`${cat.label}の種目名`}
              data-testid="lib-custom-input"
              className="h-12 min-w-0 flex-1 rounded-2xl border-2 border-dashed border-slate-900/15 bg-white/50 px-4 text-[15px] font-semibold outline-none focus:border-solid"
              style={{ borderColor: draft ? cat.color : undefined }}
            />
            <motion.button
              type="button"
              whileTap={{ scale: 0.88 }}
              disabled={!draft.trim()}
              aria-label="候補に追加"
              data-testid="lib-custom-add"
              onClick={addCustom}
              className="grid size-12 shrink-0 place-items-center rounded-2xl text-white disabled:opacity-30"
              style={{ background: cat.color }}
            >
              <Plus size={20} strokeWidth={2.6} />
            </motion.button>
          </div>
        </motion.div>
      </AnimatePresence>

      <div className="sticky bottom-0 -mx-5 bg-gradient-to-t from-white via-white/90 to-transparent px-5 pt-4 pb-1">
        <PrimaryButton onClick={submit} disabled={picked.size === 0} testId="lib-submit">
          {picked.size > 0 ? `${picked.size}件をメニューに追加` : "追加"}
        </PrimaryButton>
      </div>
    </Sheet>
  );
}

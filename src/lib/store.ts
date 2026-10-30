import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AppData, Exercise, LogEntry, Preset } from "./types";
import { guessCategory, isCategoryId, type CategoryId, type Unit } from "./catalog";

export const uid = () => crypto.randomUUID().slice(0, 12);

// Menus start empty: everything in the list is something the user added with "+".
const seed = (): AppData => ({
  exercises: [],
  logs: [],
  presets: [
    { id: uid(), name: "Tabata", work: 20, rest: 10, rounds: 8 },
    { id: uid(), name: "HIIT", work: 40, rest: 20, rounds: 6 },
    { id: uid(), name: "EMOM", work: 45, rest: 15, rounds: 10 },
    { id: uid(), name: "REST", work: 0, rest: 60, rounds: 1 },
    { id: uid(), name: "REST", work: 0, rest: 90, rounds: 1 },
  ],
  customLibrary: [],
  unit: "kg",
});

/** Brings data from older app versions (local or synced) up to the current shape. */
export function normalizeData(raw: Partial<AppData> & Record<string, unknown>): AppData {
  const exercises = (raw.exercises ?? []).map((e) => {
    const { id, name, weight, reps, sets, rest } = e as Exercise;
    const category: CategoryId = isCategoryId((e as Exercise).category) ? (e as Exercise).category : guessCategory(name);
    return category === "cardio" ? { id, name, category, weight, reps, sets, rest: rest ?? 0 } : { id, name, category, weight, reps, sets };
  });
  return {
    exercises,
    logs: raw.logs ?? [],
    presets: raw.presets?.length ? raw.presets : seed().presets,
    customLibrary: raw.customLibrary ?? [],
    unit: raw.unit === "lb" ? "lb" : "kg",
  };
}

type State = AppData & {
  updatedAt: number;
  selectedExerciseId: string | null;
  selectedPresetId: string | null;
  selectExercise: (id: string | null) => void;
  selectPreset: (id: string) => void;
  addExercise: (ex: Omit<Exercise, "id">) => string;
  addExercises: (list: Omit<Exercise, "id">[]) => void;
  updateExercise: (id: string, patch: Partial<Exercise>) => void;
  removeExercise: (id: string) => { exercise: Exercise; index: number } | null;
  restoreExercise: (exercise: Exercise, index: number) => void;
  purgeLogs: (exerciseId: string) => void;
  reorderExercises: (exercises: Exercise[]) => void;
  /** Records today's sets; the menu's defaults follow the latest record. */
  addLog: (log: Omit<LogEntry, "id" | "at" | "name" | "category">) => void;
  removeLog: (id: string) => void;
  savePreset: (preset: Omit<Preset, "id"> & { id?: string }) => string;
  removePreset: (id: string) => void;
  addCustomTemplate: (category: CategoryId, name: string) => void;
  removeCustomTemplate: (id: string) => void;
  setUnit: (unit: Unit) => void;
  replaceData: (data: AppData, updatedAt: number) => void;
};

const touched = () => ({ updatedAt: Date.now() });

export const useStore = create<State>()(
  persist(
    (set, get) => {
      const initial = seed();
      return {
        ...initial,
        updatedAt: 0,
        selectedExerciseId: null,
        selectedPresetId: initial.presets[0].id,
        selectExercise: (id) => set({ selectedExerciseId: id }),
        selectPreset: (id) => set({ selectedPresetId: id }),
        addExercise: (ex) => {
          const id = uid();
          set((s) => ({ exercises: [...s.exercises, { ...ex, id }], ...touched() }));
          return id;
        },
        addExercises: (list) =>
          set((s) => ({ exercises: [...s.exercises, ...list.map((ex) => ({ ...ex, id: uid() }))], ...touched() })),
        updateExercise: (id, patch) =>
          set((s) => ({ exercises: s.exercises.map((e) => (e.id === id ? { ...e, ...patch } : e)), ...touched() })),
        removeExercise: (id) => {
          const index = get().exercises.findIndex((e) => e.id === id);
          if (index < 0) return null;
          const exercise = get().exercises[index];
          set((s) => ({
            exercises: s.exercises.filter((e) => e.id !== id),
            selectedExerciseId: s.selectedExerciseId === id ? null : s.selectedExerciseId,
            ...touched(),
          }));
          return { exercise, index };
        },
        restoreExercise: (exercise, index) =>
          set((s) => {
            const exercises = [...s.exercises];
            exercises.splice(Math.min(index, exercises.length), 0, exercise);
            return { exercises, ...touched() };
          }),
        purgeLogs: (exerciseId) => {
          if (get().exercises.some((e) => e.id === exerciseId)) return;
          set((s) => ({ logs: s.logs.filter((l) => l.exerciseId !== exerciseId), ...touched() }));
        },
        reorderExercises: (exercises) => set({ exercises, ...touched() }),
        addLog: (log) =>
          set((s) => {
            const ex = s.exercises.find((e) => e.id === log.exerciseId);
            return {
              logs: [{ ...log, id: uid(), at: Date.now(), name: ex?.name, category: ex?.category }, ...s.logs],
              // The latest record becomes the menu's default for next time.
              exercises: s.exercises.map((e) =>
                e.id === log.exerciseId
                  ? { ...e, weight: log.weight, reps: log.reps, sets: log.sets, ...(e.category === "cardio" ? { rest: log.rest ?? 0 } : {}) }
                  : e,
              ),
              ...touched(),
            };
          }),
        removeLog: (id) => set((s) => ({ logs: s.logs.filter((l) => l.id !== id), ...touched() })),
        savePreset: ({ id, ...preset }) => {
          const presetId = id ?? uid();
          set((s) => ({
            presets: id
              ? s.presets.map((p) => (p.id === id ? { ...p, ...preset } : p))
              : [...s.presets, { ...preset, id: presetId }],
            ...touched(),
          }));
          return presetId;
        },
        removePreset: (id) =>
          set((s) => {
            if (s.presets.length <= 1) return s;
            const presets = s.presets.filter((p) => p.id !== id);
            return {
              presets,
              selectedPresetId: s.selectedPresetId === id ? presets[0].id : s.selectedPresetId,
              ...touched(),
            };
          }),
        addCustomTemplate: (category, name) =>
          set((s) =>
            s.customLibrary.some((t) => t.category === category && t.name === name)
              ? s
              : { customLibrary: [...s.customLibrary, { id: uid(), category, name }], ...touched() },
          ),
        removeCustomTemplate: (id) =>
          set((s) => ({ customLibrary: s.customLibrary.filter((t) => t.id !== id), ...touched() })),
        setUnit: (unit) => set({ unit, ...touched() }),
        replaceData: (data, updatedAt) =>
          set((s) => {
            const next = normalizeData(data);
            return {
              ...next,
              updatedAt,
              selectedExerciseId: next.exercises.some((e) => e.id === s.selectedExerciseId) ? s.selectedExerciseId : null,
              selectedPresetId: next.presets.some((p) => p.id === s.selectedPresetId)
                ? s.selectedPresetId
                : (next.presets[0]?.id ?? null),
            };
          }),
      };
    },
    {
      name: "rep-timer",
      version: 2,
      migrate: (persisted, version) => {
        const s = persisted as Record<string, unknown>;
        return version < 2 ? { ...s, ...normalizeData(s) } : s;
      },
    },
  ),
);

export const pickData = (s: AppData): AppData => ({
  exercises: s.exercises,
  logs: s.logs,
  presets: s.presets,
  customLibrary: s.customLibrary,
  unit: s.unit,
});

export const lastLogFor = (logs: LogEntry[], exerciseId: string) => logs.find((l) => l.exerciseId === exerciseId);

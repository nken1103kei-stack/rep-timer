import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AppData, Exercise, LogEntry, Preset } from "./types";

export const uid = () => crypto.randomUUID().slice(0, 12);

export const COLORS = ["#FF4F00", "#00A3FF", "#14C38E", "#FFB800", "#8B5CF6", "#FF2D55"];

const seed = (): AppData => ({
  exercises: [
    { id: uid(), name: "ベンチプレス", weight: 60, reps: 10, sets: 3, color: COLORS[0] },
    { id: uid(), name: "スクワット", weight: 80, reps: 8, sets: 3, color: COLORS[1] },
    { id: uid(), name: "デッドリフト", weight: 100, reps: 5, sets: 3, color: COLORS[2] },
    { id: uid(), name: "懸垂", weight: 0, reps: 10, sets: 3, color: COLORS[3] },
  ],
  logs: [],
  presets: [
    { id: uid(), name: "Tabata", work: 20, rest: 10, rounds: 8 },
    { id: uid(), name: "HIIT", work: 40, rest: 20, rounds: 6 },
    { id: uid(), name: "EMOM", work: 45, rest: 15, rounds: 10 },
    { id: uid(), name: "REST", work: 0, rest: 60, rounds: 1 },
    { id: uid(), name: "REST", work: 0, rest: 90, rounds: 1 },
  ],
});

type State = AppData & {
  updatedAt: number;
  selectedExerciseId: string | null;
  selectedPresetId: string | null;
  selectExercise: (id: string | null) => void;
  selectPreset: (id: string) => void;
  addExercise: (ex: Omit<Exercise, "id">) => string;
  updateExercise: (id: string, patch: Partial<Exercise>) => void;
  removeExercise: (id: string) => { exercise: Exercise; index: number } | null;
  restoreExercise: (exercise: Exercise, index: number) => void;
  purgeLogs: (exerciseId: string) => void;
  reorderExercises: (exercises: Exercise[]) => void;
  addLog: (log: Omit<LogEntry, "id" | "at">) => void;
  removeLog: (id: string) => void;
  savePreset: (preset: Omit<Preset, "id"> & { id?: string }) => string;
  removePreset: (id: string) => void;
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
          set((s) => ({
            logs: [{ ...log, id: uid(), at: Date.now() }, ...s.logs],
            // The latest record becomes the menu's default for next time.
            exercises: s.exercises.map((e) =>
              e.id === log.exerciseId ? { ...e, weight: log.weight, reps: log.reps, sets: log.sets } : e,
            ),
            ...touched(),
          })),
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
        replaceData: (data, updatedAt) =>
          set((s) => ({
            ...data,
            updatedAt,
            selectedExerciseId: data.exercises.some((e) => e.id === s.selectedExerciseId) ? s.selectedExerciseId : null,
            selectedPresetId: data.presets.some((p) => p.id === s.selectedPresetId)
              ? s.selectedPresetId
              : (data.presets[0]?.id ?? null),
          })),
      };
    },
    { name: "rep-timer", version: 1 },
  ),
);

export const pickData = (s: AppData): AppData => ({ exercises: s.exercises, logs: s.logs, presets: s.presets });

export const lastLogFor = (logs: LogEntry[], exerciseId: string) => logs.find((l) => l.exerciseId === exerciseId);

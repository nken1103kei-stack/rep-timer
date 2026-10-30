import type { CategoryId, Unit } from "./catalog";

/** Weights are always stored in kg. For cardio, `reps` is minutes and `sets` is 1. */
export type Exercise = {
  id: string;
  name: string;
  category: CategoryId;
  weight: number;
  reps: number;
  sets: number;
};

export type LogEntry = {
  id: string;
  exerciseId: string;
  at: number;
  weight: number;
  reps: number;
  sets: number;
  /** Snapshot so the calendar still reads correctly after a rename or delete. */
  name?: string;
  category?: CategoryId;
};

export type Preset = {
  id: string;
  name: string;
  work: number;
  rest: number;
  rounds: number;
};

export type CustomTemplate = { id: string; category: CategoryId; name: string };

export type AppData = {
  exercises: Exercise[];
  logs: LogEntry[];
  presets: Preset[];
  customLibrary: CustomTemplate[];
  unit: Unit;
};

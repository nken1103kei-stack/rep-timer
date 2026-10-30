import type { CategoryId, Unit } from "./catalog";
import type { Tempo, TimerKind } from "./timer";

/** W = warm-up, N = working set, D = drop set. Each type has its own rest time (Pro). */
export type SetType = "W" | "N" | "D";

/** One performed set. Weight is kg. */
export type SetEntry = { weight: number; reps: number; type?: SetType };

/**
 * Weights are always stored in kg.
 * For cardio, `reps` is the work minutes per round, `rest` the rest minutes (0 allowed), `sets` the rounds.
 */
export type Exercise = {
  id: string;
  name: string;
  category: CategoryId;
  weight: number;
  reps: number;
  sets: number;
  rest?: number;
  /** Planned weight and reps for each set; `weight`/`reps` mirror the first set. */
  detail?: SetEntry[];
};

export type LogEntry = {
  id: string;
  exerciseId: string;
  at: number;
  weight: number;
  reps: number;
  sets: number;
  /** Per-set weight and reps for strength work; `weight`/`reps` mirror the first set. */
  detail?: SetEntry[];
  rest?: number;
  /** Tempo timer used for this record (Pro), e.g. [3, 1, 2, 0]. */
  tempo?: Tempo;
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
  /** Superset and tempo timers are Pro. Missing means a plain interval timer. */
  kind?: TimerKind;
  work2?: number;
  transition?: number;
  tempo?: Tempo;
  reps?: number;
  tempoStart?: "top" | "bottom";
};

/** Rest seconds after a warm-up, working and drop set (Pro rest timer). */
export type RestTimes = Record<SetType, number>;

export type CustomTemplate = { id: string; category: CategoryId; name: string };

export type AppData = {
  exercises: Exercise[];
  logs: LogEntry[];
  presets: Preset[];
  customLibrary: CustomTemplate[];
  unit: Unit;
  restTimes?: RestTimes;
};

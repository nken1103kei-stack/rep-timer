export type Exercise = {
  id: string;
  name: string;
  weight: number;
  reps: number;
  sets: number;
  color: string;
};

export type LogEntry = {
  id: string;
  exerciseId: string;
  at: number;
  weight: number;
  reps: number;
  sets: number;
};

export type Preset = {
  id: string;
  name: string;
  work: number;
  rest: number;
  rounds: number;
};

export type AppData = {
  exercises: Exercise[];
  logs: LogEntry[];
  presets: Preset[];
};

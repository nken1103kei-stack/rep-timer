import { create } from "zustand";
import type { ProFeature } from "./proSheet";

const KEY = "reps-coach-seen";

function readSeen(): ProFeature[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

type Coach = {
  /** The feature being explained and the element the mark points at. */
  active: { feature: ProFeature; rect: DOMRect; then?: () => void } | null;
  seen: ProFeature[];
};

/** First-use coach marks for Pro features: shown once per feature, the first time a Pro member taps it. */
export const useCoach = create<Coach>(() => ({ active: null, seen: readSeen() }));

/** Shows the coach mark over `el` if this feature was never explained; `then` runs once it is closed (or right away). */
export function coachFirst(feature: ProFeature, el: Element | null, then?: () => void) {
  const { seen, active } = useCoach.getState();
  if (seen.includes(feature) || active || !el) return then?.();
  useCoach.setState({ active: { feature, rect: el.getBoundingClientRect(), then } });
}

/** Closes the mark for good; `run` false skips the tapped action (when opening the full explanation instead). */
export function closeCoach(run = true) {
  const { active, seen } = useCoach.getState();
  if (!active) return;
  const next = [...new Set([...seen, active.feature])];
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private mode: the mark may show again next time, which is harmless.
  }
  useCoach.setState({ active: null, seen: next });
  if (run) active.then?.();
}

import { create } from "zustand";

export type Toast = { id: number; text: string; undo?: () => void };

/** Global so a sheet or a row can confirm what it did, and offer to undo it. */
export const useToast = create<{ toast: Toast | null }>(() => ({ toast: null }));

let timer: ReturnType<typeof setTimeout> | undefined;

export function hideToast() {
  clearTimeout(timer);
  useToast.setState({ toast: null });
}

export function showToast(t: Omit<Toast, "id">) {
  clearTimeout(timer);
  useToast.setState({ toast: { ...t, id: Date.now() } });
  timer = setTimeout(hideToast, t.undo ? 6000 : 2600);
}

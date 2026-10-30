import { create } from "zustand";

/** Global so any locked feature can open the upgrade sheet. */
export const useProSheet = create<{ open: boolean }>(() => ({ open: false }));
export const openProSheet = () => useProSheet.setState({ open: true });

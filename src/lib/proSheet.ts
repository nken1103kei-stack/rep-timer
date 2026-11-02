import { create } from "zustand";

/** Pro features that have their own explanation page (ad removal needs none). */
export type ProFeature = "rest" | "superset" | "tempo" | "heatmap" | "e1rm";

/** Global so any locked feature can open the upgrade sheet; `page` opens straight on one feature's explanation. */
export const useProSheet = create<{ open: boolean; page: ProFeature | null }>(() => ({ open: false, page: null }));
export const openProSheet = (page: ProFeature | null = null) => useProSheet.setState({ open: true, page });

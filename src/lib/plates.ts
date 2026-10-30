import { displayWeight, type Unit } from "./catalog";

const BAR = { kg: 20, lb: 45 } as const;
const PLATES = { kg: [25, 20, 15, 10, 5, 2.5, 1.25], lb: [45, 35, 25, 10, 5, 2.5] } as const;

/** Plates to load on each side of a standard bar, largest first. Null when the weight is the bar or less. */
export function platesPerSide(kg: number, unit: Unit): { bar: number; plates: number[]; rest: number } | null {
  const total = displayWeight(kg, unit);
  const bar = BAR[unit];
  if (total <= bar) return null;
  let side = (total - bar) / 2;
  const plates: number[] = [];
  for (const p of PLATES[unit]) {
    while (side >= p - 1e-6) {
      plates.push(p);
      side = Math.round((side - p) * 1000) / 1000;
    }
  }
  return { bar, plates, rest: side };
}

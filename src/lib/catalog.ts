export type CategoryId = "shoulder" | "chest" | "back" | "arms" | "legs" | "abs" | "cardio" | "other";

export type Category = { id: CategoryId; label: string; color: string };

export const CATEGORIES: Category[] = [
  { id: "shoulder", label: "肩", color: "#FF9F0A" },
  { id: "chest", label: "胸", color: "#FF375F" },
  { id: "back", label: "背中", color: "#0A84FF" },
  { id: "arms", label: "腕", color: "#BF5AF2" },
  { id: "legs", label: "脚", color: "#30D158" },
  { id: "abs", label: "腹筋", color: "#FFD60A" },
  { id: "cardio", label: "有酸素", color: "#00C7BE" },
  { id: "other", label: "その他", color: "#8E8E93" },
];

const byId = Object.fromEntries(CATEGORIES.map((c) => [c.id, c])) as Record<CategoryId, Category>;
export const category = (id: CategoryId | undefined) => byId[id ?? "other"] ?? byId.other;
export const isCategoryId = (v: unknown): v is CategoryId => typeof v === "string" && v in byId;

export type Template = { name: string; weight: number; reps: number; sets: number };

/** Weights are kg. For cardio, `reps` holds minutes. */
export const LIBRARY: Record<Exclude<CategoryId, "other">, Template[]> = {
  shoulder: [
    { name: "ショルダープレス", weight: 30, reps: 10, sets: 3 },
    { name: "サイドレイズ", weight: 6, reps: 15, sets: 3 },
    { name: "フロントレイズ", weight: 6, reps: 12, sets: 3 },
    { name: "リアレイズ", weight: 5, reps: 15, sets: 3 },
    { name: "アップライトロウ", weight: 25, reps: 12, sets: 3 },
    { name: "アーノルドプレス", weight: 12, reps: 10, sets: 3 },
  ],
  chest: [
    { name: "ベンチプレス", weight: 60, reps: 10, sets: 3 },
    { name: "ダンベルプレス", weight: 20, reps: 10, sets: 3 },
    { name: "インクラインベンチプレス", weight: 50, reps: 10, sets: 3 },
    { name: "ダンベルフライ", weight: 12, reps: 12, sets: 3 },
    { name: "ケーブルクロスオーバー", weight: 15, reps: 12, sets: 3 },
    { name: "ディップス", weight: 0, reps: 10, sets: 3 },
    { name: "腕立て伏せ", weight: 0, reps: 20, sets: 3 },
  ],
  back: [
    { name: "デッドリフト", weight: 100, reps: 5, sets: 3 },
    { name: "懸垂", weight: 0, reps: 10, sets: 3 },
    { name: "ラットプルダウン", weight: 45, reps: 10, sets: 3 },
    { name: "ベントオーバーロウ", weight: 50, reps: 10, sets: 3 },
    { name: "シーテッドロウ", weight: 40, reps: 12, sets: 3 },
    { name: "ワンハンドロウ", weight: 20, reps: 10, sets: 3 },
  ],
  arms: [
    { name: "バーベルカール", weight: 25, reps: 10, sets: 3 },
    { name: "ダンベルカール", weight: 10, reps: 12, sets: 3 },
    { name: "ハンマーカール", weight: 10, reps: 12, sets: 3 },
    { name: "トライセプスエクステンション", weight: 10, reps: 12, sets: 3 },
    { name: "ケーブルプッシュダウン", weight: 20, reps: 12, sets: 3 },
    { name: "ナローベンチプレス", weight: 40, reps: 10, sets: 3 },
  ],
  legs: [
    { name: "スクワット", weight: 80, reps: 8, sets: 3 },
    { name: "レッグプレス", weight: 120, reps: 10, sets: 3 },
    { name: "ランジ", weight: 10, reps: 12, sets: 3 },
    { name: "ブルガリアンスクワット", weight: 10, reps: 10, sets: 3 },
    { name: "レッグエクステンション", weight: 40, reps: 12, sets: 3 },
    { name: "レッグカール", weight: 35, reps: 12, sets: 3 },
    { name: "カーフレイズ", weight: 0, reps: 20, sets: 3 },
  ],
  abs: [
    { name: "クランチ", weight: 0, reps: 20, sets: 3 },
    { name: "プランク", weight: 0, reps: 60, sets: 3 },
    { name: "レッグレイズ", weight: 0, reps: 15, sets: 3 },
    { name: "アブローラー", weight: 0, reps: 10, sets: 3 },
    { name: "ロシアンツイスト", weight: 0, reps: 20, sets: 3 },
    { name: "ハンギングレッグレイズ", weight: 0, reps: 10, sets: 3 },
  ],
  cardio: [
    { name: "ランニング", weight: 0, reps: 30, sets: 1 },
    { name: "ウォーキング", weight: 0, reps: 30, sets: 1 },
    { name: "エアロバイク", weight: 0, reps: 20, sets: 1 },
    { name: "トレッドミル", weight: 0, reps: 20, sets: 1 },
    { name: "ローイング", weight: 0, reps: 15, sets: 1 },
    { name: "縄跳び", weight: 0, reps: 10, sets: 1 },
    { name: "スイミング", weight: 0, reps: 30, sets: 1 },
  ],
};

export const DEFAULT_TEMPLATE = (cat: CategoryId): Template =>
  cat === "cardio" ? { name: "", weight: 0, reps: 30, sets: 1 } : { name: "", weight: 20, reps: 10, sets: 3 };

/** Best-effort category for menus created before categories existed. */
export function guessCategory(name: string): CategoryId {
  for (const [cat, list] of Object.entries(LIBRARY)) {
    if (list.some((t) => t.name === name)) return cat as CategoryId;
  }
  return "other";
}

const LB_PER_KG = 2.2046226218;
export type Unit = "kg" | "lb";

export const toUnit = (kg: number, unit: Unit) => (unit === "kg" ? kg : kg * LB_PER_KG);
export const fromUnit = (v: number, unit: Unit) => (unit === "kg" ? v : v / LB_PER_KG);
/** Display value in the chosen unit, rounded to what a gym plate can express. */
export const displayWeight = (kg: number, unit: Unit) => {
  const v = toUnit(kg, unit);
  return unit === "kg" ? Math.round(v * 100) / 100 : Math.round(v * 2) / 2;
};

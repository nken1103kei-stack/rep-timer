import { motion } from "motion/react";
import { Activity, ArrowRight, Flame, Layers, Metronome, Repeat, Timer, type LucideIcon } from "lucide-react";
import { SET_TYPE } from "../lib/record";
import { DEFAULT_REST } from "../lib/store";
import { HEAT_LEVELS, heatRange } from "../lib/analytics";
import type { ProFeature } from "../lib/proSheet";
import { HEAT_COLORS } from "./Charts";

export type FeatureGuide = {
  id: ProFeature;
  icon: LucideIcon;
  title: string;
  /** One sentence on what it does, shown on the page and in the coach mark. */
  lead: string;
  steps: string[];
  where: string;
  /** The coach mark's hint, said where the feature already is on screen. */
  tip: string;
  Diagram: () => React.JSX.Element;
};

/** Each Pro feature's own explanation page; ad removal needs none. */
export const GUIDES: FeatureGuide[] = [
  {
    id: "rest",
    icon: Timer,
    title: "セット別の休憩タイマー",
    lead: "W・N・D のセットの種類ごとに休憩時間が決まっていて、⏱ を押すだけでその時間がセットされます",
    steps: [
      "記録画面で「SET 1」などのラベルをタップして、ウォームアップの W、メインの N、ドロップの D を切り替える",
      "セットが終わったら、その行の ⏱ ボタンを押す",
      "休憩時間がセットされるので「スタート」。休憩中も次のセットの重量とプレートが見える",
      "それぞれの休憩時間は 設定 →「セット別の休憩時間」で変えられる",
    ],
    where: "記録画面の「SET」と ⏱ ボタン",
    tip: "SET のラベルで W・N・D を切り替え、セットが終わったら ⏱。その種類の休憩時間が入ります",
    Diagram: RestDiagram,
  },
  {
    id: "superset",
    icon: Layers,
    title: "スーパーセットタイマー",
    lead: "2つの種目を続けて行い、そのあと休憩。この流れを自動で繰り返します",
    steps: [
      "タイマーの「＋」→ 種類で「スーパーセット」を選ぶ",
      "種目A・種目B の時間、移動の時間、本休憩の時間を決める",
      "スタートすると、A → 移動 → B → 本休憩 の順に音と表示で切り替わる",
    ],
    where: "タイマーの追加・編集 →「スーパーセット」",
    tip: "種目A・移動・種目B・本休憩の4つの時間を決めると、その順に自動で進みます",
    Diagram: SupersetDiagram,
  },
  {
    id: "tempo",
    icon: Metronome,
    title: "テンポ・メトロノーム",
    lead: "1回の動作を「下ろす・止める・挙げる・締める」の秒数で区切り、音と振動でカウントします",
    steps: [
      "タイマーの「＋」→ 種類で「テンポ」を選ぶ",
      "4つの秒数と回数を決める。例: 3-1-2-0 を 10回",
      "スタートすると1回ずつカウント。筋肉に負荷がかかった時間 TUT も表示される",
    ],
    where: "タイマーの追加・編集 →「テンポ」",
    tip: "4つの秒数と回数を決めると、1回ずつ音と振動でカウントします",
    Diagram: TempoDiagram,
  },
  {
    id: "heatmap",
    icon: Flame,
    title: "部位ヒートマップ",
    lead: "その月に鍛えた回数が多い部位ほど濃い色になります。薄い所が、最近サボっている部位です",
    steps: [
      "上のカレンダーボタンを開くと、月のまとめの下に表示される",
      `色は ${HEAT_LEVELS} 段階。目安は2回ごとに1段階濃くなる`,
      "1日に同じ部位を何種目やっても「1回」と数える",
    ],
    where: "カレンダー",
    tip: "2回ごとに1段階濃くなり、9回以上で一番濃い色になります",
    Diagram: HeatmapDiagram,
  },
  {
    id: "e1rm",
    icon: Activity,
    title: "推定1RMグラフ",
    lead: "記録した重量と回数から「1回だけなら挙げられる最大重量」を計算し、伸びをグラフにします",
    steps: [
      "メニューを開いて記録するたびに、自動でグラフに点が増える",
      "記録が2回以上になると線になる。右上の「最高」が今までのベスト",
    ],
    where: "記録画面の上部",
    tip: "記録するたびに点が増えます。右上の「最高」が今までのベストです",
    Diagram: E1rmDiagram,
  },
];

export const guideOf = (id: ProFeature) => GUIDES.find((g) => g.id === id)!;

const box = "rounded-xl bg-white/80 px-2 py-1.5 text-center text-[11px] font-bold";

function RestDiagram() {
  const max = Math.max(...Object.values(DEFAULT_REST));
  return (
    <div className="space-y-2" data-testid="diagram-rest">
      {(["W", "N", "D"] as const).map((t, i) => (
        <div key={t} className="flex items-center gap-2">
          <span className="w-12 shrink-0 font-display text-[11px] font-bold text-mute">SET {i + 1}</span>
          <span className="rounded px-1.5 font-display text-[11px] font-extrabold text-white" style={{ background: SET_TYPE[t].color }}>
            {t}
          </span>
          <Timer size={14} className="shrink-0 text-rest" />
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-900/6">
            <motion.div
              className="h-full rounded-full bg-rest"
              initial={{ width: 0 }}
              animate={{ width: `${(DEFAULT_REST[t] / max) * 100}%` }}
              transition={{ delay: 0.15 * i, duration: 0.5 }}
            />
          </div>
          <span className="w-10 shrink-0 text-right text-[11px] font-extrabold">{DEFAULT_REST[t]}秒</span>
        </div>
      ))}
      <p className="text-[10px] font-semibold text-mute">例: W {SET_TYPE.W.label} / N {SET_TYPE.N.label} / D {SET_TYPE.D.label}。秒数は初期設定</p>
    </div>
  );
}

function SupersetDiagram() {
  const steps = [
    { label: "種目A", cls: "bg-accent text-white" },
    { label: "移動", cls: "bg-ready text-ink" },
    { label: "種目B", cls: "bg-accent text-white" },
    { label: "本休憩", cls: "bg-rest text-white" },
  ];
  return (
    <div data-testid="diagram-superset">
      <div className="flex items-center gap-1">
        {steps.map((s, i) => (
          <div key={s.label} className="flex flex-1 items-center gap-1">
            <motion.span
              className={`flex-1 rounded-xl px-1 py-2 text-center text-[11px] font-extrabold ${s.cls}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 * i }}
            >
              {s.label}
            </motion.span>
            {i < steps.length - 1 && <ArrowRight size={12} className="shrink-0 text-mute" />}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-center gap-1 text-[11px] font-bold text-mute">
        <Repeat size={13} /> セット数のぶん繰り返す
      </div>
    </div>
  );
}

function TempoDiagram() {
  const parts = [
    { label: "下ろす", sec: 3 },
    { label: "止める", sec: 1 },
    { label: "挙げる", sec: 2 },
    { label: "締める", sec: 0 },
  ];
  return (
    <div data-testid="diagram-tempo">
      <div className="grid grid-cols-4 gap-1.5">
        {parts.map((p, i) => (
          <motion.div key={p.label} className={box} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 * i }}>
            <span className="block text-[10px] text-mute">{p.label}</span>
            <span className="font-display text-xl font-extrabold">{p.sec}</span>
            <span className="text-[10px] text-mute">秒</span>
          </motion.div>
        ))}
      </div>
      <p className="mt-2 text-center text-[11px] font-bold">
        3-1-2-0 = 1回 6秒 × 10回 → <span className="text-accent">TUT 60秒</span>
      </p>
    </div>
  );
}

function HeatmapDiagram() {
  return (
    <div data-testid="diagram-heatmap">
      <div className="grid grid-cols-6 gap-1">
        {HEAT_COLORS.map((c, i) => (
          <div key={c} className="text-center">
            <motion.span
              className="block h-8 rounded-lg"
              style={{ background: c }}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ delay: 0.08 * i }}
            />
            <span className="mt-1 block text-[9px] font-bold text-mute">{i === 0 ? "0回" : heatRange(i)}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-center text-[11px] font-bold">例: 今月 胸を5回 → 3段階目の色</p>
    </div>
  );
}

function E1rmDiagram() {
  return (
    <div data-testid="diagram-e1rm">
      <svg viewBox="0 0 200 60" className="w-full">
        <motion.path
          d="M8 50 L60 42 L110 34 L150 26 L192 12"
          fill="none"
          stroke="#ff4f00"
          strokeWidth={3}
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.8 }}
        />
        {[
          [8, 50],
          [60, 42],
          [110, 34],
          [150, 26],
          [192, 12],
        ].map(([x, y]) => (
          <circle key={x} cx={x} cy={y} r={3} fill="#fff" stroke="#ff4f00" strokeWidth={2} />
        ))}
      </svg>
      <p className="mt-1 text-center text-[11px] font-bold">
        60kg × 10回 → 推定1RM <span className="text-accent">80kg</span>
      </p>
      <p className="text-center text-[10px] font-semibold text-mute">計算式: 重量 + 重量 × 回数 ÷ 30</p>
    </div>
  );
}

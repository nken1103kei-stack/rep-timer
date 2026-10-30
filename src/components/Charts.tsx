import { motion } from "motion/react";
import { CATEGORIES, displayWeight, type CategoryId, type Unit } from "../lib/catalog";
import { unitLabel } from "../lib/stats";

const color = (id: CategoryId) => CATEGORIES.find((c) => c.id === id)!.color;

/** Front and back silhouettes; each muscle group is tinted by how many sets it got. */
export function BodyHeatmap({ counts }: { counts: Partial<Record<CategoryId, number>> }) {
  const max = Math.max(1, ...Object.values(counts).map((v) => v ?? 0));
  const fill = (id: CategoryId) => {
    const n = counts[id] ?? 0;
    return { fill: n ? color(id) : "rgb(15 23 42 / 0.08)", fillOpacity: n ? 0.25 + 0.75 * (n / max) : 1 };
  };
  const part = (id: CategoryId, d: string, key: string) => (
    <motion.path
      key={key}
      d={d}
      data-part={id}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      {...fill(id)}
      stroke="#fff"
      strokeWidth={1.5}
    />
  );
  const figure = (side: "front" | "back") => (
    <svg viewBox="0 0 100 200" className="h-44" aria-label={side === "front" ? "体の前面" : "体の背面"}>
      <circle cx="50" cy="16" r="11" fill="rgb(15 23 42 / 0.1)" />
      {part("shoulder", "M27 34 Q22 36 20 48 L30 50 L34 36 Z", "sl")}
      {part("shoulder", "M73 34 Q78 36 80 48 L70 50 L66 36 Z", "sr")}
      {side === "front"
        ? [
            part("chest", "M35 34 L65 34 L68 52 Q50 58 32 52 Z", "c"),
            part("abs", "M36 56 Q50 60 64 56 L62 92 L38 92 Z", "a"),
          ]
        : [part("back", "M35 34 L65 34 L68 60 L62 92 L38 92 L32 60 Z", "b")]}
      {part("arms", "M19 51 L30 53 L28 80 L24 100 L16 98 L17 76 Z", "al")}
      {part("arms", "M81 51 L70 53 L72 80 L76 100 L84 98 L83 76 Z", "ar")}
      {part("legs", "M37 95 L49 95 L48 140 L46 186 L38 186 L35 140 Z", "ll")}
      {part("legs", "M63 95 L51 95 L52 140 L54 186 L62 186 L65 140 Z", "lr")}
    </svg>
  );
  return (
    <div data-testid="heatmap">
      <div className="flex items-end justify-center gap-6">
        {figure("front")}
        {figure("back")}
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {CATEGORIES.filter((c) => c.id !== "other").map((c) => (
          <div key={c.id} className="flex items-center justify-between rounded-lg bg-white/70 px-2 py-1 text-[11px] font-bold" data-testid="heat-cell" data-cat={c.id}>
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full" style={{ background: c.color, opacity: counts[c.id] ? 1 : 0.25 }} />
              {c.label}
            </span>
            <span className={counts[c.id] ? "" : "text-slate-400"}>{counts[c.id] ?? 0}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Estimated 1RM over time as a line with a soft area underneath. */
export function E1rmChart({ points, unit }: { points: { at: number; value: number }[]; unit: Unit }) {
  if (points.length < 2) {
    return (
      <div className="glass rounded-2xl px-4 py-6 text-center text-xs font-semibold text-mute" data-testid="e1rm-chart" data-points={points.length}>
        記録が2回以上になると推定1RMのグラフが表示されます
      </div>
    );
  }
  const vals = points.map((p) => displayWeight(p.value, unit));
  const lo = Math.min(...vals) * 0.95;
  const hi = Math.max(...vals) * 1.03;
  const W = 300;
  const H = 110;
  const x = (i: number) => 12 + (i / (points.length - 1)) * (W - 24);
  const y = (v: number) => H - 14 - ((v - lo) / Math.max(1e-6, hi - lo)) * (H - 28);
  const line = vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const best = Math.max(...vals);
  const last = vals[vals.length - 1];
  const fmt = (v: number) => (Math.round(v * 10) / 10).toString();
  return (
    <div className="glass rounded-2xl p-3" data-testid="e1rm-chart" data-points={points.length}>
      <div className="flex items-baseline justify-between px-1">
        <span className="text-xs font-bold text-mute">推定1RM</span>
        <span className="font-display text-lg font-extrabold italic">
          {fmt(last)}
          <span className="ml-0.5 text-xs text-mute">{unitLabel(unit)}</span>
          <span className="ml-2 text-xs font-bold text-mute" data-testid="e1rm-best">
            最高 {fmt(best)}
          </span>
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 w-full">
        <defs>
          <linearGradient id="e1rm-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#ff4f00" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#ff4f00" stopOpacity="0" />
          </linearGradient>
        </defs>
        <motion.path d={`${line} L${x(vals.length - 1)} ${H} L${x(0)} ${H} Z`} fill="url(#e1rm-fill)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
        <motion.path
          d={line}
          fill="none"
          stroke="#ff4f00"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
        {vals.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r={v === best ? 4 : 2.5} fill={v === best ? "#ff4f00" : "#fff"} stroke="#ff4f00" strokeWidth={2} />
        ))}
      </svg>
    </div>
  );
}

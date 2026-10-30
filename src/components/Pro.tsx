import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { Activity, BadgeCheck, Ban, Crown, Flame, Layers, Lock, Metronome, Timer } from "lucide-react";
import { openBilling, usePro, useSession } from "../lib/sync";
import { haptic } from "../lib/feedback";
import { PrimaryButton, Sheet } from "./ui";

import { openProSheet, useProSheet } from "../lib/proSheet";

export { openProSheet, useProSheet };

/** Runs `action` for Pro users; everyone else sees the upgrade sheet. */
export function useProGate() {
  const pro = usePro();
  return (action: () => void) => () => {
    if (pro) action();
    else {
      haptic(10);
      openProSheet();
    }
  };
}

export function ProBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full bg-gradient-to-r from-[#ff4f00] to-[#ff9f0a] px-1.5 py-px text-[9px] font-extrabold tracking-wider text-white ${className}`}
    >
      <Crown size={9} strokeWidth={3} /> PRO
    </span>
  );
}

/** Covers a Pro-only panel for free users; tapping opens the upgrade sheet. */
export function ProLock({ children, label, testId }: { children: ReactNode; label: string; testId?: string }) {
  const pro = usePro();
  if (pro) return <>{children}</>;
  return (
    <div className="relative" data-testid={testId}>
      <div aria-hidden className="pointer-events-none blur-[6px] select-none">
        {children}
      </div>
      <motion.button
        type="button"
        whileTap={{ scale: 0.97 }}
        onClick={() => openProSheet()}
        className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-2xl bg-white/40 text-sm font-bold"
        data-testid="pro-lock"
      >
        <span className="grid size-9 place-items-center rounded-full bg-ink text-white">
          <Lock size={16} />
        </span>
        {label}
        <ProBadge />
      </motion.button>
    </div>
  );
}

const FEATURES = [
  { icon: Ban, title: "広告なし", text: "画面がすっきり。トレーニングに集中" },
  { icon: Timer, title: "セット別の休憩タイマー", text: "W・N・D ごとに休憩時間が自動で切り替わり、休憩中も次のセットとプレートの組み合わせが見える" },
  { icon: Layers, title: "スーパーセットタイマー", text: "種目A → 移動 → 種目B → 本休憩 の2段階を自動で進行" },
  { icon: Metronome, title: "テンポ・メトロノーム", text: "下ろす・止める・挙げる・締めるを音と振動でカウント。TUT も記録" },
  { icon: Flame, title: "部位ヒートマップ", text: "どこを鍛えて、どこをサボっているかが一目でわかる" },
  { icon: Activity, title: "推定1RMグラフ", text: "種目ごとの最大挙上重量の伸びをグラフで確認" },
];

export function ProSheet({ onLogin }: { onLogin: () => void }) {
  const open = useProSheet((s) => s.open);
  const close = () => useProSheet.setState({ open: false });
  const { user, plan, billing } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => () => void (mounted.current = false), []);

  const go = async (kind: "checkout" | "portal") => {
    setBusy(true);
    setError(null);
    try {
      await openBilling(kind);
    } catch {
      if (mounted.current) setError("決済ページを開けませんでした。時間をおいて再度お試しください");
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={close} testId="pro-sheet" title={<span className="flex items-center gap-2">REPS Pro <ProBadge /></span>}>
      <div className="space-y-3 pt-1 pb-2">
        <ul className="space-y-2">
          {FEATURES.map((f, i) => (
            <motion.li
              key={f.title}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0, transition: { delay: 0.04 * i } }}
              className="glass flex items-start gap-3 rounded-2xl p-3"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent/12 text-accent">
                <f.icon size={18} strokeWidth={2.4} />
              </span>
              <span>
                <span className="block text-sm font-bold">{f.title}</span>
                <span className="block text-xs leading-relaxed text-mute">{f.text}</span>
              </span>
            </motion.li>
          ))}
        </ul>
        <p className="text-center text-[11px] font-semibold text-mute">記録・履歴・カスタム種目・CSV の読み書きは無料のまま使えます</p>

        {plan.pro ? (
          <>
            <div className="glass flex items-center justify-center gap-2 rounded-2xl p-3 text-sm font-bold" data-testid="pro-active">
              <BadgeCheck size={18} className="text-go" /> Pro を利用中
              {plan.until && <span className="text-mute">· 次回更新 {new Date(plan.until).toLocaleDateString("ja-JP")}</span>}
            </div>
            <PrimaryButton tone="ghost" testId="pro-manage" disabled={busy} onClick={() => void go("portal")}>
              プランの管理・解約
            </PrimaryButton>
          </>
        ) : !billing.enabled ? (
          <PrimaryButton testId="pro-subscribe" disabled onClick={() => undefined}>
            準備中
          </PrimaryButton>
        ) : !user ? (
          <PrimaryButton
            testId="pro-login"
            onClick={() => {
              close();
              onLogin();
            }}
          >
            Google でログインして登録
          </PrimaryButton>
        ) : (
          <PrimaryButton testId="pro-subscribe" disabled={busy} onClick={() => void go("checkout")}>
            Pro に登録する（{billing.price}）
          </PrimaryButton>
        )}
        {!plan.pro && <p className="text-center text-[11px] text-mute">いつでも解約できます。解約後も期間の終わりまで Pro を使えます</p>}
        {error && <p className="text-center text-sm font-semibold text-danger">{error}</p>}
      </div>
    </Sheet>
  );
}

type AdsWindow = { adsbygoogle?: unknown[] };
let adsScript: Promise<void> | null = null;
function loadAds(client: string) {
  adsScript ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
    s.async = true;
    s.crossOrigin = "anonymous";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("ads"));
    document.head.appendChild(s);
  });
  return adsScript;
}

/** Free plan only. A silent display banner: never video or sound, so music keeps playing. */
export function AdSlot({ className = "" }: { className?: string }) {
  const pro = usePro();
  const ads = useSession((s) => s.ads);
  const ins = useRef<HTMLModElement>(null);

  useEffect(() => {
    if (pro || !ads) return;
    loadAds(ads.client)
      .then(() => {
        const w = window as unknown as AdsWindow;
        (w.adsbygoogle ??= []).push({});
      })
      .catch(() => undefined);
  }, [pro, ads]);

  if (pro) return null;
  return (
    <div className={`relative ${className}`} data-testid="ad-slot" data-kind={ads ? "adsense" : "house"}>
      <span className="absolute top-2 left-3 z-10 rounded bg-slate-900/8 px-1 text-[9px] font-bold text-mute">広告</span>
      {ads ? (
        <ins
          ref={ins}
          className="adsbygoogle glass block min-h-[90px] overflow-hidden rounded-[22px]"
          style={{ display: "block" }}
          data-ad-client={ads.client}
          data-ad-slot={ads.slot}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      ) : (
        <motion.button
          type="button"
          whileTap={{ scale: 0.98 }}
          onClick={() => openProSheet()}
          className="glass sheen flex h-[76px] w-full items-center gap-3 rounded-[22px] px-4 pt-2 text-left"
        >
          <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-[#ff4f00] to-[#ff9f0a] text-white">
            <Crown size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold">広告なしで集中するなら REPS Pro</span>
            <span className="block truncate text-xs text-mute">休憩タイマー・テンポ・ヒートマップも</span>
          </span>
        </motion.button>
      )}
    </div>
  );
}

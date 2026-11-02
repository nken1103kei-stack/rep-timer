import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BadgeCheck, Ban, ChevronLeft, ChevronRight, Crown, Lock, type LucideIcon } from "lucide-react";
import { openBilling, usePro, useSession } from "../lib/sync";
import { haptic } from "../lib/feedback";
import { PrimaryButton, Sheet } from "./ui";
import { GUIDES, guideOf, type FeatureGuide } from "./ProGuide";
import { closeCoach, coachFirst, useCoach } from "../lib/coach";

import { openProSheet, useProSheet, type ProFeature } from "../lib/proSheet";

export { openProSheet, useProSheet };

/**
 * Runs `action` for Pro users (after a one-time coach mark when `feature` is given);
 * everyone else sees the upgrade sheet, opened on that feature's page.
 */
export function useProGate() {
  const pro = usePro();
  return (action: () => void, feature?: ProFeature, el?: Element | null) => () => {
    if (pro) {
      if (feature) coachFirst(feature, el ?? null, action);
      else action();
    } else {
      haptic(10);
      openProSheet(feature ?? null);
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

/**
 * Covers a Pro-only panel for free users; tapping opens the upgrade sheet on that feature's page.
 * For Pro users the panel is live, and the first tap on it shows the feature's coach mark.
 */
export function ProLock({ children, label, testId, feature }: { children: ReactNode; label: string; testId?: string; feature: ProFeature }) {
  const pro = usePro();
  if (pro) return <div onClickCapture={(e) => coachFirst(feature, e.currentTarget)}>{children}</div>;
  return (
    <div className="relative" data-testid={testId}>
      <div aria-hidden className="pointer-events-none blur-[6px] select-none">
        {children}
      </div>
      <motion.button
        type="button"
        whileTap={{ scale: 0.97 }}
        onClick={() => openProSheet(feature)}
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

export function ProSheet({ onLogin }: { onLogin: () => void }) {
  const open = useProSheet((s) => s.open);
  const page = useProSheet((s) => s.page);
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

  const action =
    plan.status === "owner" ? null : plan.pro ? (
      <PrimaryButton tone="ghost" testId="pro-manage" disabled={busy} onClick={() => void go("portal")}>
        プランの管理・解約
      </PrimaryButton>
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
    );

  return (
    <Sheet
      open={open}
      onClose={close}
      testId="pro-sheet"
      title={
        page ? (
          <button
            type="button"
            onClick={() => useProSheet.setState({ page: null })}
            className="flex items-center gap-1 text-base font-bold text-mute"
            data-testid="pro-back"
          >
            <ChevronLeft size={20} /> REPS Pro
          </button>
        ) : (
          <span className="flex items-center gap-2">
            REPS Pro <ProBadge />
          </span>
        )
      }
      // The buttons stay on their own band, so they are there on every page.
      footer={
        (action || error || !plan.pro) && (
          <div className="space-y-2 pb-1">
            {action}
            {!plan.pro && <p className="text-center text-[11px] text-mute">いつでも解約できます。解約後も期間の終わりまで Pro を使えます</p>}
            {error && <p className="text-center text-sm font-semibold text-danger">{error}</p>}
          </div>
        )
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        {page ? (
          <motion.div key={page} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: 0.18 }}>
            <FeaturePage guide={guideOf(page)} />
          </motion.div>
        ) : (
          <motion.div key="list" initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.18 }}>
            <FeatureList />
          </motion.div>
        )}
      </AnimatePresence>
    </Sheet>
  );
}

/** The join page: feature names only, each opening its own explanation page. */
function FeatureList() {
  return (
    <div className="space-y-3 pt-1 pb-2">
      <PlanStatus />
      <p className="px-1 text-xs font-bold text-mute" data-testid="pro-terms-note">
        加入ページには Pro で追加される機能の用語（名前）のみを載せています。名前をタップすると、その機能の説明ページ（図つき）が開きます
      </p>
      <ul className="glass divide-y divide-slate-900/6 overflow-hidden rounded-2xl">
        <li className="flex items-center gap-3 px-3 py-3" data-testid="pro-feature" data-feature="ads">
          <FeatureIcon icon={Ban} />
          <span className="flex-1 text-sm font-bold">広告なし</span>
        </li>
        {GUIDES.map((g) => (
          <li key={g.id}>
            <button
              type="button"
              onClick={() => {
                haptic(6);
                useProSheet.setState({ page: g.id });
              }}
              className="flex w-full items-center gap-3 px-3 py-3 text-left active:bg-slate-900/5"
              data-testid="pro-feature"
              data-feature={g.id}
            >
              <FeatureIcon icon={g.icon} />
              <span className="flex-1 text-sm font-bold">{g.title}</span>
              <ChevronRight size={18} className="text-mute" />
            </button>
          </li>
        ))}
      </ul>
      <p className="text-center text-[11px] font-semibold text-mute">
        画面では <Crown size={10} strokeWidth={3} className="inline text-accent" /> と <ProBadge /> の付いた所が Pro の機能です。記録・履歴・カスタム種目・CSV の読み書きは無料のまま使えます
      </p>
    </div>
  );
}

function FeatureIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent/12 text-accent">
      <Icon size={18} strokeWidth={2.4} />
    </span>
  );
}

/** One Pro feature explained: what it does, a diagram, how to use it and where it lives. */
function FeaturePage({ guide }: { guide: FeatureGuide }) {
  return (
    <div className="space-y-3 pt-1 pb-2" data-testid="pro-page" data-feature={guide.id}>
      <div className="flex items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#ff4f00] to-[#ff9f0a] text-white">
          <guide.icon size={24} strokeWidth={2.4} />
        </span>
        <h2 className="text-lg leading-tight font-extrabold">{guide.title}</h2>
      </div>
      <p className="text-sm leading-relaxed font-semibold">{guide.lead}</p>
      <div className="glass rounded-2xl p-3">
        <guide.Diagram />
      </div>
      <div>
        <div className="mb-1.5 px-1 text-xs font-extrabold text-mute">使い方</div>
        <ol className="space-y-1.5">
          {guide.steps.map((step, i) => (
            <li key={step} className="flex gap-2 text-sm leading-relaxed">
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-ink font-display text-[11px] font-bold text-white">{i + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      </div>
      <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-bold text-accent" data-testid="pro-where">
        <Crown size={11} strokeWidth={3} /> 場所: {guide.where}
      </span>
    </div>
  );
}

/** A spotlight on the tapped Pro control with a short explanation; shown once per feature. */
export function CoachMark() {
  const active = useCoach((s) => s.active);
  const guide = active && guideOf(active.feature);
  const pad = 6;
  const r = active?.rect;
  // The bubble goes on the roomier side of the spotlight.
  const below = r ? r.top + r.height / 2 < window.innerHeight / 2 : true;
  return (
    <AnimatePresence>
      {active && guide && r && (
        <motion.div
          key="coach"
          className="fixed inset-0 z-[80]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          data-testid="coach-mark"
          data-feature={active.feature}
          role="dialog"
          aria-modal="true"
          aria-label={guide.title}
        >
          <div
            className="absolute rounded-2xl shadow-[0_0_0_9999px_rgb(11_12_15/0.62)] ring-2 ring-white"
            style={{ left: r.left - pad, top: r.top - pad, width: r.width + pad * 2, height: r.height + pad * 2 }}
          />
          <motion.div
            initial={{ y: below ? -8 : 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="absolute inset-x-4 mx-auto max-w-sm rounded-3xl bg-white p-4 shadow-2xl"
            style={
              below
                ? { top: Math.max(16, Math.min(r.bottom + pad + 14, window.innerHeight - 260)) }
                : { bottom: Math.max(16, Math.min(window.innerHeight - r.top + pad + 14, window.innerHeight - 260)) }
            }
          >
            <div className="mb-1.5 flex items-center gap-2 text-sm font-extrabold">
              <FeatureIcon icon={guide.icon} />
              <span className="flex-1">{guide.title}</span>
              <ProBadge />
            </div>
            <p className="text-[13px] leading-relaxed font-semibold">{guide.lead}</p>
            <p className="mt-1.5 text-xs leading-relaxed text-mute" data-testid="coach-tip">{guide.tip}</p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="h-10 flex-1 rounded-full bg-slate-900/6 text-sm font-bold"
                data-testid="coach-more"
                onClick={() => {
                  closeCoach(false);
                  openProSheet(active.feature);
                }}
              >
                図で詳しく
              </button>
              <button type="button" className="h-10 flex-1 rounded-full bg-ink text-sm font-bold text-white" data-testid="coach-ok" onClick={() => closeCoach()}>
                わかった
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** The current plan, spelled out at the top of the Pro sheet: 加入済み (with renewal date) or 未加入. */
function PlanStatus() {
  const plan = useSession((s) => s.plan);
  if (!plan.pro) {
    return (
      <div className="glass flex items-center gap-3 rounded-2xl p-3" data-testid="plan-status" data-pro="false">
        <span className="rounded-full bg-slate-900/8 px-2.5 py-1 text-xs font-extrabold text-mute">未加入</span>
        <span className="text-sm font-bold">いまは無料プランです</span>
      </div>
    );
  }
  const owner = plan.status === "owner";
  return (
    <div
      className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-[#ff4f00] to-[#ff9f0a] p-3.5 text-white shadow-[0_12px_28px_-12px_rgb(255_79_0/0.8)]"
      data-testid="plan-status"
      data-pro="true"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white/25">
        <BadgeCheck size={24} strokeWidth={2.4} />
      </span>
      <span className="min-w-0">
        <span className="block text-lg leading-tight font-extrabold" data-testid="pro-active" data-owner={owner || undefined}>
          Pro 加入済み
        </span>
        <span className="block text-xs font-semibold text-white/90">
          {owner
            ? "製作者アカウント · Pro をすべて利用中"
            : plan.until
              ? `すべての Pro 機能を利用中 · 次回更新 ${new Date(plan.until).toLocaleDateString("ja-JP")}`
              : "すべての Pro 機能を利用中"}
        </span>
      </span>
    </div>
  );
}

type AdsWindow ={ adsbygoogle?: unknown[] };
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

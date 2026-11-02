import { create } from "zustand";
import { pickData, useStore } from "./store";
import type { AppData } from "./types";

export type User = { id: string; email: string; name: string | null; picture: string | null };
export type SyncStatus = "off" | "syncing" | "synced" | "error";
export type Plan = { pro: boolean; status: string | null; until: number | null };
type Config = {
  googleClientId: string | null;
  billing?: { enabled: boolean; price: string };
  ads?: { client: string; slot: string } | null;
};

type Session = {
  ready: boolean;
  clientId: string | null;
  user: User | null;
  status: SyncStatus;
  syncedAt: number | null;
  plan: Plan;
  billing: { enabled: boolean; price: string };
  ads: { client: string; slot: string } | null;
};

const FREE: Plan = { pro: false, status: null, until: null };

export const useSession = create<Session>(() => ({
  ready: false,
  clientId: null,
  user: null,
  status: "off",
  syncedAt: null,
  plan: FREE,
  billing: { enabled: false, price: "" },
  ads: null,
}));

/** Pro is tied to the Google account; signed out means the free plan. */
export const usePro = () => useSession((s) => s.plan.pro);

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "same-origin",
    signal: AbortSignal.timeout(6000),
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json() as Promise<T>;
}

export async function bootstrap() {
  const [config, me] = await Promise.allSettled([api<Config>("/config"), api<{ user: User; plan?: Plan }>("/me")]);
  const user = me.status === "fulfilled" ? me.value.user : null;
  const cfg = config.status === "fulfilled" ? config.value : null;
  useSession.setState({
    ready: true,
    clientId: cfg?.googleClientId ?? null,
    billing: cfg?.billing ?? { enabled: false, price: "" },
    ads: cfg?.ads ?? null,
    user,
    plan: (me.status === "fulfilled" && me.value.plan) || FREE,
  });
  if (user) void pull();
}

export async function refreshPlan() {
  try {
    const me = await api<{ user: User; plan?: Plan }>("/me");
    useSession.setState({ user: me.user, plan: me.plan ?? FREE });
  } catch {
    // Keep the current state when offline.
  }
}

/** Opens Stripe Checkout (or the customer portal when already Pro). */
export async function openBilling(kind: "checkout" | "portal") {
  const { url } = await api<{ url: string }>(`/billing/${kind}`, { method: "POST" });
  window.location.assign(url);
}

async function pull() {
  useSession.setState({ status: "syncing" });
  try {
    const remote = await api<{ data: AppData | null; updatedAt: number }>("/data");
    const local = useStore.getState();
    if (remote.data && remote.updatedAt > local.updatedAt) {
      useStore.getState().replaceData(remote.data, remote.updatedAt);
      // Server data from an earlier day still gets today's empty menu list.
      useStore.getState().startDay();
      useSession.setState({ status: "synced", syncedAt: Date.now() });
    } else if (local.updatedAt > remote.updatedAt) {
      await push();
    } else {
      useSession.setState({ status: "synced", syncedAt: Date.now() });
    }
  } catch {
    useSession.setState({ status: "error" });
  }
}

async function push() {
  const s = useStore.getState();
  useSession.setState({ status: "syncing" });
  try {
    await api("/data", { method: "PUT", body: JSON.stringify({ data: pickData(s), updatedAt: s.updatedAt }) });
    useSession.setState({ status: "synced", syncedAt: Date.now() });
  } catch {
    useSession.setState({ status: "error" });
  }
}

let pushTimer: ReturnType<typeof setTimeout> | undefined;
useStore.subscribe((s, prev) => {
  if (!useSession.getState().user) return;
  const keys = ["exercises", "logs", "presets", "customLibrary", "unit", "restTimes", "menuDay", "archive"] as const;
  if (keys.every((k) => s[k] === prev[k])) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(push, 1200);
});

export async function signInWithGoogle(credential: string) {
  const { user } = await api<{ user: User }>("/auth/google", {
    method: "POST",
    body: JSON.stringify({ credential }),
  });
  useSession.setState({ user });
  await refreshPlan();
  await pull();
}

export async function signOut() {
  await api("/auth/logout", { method: "POST" }).catch(() => undefined);
  useSession.setState({ user: null, status: "off", syncedAt: null, plan: FREE });
}

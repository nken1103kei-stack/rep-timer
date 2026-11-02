import { create } from "zustand";
import { normalizeData, pickData, useStore } from "./store";
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

/**
 * Sends this device's copy; the server merges it with its own (records from both are kept) and returns the result,
 * which this device adopts. Used on start, on sign-in, after every change, and when the app comes back or goes online.
 */
let syncing: Promise<void> | null = null;
let again = false;
let adopting = false;

async function sync(): Promise<void> {
  if (syncing) {
    again = true;
    return syncing;
  }
  syncing = (async () => {
    const sent = useStore.getState();
    useSession.setState({ status: "syncing" });
    try {
      const res = await api<{ data?: AppData; updatedAt?: number }>("/data", {
        method: "PUT",
        body: JSON.stringify({ data: pickData(sent), updatedAt: sent.updatedAt }),
      });
      const now = useStore.getState();
      // Changed again while the request was out: that change syncs next, carrying this merge with it.
      if (res.data && typeof res.updatedAt === "number" && now.updatedAt === sent.updatedAt) {
        if (JSON.stringify(pickData(normalizeData(res.data))) !== JSON.stringify(pickData(now))) {
          adopting = true;
          now.replaceData(res.data, res.updatedAt);
          // Server data from an earlier day still gets today's empty menu list.
          useStore.getState().startDay();
          adopting = false;
        }
      }
      useSession.setState({ status: "synced", syncedAt: Date.now() });
    } catch {
      useSession.setState({ status: "error" });
    }
  })();
  await syncing;
  syncing = null;
  if (again) {
    again = false;
    await sync();
  }
}

const pull = sync;

let pushTimer: ReturnType<typeof setTimeout> | undefined;
useStore.subscribe((s, prev) => {
  if (!useSession.getState().user || adopting) return;
  const keys = ["exercises", "logs", "presets", "customLibrary", "unit", "restTimes", "menuDay", "archive", "deletedLogs"] as const;
  if (keys.every((k) => s[k] === prev[k])) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => void sync(), 1200);
});

// A tab left open, or a phone back from a gym without signal, catches up before anything else happens.
if (typeof window !== "undefined") {
  const catchUp = () => {
    if (useSession.getState().user && document.visibilityState === "visible") void sync();
  };
  document.addEventListener("visibilitychange", catchUp);
  window.addEventListener("online", catchUp);
}

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

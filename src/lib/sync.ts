import { create } from "zustand";
import { pickData, useStore } from "./store";
import type { AppData } from "./types";

export type User = { id: string; email: string; name: string | null; picture: string | null };
export type SyncStatus = "off" | "syncing" | "synced" | "error";

type Session = {
  ready: boolean;
  clientId: string | null;
  user: User | null;
  status: SyncStatus;
  syncedAt: number | null;
};

export const useSession = create<Session>(() => ({
  ready: false,
  clientId: null,
  user: null,
  status: "off",
  syncedAt: null,
}));

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
  const [config, me] = await Promise.allSettled([
    api<{ googleClientId: string | null }>("/config"),
    api<{ user: User }>("/me"),
  ]);
  const user = me.status === "fulfilled" ? me.value.user : null;
  useSession.setState({
    ready: true,
    clientId: config.status === "fulfilled" ? config.value.googleClientId : null,
    user,
  });
  if (user) void pull();
}

async function pull() {
  useSession.setState({ status: "syncing" });
  try {
    const remote = await api<{ data: AppData | null; updatedAt: number }>("/data");
    const local = useStore.getState();
    if (remote.data && remote.updatedAt > local.updatedAt) {
      useStore.getState().replaceData(remote.data, remote.updatedAt);
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
  if (s.exercises === prev.exercises && s.logs === prev.logs && s.presets === prev.presets) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(push, 1200);
});

export async function signInWithGoogle(credential: string) {
  const { user } = await api<{ user: User }>("/auth/google", {
    method: "POST",
    body: JSON.stringify({ credential }),
  });
  useSession.setState({ user });
  await pull();
}

export async function signOut() {
  await api("/auth/logout", { method: "POST" }).catch(() => undefined);
  useSession.setState({ user: null, status: "off", syncedAt: null });
}

import { useEffect, useRef, useState } from "react";

/** What a running timer says outside the app: the tab title, and a notification while the app is in the background. */
export type BackgroundStatus = { title: string; body: string };

const TAG = "reps-timer";
const BASE_TITLE = "REPS";

export const notificationsSupported = () => typeof window !== "undefined" && "Notification" in window;

/** Time left as m:ss even under a minute ("0:05", not "5"), so a bare number never shows in a tab title. */
export function minSec(ms: number) {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

/** Clock time a countdown ends at, e.g. "10:45". Stays right even when the browser throttles a hidden page. */
export const endClock = (endAt: number) => new Date(endAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });

async function notify(status: BackgroundStatus) {
  if (!notificationsSupported() || Notification.permission !== "granted") return;
  const options: NotificationOptions = { body: status.body, tag: TAG, silent: true, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png" };
  try {
    // Android only shows notifications through the service worker; desktop accepts either.
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(status.title, options);
    else new Notification(status.title, options);
  } catch {
    // Notifications are a nice-to-have; the tab title still carries the time.
  }
}

async function clearNotification() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    for (const n of (await reg?.getNotifications({ tag: TAG })) ?? []) n.close();
  } catch {
    // Nothing to close.
  }
}

/**
 * While `describe` is set, keeps the tab title on the remaining time and, when the app is hidden,
 * a silent notification with the time left and the clock time it ends. `describe` is read fresh each tick.
 */
export function useBackgroundStatus(describe: ((now: number) => BackgroundStatus) | null) {
  const ref = useRef(describe);
  ref.current = describe;
  const active = describe !== null;

  useEffect(() => {
    if (!active) return;
    const tick = () => {
      const d = ref.current?.(Date.now());
      if (!d) return;
      document.title = `${d.title} · ${BASE_TITLE}`;
      if (document.visibilityState === "hidden") void notify(d);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void clearNotification();
      tick();
    };
    tick();
    const t = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisibility);
      document.title = BASE_TITLE;
      void clearNotification();
    };
  }, [active]);
}

/** Notification permission, asked only when the user taps the bell. */
export function useNotificationPermission() {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() =>
    notificationsSupported() ? Notification.permission : "unsupported",
  );
  const request = async () => {
    if (!notificationsSupported()) return;
    setPermission(await Notification.requestPermission());
  };
  return { permission, request };
}

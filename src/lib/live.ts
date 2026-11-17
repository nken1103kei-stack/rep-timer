/**
 * Live timer on the lock screen, the notification shade and the home screen's media controls.
 * Web apps have no widget of their own there, and a hidden page stops running, so a silent audio loop keeps the page
 * alive and the Media Session shows the phase and time left as "now playing". Playing it can pause music in other
 * apps, so the user can turn it off.
 */

const PREF = "reps-live-status";
const SILENCE_SEC = 20;
const SAMPLE_RATE = 8000;

let audio: HTMLAudioElement | null = null;
let shownTitle = "";
let shownPosition = "";

export const liveSupported = () => typeof navigator !== "undefined" && "mediaSession" in navigator && typeof Audio !== "undefined";
export const liveRunning = () => audio !== null;

/** On by default for cardio, where the phone is usually put away; otherwise only after the user turned it on. */
export function livePreferred(cardio: boolean) {
  try {
    const pref = localStorage.getItem(PREF);
    return pref === null ? cardio : pref === "on";
  } catch {
    return cardio;
  }
}

export function setLivePreferred(on: boolean) {
  try {
    localStorage.setItem(PREF, on ? "on" : "off");
  } catch {
    // Private mode: the choice just lasts for this timer.
  }
}

/** 8-bit PCM silence as a WAV blob: small enough to build on the spot, long enough to count as real media. */
function silenceUrl() {
  const samples = SILENCE_SEC * SAMPLE_RATE;
  const bytes = new Uint8Array(44 + samples);
  const view = new DataView(bytes.buffer);
  const text = (at: number, s: string) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  text(36, "data");
  view.setUint32(40, samples, true);
  bytes.fill(0x80, 44);
  return URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
}

/** Must be called from a tap: browsers only start audio from a user gesture. */
export function startLive() {
  if (!liveSupported() || audio) return;
  const el = new Audio(silenceUrl());
  el.loop = true;
  audio = el;
  shownTitle = "";
  shownPosition = "";
  el.play()
    .then(() => {
      if (audio === el) navigator.mediaSession.playbackState = "playing";
    })
    .catch(() => {
      // Refused (no gesture, or the OS said no): the tab title and notification still carry the time.
      if (audio === el) stopLive();
    });
}

export function stopLive() {
  if (!audio) return;
  audio.pause();
  URL.revokeObjectURL(audio.src);
  audio = null;
  navigator.mediaSession.metadata = null;
  navigator.mediaSession.playbackState = "none";
  for (const action of ["play", "pause"] as const) navigator.mediaSession.setActionHandler(action, null);
}

/**
 * The lock screen's play and pause buttons both flip the timer; the audio itself keeps running so the session stays alive.
 * Only while the app is hidden: browsers also send "pause" on their own as the audio starts, and in the app the timer has its own buttons.
 */
export function setLiveToggle(toggle: () => void) {
  if (!liveSupported()) return;
  const onAction = () => {
    if (document.visibilityState === "hidden") toggle();
  };
  for (const action of ["play", "pause"] as const) navigator.mediaSession.setActionHandler(action, onAction);
}

export type LiveStatus = { title: string; name: string; durationMs: number; positionMs: number; paused: boolean; /** e.g. "10:45:30 まで": stays true if the page is held back. */ until?: string };

/** Called every second. The title carries the time; the progress bar is only re-set when the phase or pause state changes. */
export function updateLive(s: LiveStatus) {
  if (!audio) return;
  const session = navigator.mediaSession;
  if (s.title !== shownTitle) {
    shownTitle = s.title;
    session.metadata = new MediaMetadata({
      title: s.title,
      artist: s.name,
      album: s.until ? `REPS · ${s.until}` : "REPS",
      artwork: [{ src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }],
    });
  }
  const position = `${s.durationMs}/${s.paused}`;
  if (position !== shownPosition && s.durationMs > 0) {
    shownPosition = position;
    session.playbackState = s.paused ? "paused" : "playing";
    try {
      session.setPositionState({
        duration: s.durationMs / 1000,
        position: Math.min(s.durationMs, Math.max(0, s.positionMs)) / 1000,
        playbackRate: 1,
      });
    } catch {
      // Older browsers: the title still carries the time.
    }
  }
}

/** An interruption such as a phone call stops the audio; coming back to the app starts it again. */
export function resumeLive() {
  if (audio?.paused) void audio.play().catch(() => undefined);
}

let ctx: AudioContext | null = null;

/** Must be called from a user gesture so mobile browsers allow audio later. */
export function unlockAudio() {
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
}

export function beep(freq = 880, duration = 0.12, volume = 0.25) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + duration);
}

export function haptic(pattern: number | number[] = 12) {
  navigator.vibrate?.(pattern);
}

let wakeLock: WakeLockSentinel | null = null;

export async function keepAwake(on: boolean) {
  try {
    if (on && !wakeLock) wakeLock = await navigator.wakeLock?.request("screen");
    if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch {
    wakeLock = null;
  }
}

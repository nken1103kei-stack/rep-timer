/**
 * The time left in a small floating window over other apps (Picture-in-Picture).
 * The page draws the time on a canvas each second and plays it as a muted video; the window shows that video.
 * It needs a tap to open, and browsers that cannot do it never show the button.
 */

export type PipFrame = { label: string; time: string; sub: string; color: string };

const W = 480;
const H = 270;

let canvas: HTMLCanvasElement | null = null;
let video: HTMLVideoElement | null = null;

type WebkitVideo = HTMLVideoElement & {
  webkitSupportsPresentationMode?: (mode: string) => boolean;
  webkitSetPresentationMode?: (mode: string) => void;
  webkitPresentationMode?: string;
};

export function pipSupported() {
  if (typeof document === "undefined" || typeof HTMLCanvasElement === "undefined" || !("captureStream" in HTMLCanvasElement.prototype)) return false;
  // Chrome and Android: the standard API. iPhone Safari: its own presentation mode.
  return document.pictureInPictureEnabled === true || "webkitSetPresentationMode" in HTMLVideoElement.prototype;
}

export function drawPip(f: PipFrame) {
  const ctx = canvas?.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#0b0c0f";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = f.color;
  ctx.fillRect(0, 0, W, 10);
  ctx.textAlign = "center";
  ctx.fillStyle = f.color;
  ctx.font = "800 34px system-ui, sans-serif";
  ctx.fillText(f.label, W / 2, 62);
  ctx.fillStyle = "#ffffff";
  ctx.font = "italic 800 130px system-ui, sans-serif";
  ctx.fillText(f.time, W / 2, 190);
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "600 24px system-ui, sans-serif";
  ctx.fillText(f.sub, W / 2, 240, W - 40);
}

/** Opens the window; must run from a tap. Returns whether it opened. `onLeave` runs when the user closes it. */
export async function openPip(first: PipFrame, onLeave: () => void): Promise<boolean> {
  if (!pipSupported()) return false;
  if (video && isOpen()) {
    closePip();
    onLeave();
    return false;
  }
  try {
    canvas ??= Object.assign(document.createElement("canvas"), { width: W, height: H });
    drawPip(first);
    if (!video) {
      const el = document.createElement("video") as WebkitVideo;
      el.muted = true;
      el.playsInline = true;
      el.setAttribute("playsinline", "");
      // In the page but out of sight: some browsers only float a video that is in the document.
      el.style.cssText = "position:fixed;left:0;bottom:0;width:2px;height:2px;opacity:0;pointer-events:none";
      el.srcObject = canvas.captureStream();
      el.addEventListener("leavepictureinpicture", onLeave);
      el.addEventListener("webkitpresentationmodechanged", () => el.webkitPresentationMode !== "picture-in-picture" && onLeave());
      document.body.appendChild(el);
      video = el;
    }
    await video.play();
    const v = video as WebkitVideo;
    if (document.pictureInPictureEnabled && v.requestPictureInPicture) await v.requestPictureInPicture();
    else v.webkitSetPresentationMode?.("picture-in-picture");
    return true;
  } catch {
    closePip();
    return false;
  }
}

function isOpen() {
  return !!video && (document.pictureInPictureElement === video || (video as WebkitVideo).webkitPresentationMode === "picture-in-picture");
}

export function closePip() {
  if (video && document.pictureInPictureElement === video) void document.exitPictureInPicture().catch(() => undefined);
  if (video) {
    video.pause();
    video.srcObject = null;
    video.remove();
  }
  video = null;
  canvas = null;
}

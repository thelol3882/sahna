/** A rectangle: stage pixels (1920×1080) or video pixels, depending on where it is used. */
export type Rect = { x: number; y: number; w: number; h: number };

export const STAGE = { w: 1920, h: 1080 };

/**
 * Where a rect given in VIDEO pixels lands on the stage, for a video that fills the stage with
 * object-fit cover or contain (centred, as the <video> element does it).
 */
export function videoToStage(r: Rect, video: { w: number; h: number }, fit: "cover" | "contain"): Rect {
  const s = fit === "cover" ? Math.max(STAGE.w / video.w, STAGE.h / video.h) : Math.min(STAGE.w / video.w, STAGE.h / video.h);
  const ox = (STAGE.w - video.w * s) / 2;
  const oy = (STAGE.h - video.h * s) / 2;
  return { x: ox + r.x * s, y: oy + r.y * s, w: r.w * s, h: r.h * s };
}

/** Radius of a circle centred at (cx, cy) that covers the whole stage. */
export function coverRadius(cx: number, cy: number) {
  return Math.ceil(Math.max(Math.hypot(cx, cy), Math.hypot(STAGE.w - cx, cy), Math.hypot(cx, STAGE.h - cy), Math.hypot(STAGE.w - cx, STAGE.h - cy))) + 40;
}

/** clip-path inset() that shows only `r` (stage px) with rounded corners. */
export function insetOf(r: Rect, radius: number) {
  return `inset(${r.y}px ${STAGE.w - r.x - r.w}px ${STAGE.h - r.y - r.h}px ${r.x}px round ${radius}px)`;
}

/**
 * Layout rect of an element in stage pixels, ignoring CSS transforms (so an entrance that is still
 * moving, or a scene that is scaled, does not change the result). Walks offsetParent up to `.stage`.
 */
export function stageRectOf(el: HTMLElement): Rect {
  let x = 0, y = 0;
  let n: HTMLElement | null = el;
  while (n && !n.classList.contains("stage")) {
    x += n.offsetLeft;
    y += n.offsetTop;
    n = n.offsetParent as HTMLElement | null;
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

export const clock = (s: number) => {
  const v = Math.max(0, Math.floor(Number.isFinite(s) ? s : 0));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`;
};

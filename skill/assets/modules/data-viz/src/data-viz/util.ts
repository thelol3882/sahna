import { counter } from "../ui/kit";
import { gsap } from "../gsap";

export type TL = gsap.core.Timeline;
export type Q = (sel: string) => Element[];
export type At = number | string;

/** All matches inside a chart root, in DOM order. */
export const $$ = (root: Element | null | undefined, sel: string): Element[] => (root ? Array.from(root.querySelectorAll(sel)) : []);
/** The chart root with data-viz=<id> inside a scene. */
export const vizEl = (q: Q, id: string): Element => {
  const el = q(`[data-viz="${id}"]`)[0];
  if (!el) throw new Error(`data-viz: no chart with id "${id}" in this scene`);
  return el;
};

/** Layout box of `el` relative to `root`, from offsets (ignores transforms, so it is safe at build time). */
export function layoutBox(el: HTMLElement, root: HTMLElement) {
  let x = 0, y = 0, n: HTMLElement | null = el;
  while (n && n !== root) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent as HTMLElement | null; }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

/**
 * Shared-element move (Flip-style) as a plain, seekable tween: `el` lands on `target`'s layout box
 * (centre to centre, uniform scale by height). Measured once from layout offsets at build time.
 */
export function fitTo(tl: TL, el: HTMLElement, target: HTMLElement, root: HTMLElement, at: At, vars: gsap.TweenVars = {}) {
  const a = layoutBox(el, root), b = layoutBox(target, root);
  const s = b.h / (a.h || 1);
  return tl.to(el, {
    x: b.x + b.w / 2 - (a.x + a.w / 2), y: b.y + b.h / 2 - (a.y + a.h / 2), scale: s,
    transformOrigin: "50% 50%", duration: 1.0, ease: "power3.inOut", ...vars,
  }, at);
}

/**
 * Text counter: the deck's one counter (`counter()` in src/ui/kit.tsx: seek-safe, writes nothing at build time,
 * so the markup holds the text shown before the count starts) plus `data-final` for scripts/viz_seek.py.
 */
export function countText(tl: TL, el: Element | undefined, from: number, to: number, at: At,
  format: (v: number) => string, duration = 1.2, ease = "power2.out") {
  if (!el) return tl;
  (el as HTMLElement).dataset.final = format(to);
  return counter(tl, el, to, at, { from, duration, ease, format });
}

export { gsap };

/** Resolve a position (number, "label", "label+=0.3", "label-=0.2") to seconds. Labels must exist already. */
export function resolveAt(tl: TL, at: At): number {
  if (typeof at === "number") return at;
  const m = /^([A-Za-z_][\w-]*)?(?:([+-])=([\d.]+))?$/.exec(at.trim());
  if (!m) throw new Error(`data-viz: unsupported position "${at}" (use a number, "label" or "label+=n")`);
  const base = m[1] ? tl.labels[m[1]] : tl.duration();
  if (base === undefined) throw new Error(`data-viz: label "${m[1]}" does not exist yet — add it before referencing it`);
  const off = m[3] ? Number(m[3]) * (m[2] === "-" ? -1 : 1) : 0;
  return base + off;
}

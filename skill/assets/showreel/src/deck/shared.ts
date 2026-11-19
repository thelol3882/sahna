import { gsap } from "../gsap";

/**
 * Shared elements across scenes (auto Flip). An element with data-shared="key" in the outgoing scene and one with the
 * same key in the incoming scene fly from the old rect to the new one during the forward transition:
 * position, size, border-radius, background colour, shadow, and a crossfade of the content (old content fades out,
 * new content fades in, both scaled to the moving box by width). Clones fly on a layer above the scenes and covers;
 * the real elements are hidden during the flight and the incoming one is shown when the clone lands.
 *
 * Rules for scenes: the incoming scene must NOT animate its data-shared element (or an ancestor) in its entrance:
 * it is already in place when the entrance starts. On a jump, ← or the first load it simply appears with its scene.
 * The target rect is measured at the incoming scene's s0 (end of its entrance), so a parent that moves in the
 * entrance is fine as long as the element itself is not hidden at s0.
 */

export type SharedPair = { key: string; from: HTMLElement; to: HTMLElement };

const visible = (el: HTMLElement) => {
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return false;
  for (let n: HTMLElement | null = el; n && !n.hasAttribute("data-scene"); n = n.parentElement) {
    const cs = getComputedStyle(n);
    if (cs.display === "none" || Number(cs.opacity) < 0.05) return false;
  }
  return true;
};

/** pairs of data-shared elements present in both scenes (first match per key) */
export function sharedPairs(a: HTMLElement, b: HTMLElement): SharedPair[] {
  const out: SharedPair[] = [];
  const seen = new Set<string>();
  for (const from of Array.from(a.querySelectorAll<HTMLElement>("[data-shared]"))) {
    const key = from.dataset.shared!;
    if (seen.has(key)) continue;
    seen.add(key);
    const to = b.querySelector<HTMLElement>(`[data-shared="${CSS.escape(key)}"]`);
    if (to) out.push({ key, from, to });
  }
  return out;
}

type Box = { x: number; y: number; w: number; h: number };
type Look = { bg: string; radius: number; shadow: string; border: string; borderW: number };

function box(el: HTMLElement, stage: DOMRect, scale: number): Box {
  const r = el.getBoundingClientRect();
  return { x: (r.left - stage.left) / scale, y: (r.top - stage.top) / scale, w: r.width / scale, h: r.height / scale };
}
function look(el: HTMLElement): Look {
  const cs = getComputedStyle(el);
  return { bg: cs.backgroundColor, radius: parseFloat(cs.borderTopLeftRadius) || 0, shadow: cs.boxShadow === "none" ? "0 0 0 0 rgb(0 0 0 / 0)" : cs.boxShadow,
    border: cs.borderTopColor, borderW: parseFloat(cs.borderTopWidth) || 0 };
}
const transparent = (c: string) => c === "transparent" || /rgba?\(.*,\s*0\)$/.test(c) || /\/\s*0\)$/.test(c);

/** A content copy of `el` that keeps its inherited look (colour, font, the scene's .hero context) outside its scene. */
function content(el: HTMLElement, b: Box): HTMLElement {
  const scene = el.closest<HTMLElement>("[data-scene]");
  const wrap = document.createElement("div");
  wrap.className = (scene?.className ?? "").split(/\s+/).filter((c) => c && c !== "scene").join(" ");
  const ps = getComputedStyle(el.parentElement ?? el);
  Object.assign(wrap.style, {
    position: "absolute", left: "0", top: "0", width: `${b.w}px`, height: `${b.h}px`, transformOrigin: "0 0", background: "none",
    color: ps.color, fontFamily: ps.fontFamily, fontSize: ps.fontSize, fontWeight: ps.fontWeight, lineHeight: ps.lineHeight,
    letterSpacing: ps.letterSpacing, textAlign: ps.textAlign, visibility: "visible",
  } as Partial<CSSStyleDeclaration>);
  const c = el.cloneNode(true) as HTMLElement;
  c.removeAttribute("data-shared");
  c.removeAttribute("id");
  c.classList.remove("absolute", "fixed", "relative");
  Object.assign(c.style, {
    position: "absolute", left: "0", top: "0", right: "auto", bottom: "auto", margin: "0", width: `${b.w}px`, height: `${b.h}px`,
    transform: "none", translate: "none", scale: "none", rotate: "none", opacity: "1", visibility: "visible",
    backgroundColor: "transparent", borderColor: "transparent", boxShadow: "none", boxSizing: "border-box",
  } as Partial<CSSStyleDeclaration>);
  wrap.appendChild(c);
  return wrap;
}

export type Flight = {
  tl: gsap.core.Timeline;
  /** show the real incoming elements, remove the clones (call when nothing covers the stage any more) */
  land: () => void;
};

/**
 * Build the flight for `pairs`. `measureTo` must put the incoming scene at its s0 state while it runs `fn`
 * (the director seeks the timeline there and back). Returns a timeline starting at 0 that lasts `duration`.
 */
export function buildFlight(layer: HTMLElement, stage: HTMLElement, scale: number, pairs: SharedPair[],
  measureTo: (fn: () => void) => void, duration = 1.0): Flight {
  const sr = stage.getBoundingClientRect();
  const items = pairs.map((p) => ({ ...p, A: box(p.from, sr, scale), LA: look(p.from), B: { x: 0, y: 0, w: 0, h: 0 } as Box, LB: null as Look | null, cA: content(p.from, box(p.from, sr, scale)), cB: null as HTMLElement | null }));
  measureTo(() => {
    for (const it of items) {
      it.B = box(it.to, sr, scale);
      it.LB = look(it.to);
      it.cB = content(it.to, it.B);
    }
  });
  const restore: (() => void)[] = [];
  const shells: HTMLElement[] = [];
  const tl = gsap.timeline();
  for (const it of items) {
    const { A, B, LA } = it;
    const LB = it.LB!;
    const shell = document.createElement("div");
    const clip = !transparent(LA.bg) || !transparent(LB.bg) || LA.borderW > 0 || LB.borderW > 0;
    Object.assign(shell.style, {
      position: "absolute", left: `${A.x}px`, top: `${A.y}px`, width: `${A.w}px`, height: `${A.h}px`, overflow: clip ? "hidden" : "visible",
      backgroundColor: LA.bg, borderRadius: `${LA.radius}px`, boxShadow: LA.shadow, outline: `${LA.borderW}px solid ${LA.border}`, outlineOffset: `-${LA.borderW}px`,
      willChange: "left, top, width, height",
    } as Partial<CSSStyleDeclaration>);
    shell.dataset.flight = it.key;
    shell.append(it.cA, it.cB!);
    layer.appendChild(shell);
    shells.push(shell);
    // hide the real elements while their clone flies
    for (const el of [it.from, it.to]) {
      const prev = el.style.visibility;
      el.style.visibility = "hidden";
      restore.push(() => { el.style.visibility = prev; });
    }
    const g = { x: A.x, y: A.y, w: A.w, h: A.h };
    const place = () => {
      shell.style.left = `${g.x}px`; shell.style.top = `${g.y}px`; shell.style.width = `${g.w}px`; shell.style.height = `${g.h}px`;
      it.cA.style.transform = `scale(${g.w / A.w})`;
      it.cB!.style.transform = `scale(${g.w / B.w})`;
    };
    place();
    gsap.set(it.cB, { opacity: 0 });
    tl.to(g, { x: B.x, y: B.y, w: B.w, h: B.h, duration, ease: "deck.inOut", onUpdate: place }, 0)
      .to(shell, { backgroundColor: LB.bg, borderRadius: LB.radius, boxShadow: LB.shadow, outlineColor: LB.border, outlineWidth: LB.borderW, outlineOffset: -LB.borderW, duration, ease: "deck.inOut" }, 0)
      .to(it.cA, { opacity: 0, duration: duration * 0.5, ease: "power1.in" }, duration * 0.05)
      .to(it.cB!, { opacity: 1, duration: duration * 0.5, ease: "power1.out" }, duration * 0.35);
  }
  let landed = false;
  const land = () => {
    if (landed) return;
    landed = true;
    restore.forEach((f) => f());
    shells.forEach((s) => s.remove());
  };
  return { tl, land };
}

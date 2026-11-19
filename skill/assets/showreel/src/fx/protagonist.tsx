import { useEffect, useId, useMemo } from "react";
import { gsap } from "../gsap";
import { deckRuntime, useSceneActive } from "../deck";
import { allow } from "./dial";
import type { At, TL } from "./util";

/**
 * The protagonist: ONE persistent object above the scenes (a layer in the stage) that every scene moves and
 * morphs in its own timeline. Seek-safe: each scene starts with protagonist.start() (a set at 0) and every
 * protagonist.to() is a fromTo from the previous state of the same scene, so ←, jumps and export land exactly.
 *
 * Seamless scene changes: make a scene's start state equal to the previous scene's end state (keep the states
 * in one object, e.g. `P.hero`, `P.bento`). A scene without a <ProtagonistSlot/> hides the object (fade).
 *
 * Export/print: the live layer is hidden; the scene's <ProtagonistSlot/> draws a static copy at the scene's end
 * state (the last state of its chain, or `end`). Academic: no live object; the static copy is always shown.
 */

export type Shape = keyof typeof SHAPES | (string & {});
export type PState = { x: number; y: number; scale?: number; shape?: Shape; rotate?: number; opacity?: number };

/** Shapes in a 200×200 box, centred on (100,100). Similar point counts morph best. Add your mark here. */
export const SHAPES = {
  orb: "M100,30 C138.66,30 170,61.34 170,100 C170,138.66 138.66,170 100,170 C61.34,170 30,138.66 30,100 C30,61.34 61.34,30 100,30 Z",
  dot: "M100,82 C109.94,82 118,90.06 118,100 C118,109.94 109.94,118 100,118 C90.06,118 82,109.94 82,100 C82,90.06 90.06,82 100,82 Z",
  squircle: "M100,28 C160,28 172,40 172,100 C172,160 160,172 100,172 C40,172 28,160 28,100 C28,40 40,28 100,28 Z",
  diamond: "M100,22 C104,22 178,96 178,100 C178,104 104,178 100,178 C96,178 22,104 22,100 C22,96 96,22 100,22 Z",
  pill: "M60,70 L140,70 C156.57,70 170,83.43 170,100 C170,116.57 156.57,130 140,130 L60,130 C43.43,130 30,116.57 30,100 C30,83.43 43.43,70 60,70 Z",
  /** placeholder brand mark: a "V" chevron in a rounded square silhouette — replace with the deck's mark */
  mark: "M44,40 L84,40 L100,112 L116,40 L156,40 L118,160 L82,160 Z",
};

const SIZE = 200;
const d = (s?: Shape) => (s ? (SHAPES as Record<string, string>)[s] ?? s : SHAPES.orb);
const full = (s: PState): Required<PState> => ({ scale: 1, shape: "orb", rotate: 0, opacity: 1, ...s });

/* ------------------------------------------------------------------ the live layer (one per deck) */

let layer: HTMLDivElement | null = null;
let obj: HTMLDivElement | null = null;
let path: SVGPathElement | null = null;
let presence = 0;
let presenceTimer: ReturnType<typeof setTimeout> | undefined;

function art(id: string) {
  return `<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" aria-hidden="true">
    <defs>
      <radialGradient id="${id}-f" cx="50%" cy="22%" r="85%">
        <stop offset="0" stop-color="#fff"/><stop offset="0.3" stop-color="var(--fx-p2)"/><stop offset="0.75" stop-color="var(--fx-p1)"/><stop offset="1" stop-color="var(--fx-p1)" stop-opacity="0.85"/>
      </radialGradient>
    </defs>
    <path class="fx-p-glow" d="${SHAPES.orb}" fill="var(--fx-p1)" opacity="0.6" style="filter: blur(26px)"/>
    <path class="fx-p-body" d="${SHAPES.orb}" fill="url(#${id}-f)"/>
    <path class="fx-p-edge" d="${SHAPES.orb}" fill="none" stroke="rgb(255 255 255 / 0.35)" stroke-width="1" vector-effect="non-scaling-stroke"/>
  </svg>`;
}

function mount(from: Element): boolean {
  if (deckRuntime.print || !allow("protagonist")) return false;
  if (layer?.isConnected) return true;
  const stage = from.closest("[data-scene]")?.parentElement;
  if (!stage) return false;
  layer = document.createElement("div");
  layer.className = "fx-protagonist-layer";
  layer.style.opacity = "0";
  obj = document.createElement("div");
  obj.className = "fx-protagonist";
  obj.style.width = obj.style.height = `${SIZE}px`;
  obj.innerHTML = art("fxp");
  layer.appendChild(obj);
  // right after the last scene: above every scene, below the footer and the transition layer
  const scenes = stage.querySelectorAll(":scope > [data-scene]");
  scenes[scenes.length - 1].after(layer);
  path = obj.querySelector(".fx-p-body");
  gsap.set(obj, { xPercent: -50, yPercent: -50, x: 960, y: 540 });
  return true;
}

function setPresence(delta: number) {
  presence += delta;
  clearTimeout(presenceTimer);
  // debounce: leaving one slot scene and entering another happens in the same commit
  presenceTimer = setTimeout(() => {
    if (!layer) return;
    gsap.to(layer, { opacity: presence > 0 ? 1 : 0, duration: presence > 0 ? 0.3 : 0.35, ease: "power1.inOut", overwrite: true });
  }, 30);
}

/* ------------------------------------------------------------------ timeline API */

const chains = new WeakMap<TL, Required<PState>>();
const slots = new WeakMap<TL, HTMLElement>();

function tweenVars(s: Required<PState>) {
  return { x: s.x, y: s.y, scale: s.scale, rotation: s.rotate, autoAlpha: s.opacity };
}
const paths = () => (obj ? Array.from(obj.querySelectorAll("path")) : []);

function drawStatic(slot: HTMLElement | undefined, s: Required<PState>) {
  if (!slot) return;
  const st = slot.querySelector<HTMLElement>(".fx-pstatic");
  if (!st) return;
  st.querySelectorAll("path").forEach((p) => p.setAttribute("d", d(s.shape)));
  gsap.set(st, { xPercent: -50, yPercent: -50, x: s.x, y: s.y, scale: s.scale, rotation: s.rotate, opacity: s.opacity });
}

export const protagonist = {
  /**
   * Start state of this scene (set at time 0). `q` is the scene's selector (from useScene) — it finds the
   * scene's <ProtagonistSlot/>. Call before any protagonist.to() of the scene.
   */
  start(tl: TL, q: (s: string) => Element[], state: PState) {
    const slot = q("[data-fx-pslot]")[0] as HTMLElement | undefined;
    const s = full(state);
    chains.set(tl, s);
    if (slot) slots.set(tl, slot);
    drawStatic(slot, s);
    if (!slot || !mount(slot) || !obj) return tl;
    tl.set(obj, tweenVars(s), 0);
    tl.set(paths(), { morphSVG: d(s.shape) }, 0);
    return tl;
  },

  /** Move/morph to `state` at `at`. Unspecified fields keep the previous value. */
  to(tl: TL, state: Partial<PState>, at: At, { duration = 1.1, ease = "power3.inOut" } = {}) {
    const prev = chains.get(tl);
    if (!prev) throw new Error("protagonist.to() before protagonist.start() in this scene");
    const next = { ...prev, ...state } as Required<PState>;
    chains.set(tl, next);
    drawStatic(slots.get(tl), next);
    if (!obj || !layer?.isConnected || !allow("protagonist")) return tl;
    tl.fromTo(obj, tweenVars(prev), { ...tweenVars(next), duration, ease, immediateRender: false }, at);
    if (next.shape !== prev.shape) {
      tl.fromTo(paths(), { morphSVG: d(prev.shape) }, { morphSVG: { shape: d(next.shape), type: "rotational" }, duration, ease, immediateRender: false }, at);
    }
    return tl;
  },

  /** The DOM node (for extra tweens, e.g. a pulse). null when not mounted (print, academic). */
  get el() { return obj; },
};

/**
 * Put one in every scene that uses the protagonist. It (1) shows the live object while this scene is on screen
 * and (2) draws a static copy at the scene's end state for export/print (and always in academic).
 * `exportCopy={false}`: the object is not shown in this scene's exported page.
 */
export function ProtagonistSlot({ exportCopy = true }: { exportCopy?: boolean }) {
  const active = useSceneActive();
  const live = allow("protagonist");
  const id = "fxps" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const html = useMemo(() => ({ __html: art(id) }), [id]);
  useEffect(() => {
    if (!live || deckRuntime.print || !active) return;
    setPresence(1);
    return () => setPresence(-1);
  }, [active, live]);
  const cls = !live ? "fx-always" : exportCopy ? "fx-export" : "";
  return (
    <div data-fx-pslot="" aria-hidden className="absolute inset-0 pointer-events-none" style={{ zIndex: 4 }}>
      <div className={`fx-pstatic ${cls}`} style={{ width: SIZE, height: SIZE }} dangerouslySetInnerHTML={html} />
    </div>
  );
}

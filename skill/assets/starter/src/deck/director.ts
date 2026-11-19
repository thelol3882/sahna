import { gsap } from "../gsap";
import { allow } from "../fx/dial";
import { playTransition, SCENE_PROPS, type TransitionHooks } from "./transitions";
import { isShader, playShader, resetShader, shaderReady, SHADER_FALLBACK } from "./shader";
import { playThrough } from "./through";
import { buildFlight, sharedPairs, type Flight } from "./shared";
import type { Plan } from "./grammar";

/** The layers the director draws on (all inside the stage) and the stage scale. */
export type Layers = {
  stage: HTMLElement;
  overlay: HTMLElement;   // TransitionLayer, z 40
  canvas: HTMLCanvasElement; // WebGL covers, z 41
  plate: HTMLElement;     // through-zoom solid fill, z 3 while used
  shared: HTMLElement;    // flying clones, z 45
  scale: number;
};

let flight: Flight | null = null;
/** what the last forward transition really played (after shared-element and WebGL checks), for scripts */
export const lastRun = { into: "", kind: "", shared: [] as string[], through: null as string | null };

/**
 * Play the planned forward transition from scene element `a` to `b`. Returns ONE timeline (kill it to abort, then
 * call resetTransitions). `seekB(fn)` runs fn with the incoming timeline at s0 (to measure shared targets).
 */
export function runTransition(L: Layers, plan: Plan, a: HTMLElement, b: HTMLElement, hooks: TransitionHooks,
  seekB: (fn: () => void) => void): gsap.core.Timeline {
  let kind = plan.kind;
  const target = plan.through ? a.querySelector(plan.through.sel) : null;
  if (plan.through && !target) console.warn(`through: "${plan.through.sel}" not found in the outgoing scene, playing ${kind}`);
  const pairs = !target && allow("sharedElements") ? sharedPairs(a, b) : [];
  if (pairs.length && !plan.explicit) kind = "fade"; // a default choice becomes a morph around the shared elements
  if (isShader(kind) && !shaderReady(kind)) kind = SHADER_FALLBACK[kind];

  Object.assign(lastRun, { into: b.dataset.scene ?? "", kind: target ? "through" : pairs.length && kind === "fade" ? "morph" : kind,
    shared: pairs.map((p) => p.key), through: target ? plan.through!.sel : null });
  const master = gsap.timeline({ onComplete: () => { flight?.land(); flight = null; hooks.done(); } });
  const inner: TransitionHooks = { swap: hooks.swap, start: hooks.start, done: () => {} };
  let base: gsap.core.Timeline;
  if (target) base = playThrough(target, L.plate, L.stage, L.scale, a, b, inner, plan.through!.color);
  else if (isShader(kind)) base = playShader(L.canvas, kind, a, b, inner, L.scale);
  else if (kind === "fade") base = morph(a, b, inner, pairs.length > 0);
  else base = playTransition(L.overlay, kind, a, b, inner);
  master.add(base, 0);

  if (pairs.length) {
    flight?.land();
    flight = buildFlight(L.shared, L.stage, L.scale, pairs, seekB, kind === "fade" ? 1.0 : Math.min(1.2, Math.max(0.9, base.duration() * 0.7)));
    master.add(flight.tl, 0);
  }
  return master;
}

/** Fade / morph base: the old scene fades out fast, the new one fades in under the flying elements. */
function morph(a: HTMLElement, b: HTMLElement, hooks: TransitionHooks, shared: boolean) {
  gsap.set(b, { autoAlpha: 0, zIndex: 3 });
  gsap.set(a, { zIndex: 2 });
  const tl = gsap.timeline({
    onComplete: () => {
      gsap.set(a, { autoAlpha: 0, clearProps: SCENE_PROPS });
      gsap.set(b, { clearProps: SCENE_PROPS });
      gsap.set(b, { autoAlpha: 1 });
      hooks.done();
    },
  });
  tl.to(a, { autoAlpha: 0, duration: 0.4, ease: "power2.in" }, 0)
    .call(hooks.swap, [], 0.3)
    .to(b, { autoAlpha: 1, duration: 0.45, ease: "power2.out" }, 0.25)
    // with shared elements the entrance starts while they settle, so the scene builds around them
    .call(hooks.start, [], shared ? 0.55 : 0.35);
  if (shared) tl.set({}, {}, 1.0);
  return tl;
}

/** After a killed transition (__deck.show, export): remove clones, hide the canvas and the plate. */
export function resetTransitions(L: Partial<Layers>) {
  flight?.land();
  flight = null;
  resetShader(L.canvas ?? null);
  if (L.plate) gsap.set(L.plate, { autoAlpha: 0 });
  if (L.overlay) { gsap.set(L.overlay, { autoAlpha: 0 }); gsap.set(L.overlay.querySelectorAll(".tr-part"), { autoAlpha: 0 }); }
  L.shared?.replaceChildren();
}

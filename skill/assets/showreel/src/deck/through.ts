import { gsap } from "../gsap";
import { SCENE_PROPS, type TransitionHooks } from "./transitions";

/**
 * Through-zoom: the camera dives through an element of the outgoing scene (meta `exit: { through: ".sel" }`).
 * The outgoing scene scales around the element's centre (exponential zoom = constant perceived speed) until the
 * element covers the stage; a solid plate in the element's colour takes over (crisp, no giant raster), the scenes
 * swap, and the new scene emerges from scale 0.85 → 1 over the plate. ~1.2 s.
 * Best targets: a solid dot, a device screen, a filled card, the period of a headline, a bold glyph stem.
 */

/** the colour the element "is": SVG fill, else a non-transparent background, else its text colour */
function colourOf(el: Element): string {
  const cs = getComputedStyle(el);
  if (el instanceof SVGElement && cs.fill && cs.fill !== "none" && !cs.fill.startsWith("url")) return cs.fill;
  const bg = cs.backgroundColor;
  if (bg && !/rgba?\(.*,\s*0\)$/.test(bg) && bg !== "transparent") return bg;
  return cs.color;
}

export function playThrough(el: Element, plate: HTMLElement, stage: HTMLElement, scale: number, a: HTMLElement, b: HTMLElement,
  hooks: TransitionHooks, color?: string) {
  const sr = stage.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const cx = (r.left + r.width / 2 - sr.left) / scale, cy = (r.top + r.height / 2 - sr.top) / scale;
  const w = Math.max(2, r.width / scale), h = Math.max(2, r.height / scale);
  const cs = getComputedStyle(el);
  const round = el instanceof SVGCircleElement || el instanceof SVGEllipseElement || parseFloat(cs.borderTopLeftRadius) >= Math.min(w, h) * 0.45;
  const text = !(el instanceof SVGElement) && /rgba?\(.*,\s*0\)$/.test(cs.backgroundColor) && (el.textContent ?? "").trim().length > 0;
  const far = Math.max(Math.hypot(Math.max(cx, 1920 - cx), Math.max(cy, 1080 - cy)));
  // scale at which the element's shape covers the whole stage (a glyph's ink is smaller than its box: margin)
  const cover = round ? far / (Math.min(w, h) / 2)
    : Math.max(Math.max(cx, 1920 - cx) / (w / 2), Math.max(cy, 1080 - cy) / (h / 2)) * (text ? 1.6 : 1.04);
  const fillCol = color ?? colourOf(el);

  gsap.set(a, { zIndex: 2, transformOrigin: `${cx}px ${cy}px` });
  gsap.set(plate, { autoAlpha: 0, backgroundColor: fillCol, zIndex: 3 });
  const z = { u: 0 };
  const DIVE = 0.68;
  const tl = gsap.timeline({
    onComplete: () => {
      gsap.set(plate, { autoAlpha: 0 });
      gsap.set(a, { autoAlpha: 0, clearProps: SCENE_PROPS });
      gsap.set(b, { clearProps: SCENE_PROPS });
      gsap.set(b, { autoAlpha: 1 });
      hooks.done();
    },
  });
  tl.to(z, { u: 1, duration: DIVE, ease: "power2.in", onUpdate: () => gsap.set(a, { scale: Math.pow(cover * 1.05, z.u) }) }, 0)
    // the plate takes over just before full cover, so the last, largest frames are a solid fill (crisp, cheap)
    .to(plate, { autoAlpha: 1, duration: 0.1, ease: "none" }, DIVE - 0.08)
    .call(() => { gsap.set(a, { autoAlpha: 0 }); gsap.set(b, { zIndex: 4, autoAlpha: 0, scale: 0.85, transformOrigin: "50% 50%" }); hooks.swap(); }, [], DIVE + 0.02)
    .to(b, { autoAlpha: 1, scale: 1, duration: 0.6, ease: "deck.out" }, DIVE + 0.04)
    .call(hooks.start, [], DIVE + 0.14);
  return tl;
}

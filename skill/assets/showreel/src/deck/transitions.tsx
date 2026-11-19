import { gsap } from "../gsap";

/**
 * Forward transitions between scenes (§5). Colours come from the theme tokens.
 * - overlay: something covers the stage, the scenes swap under it, then it leaves
 * - scene-over-scene: the next scene comes in over the old one
 * - shader (shader.ts), through-zoom (through.ts) and shared elements (shared.ts) are run by director.ts
 * Replace SHAPE_D with the concept's mark silhouette (simple, notch-free) and STROKE_D with its brand path.
 */
export type TransitionKind = "shape" | "pixels" | "curtain" | "stroke" | "split" | "blinds" | "circle" | "push" | "wipe" | "zoom" | "rise";
/** WebGL covers (showcase only; anything else degrades to SHADER_FALLBACK) */
export type ShaderKind = "liquid" | "waves" | "dissolve" | "sweep";
/** what a scene may ask for in `enter` / DECK.enter */
export type EnterKind = TransitionKind | ShaderKind | "fade";

const COLS = 16, ROWS = 9, PANELS = 6, BLINDS = 8;
// silhouette in a 64×64 box; (PX, PY) = its visual centre
const SHAPE_D = "M14 6 H50 A8 8 0 0 1 58 14 V50 A8 8 0 0 1 50 58 H14 A8 8 0 0 1 6 50 V14 A8 8 0 0 1 14 6 Z";
const PX = 32, PY = 32, COVER = 120;
const STROKE_D = "M-260 180 H1700 A190 190 0 0 1 1700 560 H220 A190 190 0 0 0 220 940 H2180";
const R = Math.hypot(960, 540) + 20; // covers the stage from its centre

const fill = (v: string) => ({ fill: `var(${v})` });
const glow = (px: number) => `drop-shadow(0 0 ${px}px var(--color-accent))`;

export function TransitionLayer({ ref }: { ref?: React.Ref<HTMLDivElement> }) {
  return (
    <div ref={ref} className="absolute inset-0 pointer-events-none" style={{ zIndex: 40, visibility: "hidden" }} aria-hidden>
      <svg className="tr-shape tr-part absolute inset-0" width="1920" height="1080" viewBox="0 0 1920 1080">
        <defs>
          <mask id="tr-hole" maskUnits="userSpaceOnUse" x="0" y="0" width="1920" height="1080">
            <rect width="1920" height="1080" fill="white" />
            <path className="tr-hole" d={SHAPE_D} fill="black" />
          </mask>
        </defs>
        <rect className="tr-rect" width="1920" height="1080" style={fill("--color-hero")} mask="url(#tr-hole)" />
        <path className="tr-grow" d={SHAPE_D} style={fill("--color-hero")} />
        <path className="tr-edge" d={SHAPE_D} fill="none" style={{ stroke: "var(--color-accent)" }} strokeWidth="4" vectorEffect="non-scaling-stroke" />
      </svg>

      <div className="tr-pixels tr-part absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)`, gridTemplateRows: `repeat(${ROWS}, 1fr)` }}>
        {Array.from({ length: COLS * ROWS }, (_, i) => (
          <span key={i} className="tr-px block" style={{ background: i % 41 === 7 ? "var(--color-accent)" : "var(--color-primary)", margin: -0.5, borderRadius: 4 }} />
        ))}
      </div>

      <div className="tr-curtain tr-part absolute inset-0 flex">
        {Array.from({ length: PANELS }, (_, i) => (
          <div key={i} className="tr-panel relative h-full flex-1" style={{
            background: `linear-gradient(180deg, color-mix(in srgb, var(--color-hero-line) 70%, var(--color-hero)) 0%, var(--color-hero) 38%)`,
            marginRight: -1,
          }}>
            {/* light edge: a bright hairline on an accent bar, with a soft bloom ahead of it (reads as motion blur) */}
            <div className="absolute left-0 right-0 bottom-full h-[90px]" style={{ background: "linear-gradient(0deg, color-mix(in srgb, var(--color-accent) 28%, transparent), transparent)" }} />
            <div className="absolute left-0 right-0 top-0 h-[8px]" style={{ background: "var(--color-accent)", boxShadow: "0 0 24px var(--color-accent)" }} />
            <div className="absolute left-0 right-0 top-0 h-[2px]" style={{ background: "rgb(255 255 255 / 0.75)" }} />
          </div>
        ))}
      </div>

      <svg className="tr-stroke tr-part absolute inset-0" width="1920" height="1080" viewBox="0 0 1920 1080">
        <rect className="tr-stroke-fill" width="1920" height="1080" style={fill("--color-hero")} />
        <path className="tr-stroke-band" d={STROKE_D} fill="none" style={{ stroke: "var(--color-primary)" }} strokeWidth="430" />
        <path className="tr-stroke-line" d={STROKE_D} fill="none" stroke="#FFFFFF" strokeOpacity="0.5" strokeWidth="6" />
        <circle className="tr-stroke-head" r="34" style={{ ...fill("--color-accent"), stroke: "#fff", filter: glow(14) }} strokeWidth="6" />
      </svg>

      <div className="tr-split tr-part absolute inset-0">
        <div className="tr-half-t absolute left-0 right-0 top-0 h-1/2" style={{ background: "var(--color-hero)" }} />
        <div className="tr-half-b absolute left-0 right-0 bottom-0 h-1/2" style={{ background: "var(--color-hero)" }} />
        <div className="tr-seam absolute left-0 right-0 top-1/2 h-[4px] -mt-[2px]" style={{ background: "var(--color-accent)", boxShadow: "0 0 18px 2px var(--color-accent), 0 0 60px 6px color-mix(in srgb, var(--color-accent) 40%, transparent)" }} />
      </div>

      <div className="tr-blinds tr-part absolute inset-0 flex flex-col">
        {Array.from({ length: BLINDS }, (_, i) => (
          <div key={i} className="tr-blind w-full flex-1" style={{ background: "var(--color-hero)", marginBottom: -1, boxShadow: "inset 0 -2px 0 color-mix(in srgb, var(--color-accent) 55%, transparent)" }} />
        ))}
      </div>

      <div className="tr-ring tr-part absolute left-1/2 top-1/2 rounded-full" style={{ border: "4px solid var(--color-accent)", outline: "10px solid color-mix(in srgb, var(--color-accent) 22%, transparent)" }} />
      <svg className="tr-slash tr-part absolute inset-0" width="1920" height="1080" viewBox="0 0 1920 1080">
        <defs>
          <linearGradient id="tr-sheen" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" style={{ stopColor: "var(--color-accent)", stopOpacity: 0 }} />
            <stop offset="1" style={{ stopColor: "var(--color-accent)", stopOpacity: 0.28 }} />
          </linearGradient>
        </defs>
        {/* sheen: a soft band trailing the cut on the old-scene side, reads as light on a moving edge */}
        <polygon className="tr-slash-sheen" points="0,0 0,0 0,1080 0,1080" fill="url(#tr-sheen)" />
        {/* glow without a filter: a wide translucent stroke under the line (filters on moving SVG are slow) */}
        <line className="tr-slash-halo" x1="0" y1="0" x2="0" y2="1080" style={{ stroke: "var(--color-accent)" }} strokeOpacity="0.3" strokeWidth="18" />
        <line className="tr-slash-line" x1="0" y1="0" x2="0" y2="1080" style={{ stroke: "var(--color-accent)" }} strokeWidth="5" />
        <line className="tr-slash-core" x1="0" y1="0" x2="0" y2="1080" stroke="#fff" strokeOpacity="0.85" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

const shapeTransform = (s: number) => `translate(960 540) scale(${s}) translate(${-PX} ${-PY})`;

export type TransitionHooks = {
  /** update deck state (index, step, timers): the old scene is out of sight or the new one starts */
  swap: () => void;
  /** start the next scene's entrance */
  start: () => void;
  /** everything finished */
  done: () => void;
};

/** Props the transitions may leave on scene elements; cleared when a transition ends or is killed. */
export const SCENE_PROPS = "transform,clipPath,zIndex,background,y,x,opacity,boxShadow,filter,transformOrigin,scale";

/** Plays one transition from scene element `a` to `b`. Returns the timeline (kill it to abort). */
export function playTransition(layer: HTMLElement, kind: TransitionKind, a: HTMLElement, b: HTMLElement, hooks: TransitionHooks) {
  const q = gsap.utils.selector(layer);
  const parts = q(".tr-part");
  const show = (sel: string) => gsap.set(q(sel), { autoAlpha: 1 });
  const swapUnder = () => {
    gsap.set(a, { autoAlpha: 0 });
    gsap.set(b, { autoAlpha: 1 });
    hooks.swap();
  };
  const tl = gsap.timeline({
    onComplete: () => {
      gsap.set(layer, { autoAlpha: 0 });
      gsap.set(parts, { autoAlpha: 0 });
      gsap.set(a, { autoAlpha: 0, clearProps: SCENE_PROPS });
      gsap.set(b, { clearProps: SCENE_PROPS });
      gsap.set(b, { autoAlpha: 1 });
      hooks.done();
    },
  });
  gsap.set(parts, { autoAlpha: 0 });
  tl.set(layer, { autoAlpha: 1 });
  const over = () => { gsap.set(b, { autoAlpha: 1, zIndex: 3 }); gsap.set(a, { zIndex: 2 }); hooks.swap(); };

  switch (kind) {
    case "shape": {
      const grow = q(".tr-grow")[0], edge = q(".tr-edge")[0], hole = q(".tr-hole")[0], rect = q(".tr-rect")[0];
      const s1 = { s: 0.001 }, s2 = { s: 0.001 };
      const setA = () => { grow.setAttribute("transform", shapeTransform(s1.s)); edge.setAttribute("transform", shapeTransform(s1.s * 1.04)); };
      const setB = () => { hole.setAttribute("transform", shapeTransform(s2.s)); edge.setAttribute("transform", shapeTransform(s2.s)); };
      setA(); setB();
      show(".tr-shape");
      gsap.set(rect, { autoAlpha: 0 });
      gsap.set([grow, edge], { autoAlpha: 1 });
      tl.to(s1, { s: 3, duration: 0.35, ease: "back.out(2)", onUpdate: setA }, 0)
        .to(s1, { s: COVER, duration: 0.55, ease: "deck.in", onUpdate: setA }, 0.4)
        .call(swapUnder, [], 0.96)
        .set(rect, { autoAlpha: 1 }, 0.97)
        .set(grow, { autoAlpha: 0 }, 0.97)
        .call(hooks.start, [], 1.0)
        .to(s2, { s: COVER, duration: 0.85, ease: "deck.inOut", onUpdate: setB }, 1.0)
        .to(edge, { autoAlpha: 0, duration: 0.3 }, 1.6);
      break;
    }
    case "pixels": {
      const px = q(".tr-px");
      const st = { grid: [ROWS, COLS] as [number, number], from: "start" as const, amount: 0.55 };
      show(".tr-pixels");
      tl.fromTo(px, { scale: 0, borderRadius: 24 }, { scale: 1, borderRadius: 2, duration: 0.32, ease: "power2.out", stagger: st }, 0)
        .call(swapUnder, [], 0.9)
        .call(hooks.start, [], 1.0)
        .to(px, { scale: 0, borderRadius: 24, duration: 0.3, ease: "power2.in", stagger: st }, 1.0);
      break;
    }
    case "curtain": {
      const panels = q(".tr-panel");
      show(".tr-curtain");
      tl.fromTo(panels, { yPercent: 112 }, { yPercent: 0, duration: 0.6, ease: "deck.inOut", stagger: 0.055 }, 0)
        .call(swapUnder, [], 0.9)
        .call(hooks.start, [], 0.95)
        .to(panels, { yPercent: -112, duration: 0.65, ease: "deck.inOut", stagger: 0.055 }, 0.95);
      break;
    }
    case "stroke": {
      const band = q(".tr-stroke-band")[0] as unknown as SVGPathElement;
      const line = q(".tr-stroke-line")[0];
      const head = q(".tr-stroke-head");
      show(".tr-stroke");
      gsap.set(q(".tr-stroke-fill"), { opacity: 0 });
      gsap.set(head, { scale: 1, autoAlpha: 1, x: 0, y: 0, transformOrigin: "50% 50%" });
      tl.fromTo([band, line], { drawSVG: "0% 0%" }, { drawSVG: "0% 100%", duration: 0.9, ease: "power2.inOut" }, 0)
        .to(head, { motionPath: { path: band }, duration: 0.9, ease: "power2.inOut" }, 0)
        .to(q(".tr-stroke-fill"), { opacity: 1, duration: 0.2 }, 0.72)
        .call(swapUnder, [], 0.95)
        .to(head, { scale: 0, autoAlpha: 0, duration: 0.25, ease: "back.in(2)" }, 0.95)
        .to(q(".tr-stroke-fill"), { opacity: 0, duration: 0.25 }, 1.1)
        .call(hooks.start, [], 1.15)
        .to([band, line], { drawSVG: "100% 100%", duration: 0.75, ease: "power2.inOut" }, 1.1);
      break;
    }
    case "split": {
      show(".tr-split");
      gsap.set([q(".tr-half-t"), q(".tr-half-b")], { yPercent: 0, opacity: 0 });
      gsap.set(q(".tr-seam"), { scaleX: 0, opacity: 1 });
      tl.to([q(".tr-half-t"), q(".tr-half-b")], { opacity: 1, duration: 0.3, ease: "power1.out" }, 0)
        .to(q(".tr-seam"), { scaleX: 1, duration: 0.5, ease: "deck.inOut" }, 0.12)
        .call(swapUnder, [], 0.6)
        .call(hooks.start, [], 0.75)
        .to(q(".tr-half-t"), { yPercent: -100, duration: 0.9, ease: "deck.inOut" }, 0.65)
        .to(q(".tr-half-b"), { yPercent: 100, duration: 0.9, ease: "deck.inOut" }, 0.65)
        .to(q(".tr-seam"), { opacity: 0, scaleY: 6, duration: 0.3 }, 0.7);
      break;
    }
    case "blinds": {
      const blinds = q(".tr-blind");
      show(".tr-blinds");
      tl.fromTo(blinds, { scaleY: 0, transformOrigin: "50% 0%" }, { scaleY: 1.02, duration: 0.45, ease: "deck.inOut", stagger: 0.05 }, 0)
        .call(swapUnder, [], 0.85)
        .call(hooks.start, [], 0.9)
        .to(blinds, { scaleY: 0, transformOrigin: "50% 100%", duration: 0.45, ease: "deck.inOut", stagger: 0.05 }, 0.9);
      break;
    }
    case "circle": {
      const ring = q(".tr-ring")[0];
      gsap.set(b, { clipPath: "circle(0px at 50% 50%)" });
      gsap.set(ring, { autoAlpha: 1, width: 0, height: 0, xPercent: -50, yPercent: -50 });
      over();
      const c = { r: 0 };
      tl.to(c, { r: R, duration: 1.0, ease: "deck.inOut", onUpdate: () => {
          gsap.set(b, { clipPath: `circle(${c.r}px at 50% 50%)` });
          gsap.set(ring, { width: c.r * 2, height: c.r * 2 });
        } }, 0)
        .to(a, { scale: 0.94, duration: 1.0, ease: "deck.inOut" }, 0)
        .call(hooks.start, [], 0.35)
        .to(ring, { autoAlpha: 0, duration: 0.25 }, 0.8);
      break;
    }
    case "push": {
      gsap.set(b, { x: 1920, boxShadow: "-40px 0 80px rgb(0 0 0 / 0.22)" });
      over();
      tl.to(b, { x: 0, duration: 1.0, ease: "deck.inOut" }, 0)
        .to(a, { x: -640, opacity: 0.35, duration: 1.0, ease: "deck.inOut" }, 0)
        .call(hooks.start, [], 0.45)
        .set(b, { boxShadow: "none" });
      break;
    }
    case "wipe": {
      const lines = [q(".tr-slash-halo")[0], q(".tr-slash-line")[0], q(".tr-slash-core")[0]], sheen = q(".tr-slash-sheen")[0];
      show(".tr-slash");
      gsap.set(b, { clipPath: "polygon(130% 0, 130% 0, 130% 100%, 130% 100%)" });
      over();
      const p = { v: 0 };
      const W = 1920, SHEEN = 380;
      tl.to(p, { v: 1, duration: 1.0, ease: "deck.inOut", onUpdate: () => {
          const x1 = 100 - p.v * 135, x2 = x1 + 35; // slanted cut, %
          gsap.set(b, { clipPath: `polygon(${x1}% 0, 140% 0, 140% 100%, ${x2}% 100%)` });
          const X1 = (x1 / 100) * W, X2 = (x2 / 100) * W;
          for (const l of lines) { l.setAttribute("x1", String(X1)); l.setAttribute("x2", String(X2)); }
          sheen.setAttribute("points", `${X1 - SHEEN},0 ${X1},0 ${X2},1080 ${X2 - SHEEN},1080`);
        } }, 0)
        .call(hooks.start, [], 0.42)
        .to(q(".tr-slash"), { autoAlpha: 0, duration: 0.2 }, 0.88);
      break;
    }
    case "zoom": {
      gsap.set(b, { autoAlpha: 0, zIndex: 3, scale: 0.9, transformOrigin: "50% 50%" });
      gsap.set(a, { zIndex: 2, transformOrigin: "50% 50%" });
      hooks.swap();
      // a short blur on the outgoing scene reads as motion blur (one layer, ~0.5 s)
      tl.to(a, { scale: 1.14, autoAlpha: 0, filter: "blur(6px)", duration: 0.6, ease: "deck.in" }, 0)
        .to(b, { scale: 1, autoAlpha: 1, duration: 0.8, ease: "deck.out" }, 0.35)
        .call(hooks.start, [], 0.4);
      break;
    }
    case "rise": {
      // strategy B inside a section: the old scene lifts and fades fast, the new one rises softly
      gsap.set(b, { autoAlpha: 0, y: 56, zIndex: 3 });
      gsap.set(a, { zIndex: 2 });
      hooks.swap();
      tl.to(a, { y: -24, autoAlpha: 0, duration: 0.3, ease: "power2.in" }, 0)
        .to(b, { y: 0, autoAlpha: 1, duration: 0.7, ease: "deck.out" }, 0.2)
        .call(hooks.start, [], 0.25);
      break;
    }
  }
  return tl;
}

import { useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import { gsap } from "../gsap";
import { allow, intensity } from "./dial";
import { plus, rectIn, resolve, useLoop, type At, type TL } from "./util";

/* ================================================================== Beam */

const BOX: CSSProperties = { width: "calc(100% - 1px)", height: "calc(100% - 1px)" };

type BeamProps = {
  /** corner radius of the card it runs around (px) */
  radius?: number;
  /** seconds per lap */
  speed?: number;
  /** comet length, % of the perimeter */
  length?: number;
  /** two comets on opposite sides */
  twin?: boolean;
  /** the beam sits on a diagram (balanced allows beams on diagrams only) */
  diagram?: boolean;
  /** where the comet rests in export / when paused, 0..1 of a lap (0 = top-left corner, clockwise) */
  still?: number;
  color?: string;
  className?: string;
};

/**
 * A glowing comet that travels along the border of its parent (position the parent `relative`).
 * Loops while the scene is on screen; in export it rests at `still`. Not allowed → a static lit hairline on the
 * top edge (the card still reads as "the special one").
 */
export function Beam({ radius = 28, speed = 5.5, length = 22, twin = false, diagram = false, still = 0.12, color = "var(--fx-glow)", className = "" }: BeamProps) {
  const on = allow("light", { diagram });
  const ref = useRef<SVGSVGElement>(null);
  useLoop(() => {
    const segs = ref.current?.querySelectorAll<SVGRectElement>("[data-len]");
    if (!segs?.length) return null;
    return gsap.fromTo(segs, { strokeDashoffset: (_i: number, t: Element) => +t.getAttribute("data-len")! + +(t.getAttribute("data-phase") ?? 0) },
      { strokeDashoffset: (_i: number, t: Element) => +t.getAttribute("data-len")! + +(t.getAttribute("data-phase") ?? 0) - 100, duration: speed, ease: "none", repeat: -1 });
  }, { still: still * speed, enabled: on });

  if (!on) {
    return (
      <span aria-hidden className={`pointer-events-none absolute left-[12%] right-[12%] top-[-1px] h-px ${className}`}
        style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)`, opacity: 0.7 }} />
    );
  }
  // the glow is a wide, faint stroke (no blur filter: a blurred SVG re-rasterises every frame)
  const comet = [
    { len: length, w: 10, o: 0.1 * (0.5 + intensity / 2), cls: "" },
    { len: length * 0.7, w: 5, o: 0.22 * (0.5 + intensity / 2), cls: "" },
    { len: length, w: 1.5, o: 0.45, cls: "" },
    { len: length * 0.45, w: 1.75, o: 0.9, cls: "" },
    { len: 2.2, w: 2.5, o: 1, cls: "", head: true },
  ];
  const phases = twin ? [0, 50] : [0];
  const rect = (len: number, w: number, o: number, cls: string, phase: number, head?: boolean) => (
    <rect key={`${len}-${w}-${phase}`} className={cls} x="0.5" y="0.5" style={BOX} rx={radius} ry={radius}
      pathLength={100} data-len={len} data-phase={phase} stroke={head ? "#fff" : color} strokeWidth={w} opacity={o} strokeLinecap="round"
      strokeDasharray={`${len} ${100 - len}`} strokeDashoffset={len + phase - still * 100} />
  );
  return (
    <svg ref={ref} aria-hidden className={`fx-beam ${className}`} width="100%" height="100%">
      {/* the lit track: a very faint full border so the comet runs on something */}
      <rect x="0.5" y="0.5" style={BOX} rx={radius} ry={radius} stroke={color} strokeOpacity={0.14} strokeWidth={1} fill="none" />
      {phases.map((ph) => comet.map((c) => rect(c.len, c.w, c.o, c.cls, ph, c.head)))}
    </svg>
  );
}

/**
 * A beam along any SVG path (a diagram link, a timeline). Put it inside your own <svg> with the same coordinates.
 * The base line is drawn faint; the comet loops while the scene is on screen.
 */
export function BeamPath({ d, speed = 2.6, length = 18, diagram = true, still = 0.6, color = "var(--fx-glow)", base = true, width = 2 }:
  { d: string; speed?: number; length?: number; diagram?: boolean; still?: number; color?: string; base?: boolean; width?: number }) {
  const on = allow("light", { diagram });
  const ref = useRef<SVGGElement>(null);
  useLoop(() => {
    const segs = ref.current?.querySelectorAll<SVGPathElement>("[data-len]");
    if (!segs?.length) return null;
    return gsap.fromTo(segs, { strokeDashoffset: (_i: number, t: Element) => +t.getAttribute("data-len")! },
      { strokeDashoffset: (_i: number, t: Element) => +t.getAttribute("data-len")! - 100 - 30, duration: speed, ease: "power1.inOut", repeat: -1, repeatDelay: 0.4 });
  }, { still: still * speed, enabled: on });
  return (
    <g ref={ref} className="fx-beam-path">
      {base && <path d={d} fill="none" stroke="var(--color-line-strong)" strokeWidth={width} vectorEffect="non-scaling-stroke" />}
      {on && [
        { len: length, w: width * 5, o: 0.1, cls: "" },
        { len: length * 0.7, w: width * 2.5, o: 0.22, cls: "" },
        { len: length, w: width, o: 0.9, cls: "" },
        { len: 2, w: width * 1.4, o: 1, cls: "", head: true },
      ].map((c, i) => (
        <path key={i} className={c.cls} d={d} fill="none" pathLength={100} data-len={c.len} stroke={c.head ? "#fff" : color}
          strokeWidth={c.w} opacity={c.o} strokeLinecap="round" strokeDasharray={`${c.len} ${200 - c.len}`} strokeDashoffset={c.len - still * 100}
          vectorEffect="non-scaling-stroke" />
      ))}
    </g>
  );
}

/* ================================================================== Spotlight */

/**
 * Soft light on one element; everything else dims. Place once per scene, after the content (it is an overlay).
 * Move it with spotlightTo(); hide with spotlightOff(). Academic: a calm focus ring instead of light.
 */
export function Spotlight({ className = "" }: { className?: string }) {
  const light = allow("light");
  return (
    <div aria-hidden className={`fx-spot ${className}`} data-mode={light ? "light" : "ring"}>
      {light ? (<><div className="fx-spot-veil" /><div className="fx-spot-light" /></>) : <div className="fx-spot-ring" />}
    </div>
  );
}

/**
 * Move the scene's <Spotlight> to `target` (element or selector in the scene) at `at`. Measured when the tween
 * first plays (so earlier tweens — a device frame flattening — are already applied). Reversible and seek-safe.
 */
export function spotlightTo(tl: TL, spot: Element | undefined, target: Element | string, at: At, { pad = 28, duration = 0.9, ease = "power3.inOut" } = {}) {
  if (!spot) return tl;
  const ring = spot.getAttribute("data-mode") === "ring";
  const el = () => resolve(target, spot)!;
  const r = () => rectIn(el(), spot);
  const first = !spot.hasAttribute("data-used");
  spot.setAttribute("data-used", "");
  if (ring) {
    const ringEl = spot.querySelector(".fx-spot-ring")!;
    if (first) tl.fromTo(spot, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4, ease: "power1.out", immediateRender: false }, at);
    tl.to(ringEl, {
      x: () => r().x - pad / 2, y: () => r().y - pad / 2, width: () => r().w + pad, height: () => r().h + pad,
      duration: first ? 0.01 : duration, ease, immediateRender: false,
    }, at);
    return tl;
  }
  if (first) tl.fromTo(spot, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6, ease: "power1.out", immediateRender: false }, at);
  tl.to(spot, {
    "--sx": () => `${r().cx}px`, "--sy": () => `${r().cy}px`,
    "--rw": () => `${(r().w / 2 + pad) * 1.45}px`, "--rh": () => `${(r().h / 2 + pad) * 1.6}px`,
    duration: first ? 0.01 : duration, ease, immediateRender: false,
  }, at);
  return tl;
}

export function spotlightOff(tl: TL, spot: Element | undefined, at: At, duration = 0.5) {
  if (!spot) return tl;
  return tl.to(spot, { autoAlpha: 0, duration, ease: "power1.inOut" }, at);
}

/* ================================================================== DotGrid */

/**
 * Dot background. With light allowed, the dots near a target glow (glowTo). Otherwise plain faint dots.
 */
export function DotGrid({ gap = 32, className = "", style }: { gap?: number; className?: string; style?: CSSProperties }) {
  const glow = allow("light");
  return (
    <div aria-hidden className={`absolute inset-0 pointer-events-none fx-dotgrid ${className}`} style={{ ["--fx-dot-gap" as string]: `${gap}px`, ...style }}>
      <div className="fx-dots" />
      {glow && <div className="fx-dots-glow" />}
    </div>
  );
}

/** Move the dot glow to `target` (element or selector). No-op when light is not allowed. */
export function glowTo(tl: TL, grid: Element | undefined, target: Element | string, at: At, { radius = 380, duration = 1.1, ease = "power3.inOut" } = {}) {
  const g = grid?.querySelector(".fx-dots-glow");
  if (!g) return tl;
  const r = () => rectIn(resolve(target, g)!, g);
  const first = !g.hasAttribute("data-used");
  g.setAttribute("data-used", "");
  if (first) tl.fromTo(g, { opacity: 0 }, { opacity: 0.9 * (0.6 + intensity * 0.4), duration: 0.8, ease: "power1.out", immediateRender: false }, plus(at, 0));
  return tl.to(g, { "--gx": () => `${r().cx}px`, "--gy": () => `${r().cy}px`, "--gr": () => `${Math.max(radius, 0.75 * Math.max(r().w, r().h))}px`, duration: first ? 0.01 : duration, ease, immediateRender: false }, at);
}

/* ================================================================== Aurora */

type Blob = { x: number; y: number; r: number; c: 0 | 1 | 2; o: number; dx: number; dy: number; period: number; phase: number };

/** CSS colour (tokens, color-mix, oklab…) → [r, g, b] via a 1×1 canvas. */
function rgbOf(el: Element, cssVar: string): [number, number, number] {
  const probe = document.createElement("span");
  probe.style.color = `var(${cssVar})`;
  el.appendChild(probe);
  const c = getComputedStyle(probe).color;
  probe.remove();
  const cv = document.createElement("canvas");
  cv.width = cv.height = 1;
  const x = cv.getContext("2d")!;
  x.fillStyle = c;
  x.fillRect(0, 0, 1, 1);
  const d = x.getImageData(0, 0, 1, 1).data;
  return [d[0], d[1], d[2]];
}

const AW = 320, AH = 180; // drawn small, upscaled by CSS: soft gradients do not need pixels

/**
 * Slow gradient mesh for hero scenes: 4 soft light blobs drifting around `at` (% of the scene; default top
 * centre), drawn on a 320×180 canvas that CSS scales to the stage (cheap: one tiny draw + one composite per
 * frame, no blend modes or blur filters). Every frame is a pure function of time, so the export frame is fixed.
 * `top` adds a thin horizon of light on the top edge; `loop={false}` keeps one still frame.
 * Showcase: full; balanced: softer, hero only; otherwise a static soft gradient (degraded, still there).
 */
export function Aurora({ hero = true, at = [50, 0], top = true, loop = true, className = "", children }: {
  hero?: boolean; at?: [number, number]; top?: boolean;
  /** false = draw one still frame (use it under a <Glass>: anything animating under a backdrop blur re-blurs every frame) */
  loop?: boolean; className?: string; children?: ReactNode;
}) {
  const on = allow("aurora", { hero });
  const ref = useRef<HTMLCanvasElement>(null);
  const k = intensity || 0.35;
  const [ax, ay] = at;
  const blobs: Blob[] = [
    { x: ax - 16, y: ay + 4, r: 0.42, c: 0, o: 0.42, dx: 8, dy: 6, period: 23, phase: 0 },
    { x: ax + 14, y: ay - 2, r: 0.36, c: 1, o: 0.3, dx: -10, dy: 5, period: 29, phase: 1.7 },
    { x: ax + 2, y: ay + 14, r: 0.28, c: 0, o: 0.32, dx: 7, dy: -7, period: 19, phase: 3.1 },
    { x: ax - 2, y: ay + 6, r: 0.16, c: 2, o: 0.16, dx: -5, dy: 4, period: 17, phase: 4.4 },
  ];
  useLoop(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return null;
    const dark = !!cv.closest(".hero");
    const g1 = rgbOf(cv, "--fx-glow"), g2 = rgbOf(cv, "--fx-glow-2");
    const pal = [g1, g2, g2.map((v) => Math.round(v + (255 - v) * 0.6)) as [number, number, number]];
    const amp = 0.6 + 0.4 * k;
    const draw = (t: number) => {
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, AW, AH);
      ctx.globalCompositeOperation = dark ? "screen" : "source-over";
      for (const b of blobs) {
        const w = (2 * Math.PI * t) / b.period + b.phase;
        const x = ((b.x + Math.sin(w) * b.dx * amp) / 100) * AW;
        const y = ((b.y + Math.cos(w * 0.8) * b.dy * amp) / 100) * AH;
        const r = b.r * AW * (1 + 0.12 * Math.sin(w * 0.6));
        const [R, G, B] = pal[b.c];
        const o = b.o * (dark ? 1 : 0.35);
        const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, `rgba(${R},${G},${B},${o})`);
        grad.addColorStop(0.5, `rgba(${R},${G},${B},${o * 0.45})`);
        grad.addColorStop(1, `rgba(${R},${G},${B},0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, AW, AH);
      }
    };
    const clock = { t: 0 };
    draw(0);
    if (!loop) return null;
    return gsap.to(clock, { t: 3 * 23 * 29, duration: 3 * 23 * 29, ease: "none", repeat: -1, onUpdate: () => draw(clock.t) });
  }, { enabled: on });

  if (!on) {
    // degraded: a static soft gradient (no motion)
    return (
      <div aria-hidden className={`fx-aurora ${className}`}
        style={{ background: `radial-gradient(1100px 560px at ${ax - 10}% ${ay}%, color-mix(in srgb, var(--fx-glow) 12%, transparent), transparent 70%), radial-gradient(900px 480px at ${ax + 18}% ${ay - 4}%, color-mix(in srgb, var(--fx-glow-2) 9%, transparent), transparent 70%)` }}>
        {children}
      </div>
    );
  }
  return (
    <div aria-hidden className={`fx-aurora ${className}`} style={{ opacity: 0.55 + 0.45 * k }}>
      <canvas ref={ref} width={AW} height={AH} className="absolute inset-0 w-full h-full" />
      {/* a thin horizon of light along the top edge: light used as material, not decoration */}
      {top && <div className="absolute left-[8%] right-[8%] top-0 h-px" style={{ background: "linear-gradient(90deg, transparent, color-mix(in srgb, var(--fx-glow-2) 60%, white), transparent)", opacity: 0.7 * k }} />}
      <div className="fx-aurora-fade" />
      {children}
    </div>
  );
}

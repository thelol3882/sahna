import type { CSSProperties, ReactNode } from "react";
import { VIZ } from "./theme";
import { rng } from "./scale";
import { $$, resolveAt, type At, type TL } from "./util";

/**
 * Callout with a leader line. Coordinates are in the parent chart's pixel space (the chart root is `position:relative`).
 * (x, y) = top-left of the box; (tx, ty) = the point it explains. The leader is an elbow from the box edge nearest
 * the target, ending in a dot with a surface ring.
 */
export function Callout({ x, y, tx, ty, w = 360, children, solid = false, className = "", index }: {
  x: number; y: number; tx: number; ty: number; w?: number; children: ReactNode; solid?: boolean; className?: string; index?: number;
}) {
  // anchor: middle of the nearest vertical/horizontal edge (box height estimated; leader ends at the box edge)
  const h = 64;
  const ax = tx < x ? x : tx > x + w ? x + w : tx;
  const ay = ty < y ? y : ty > y + h ? y + h : y + h / 2;
  const horiz = ax === x || ax === x + w;
  const d = horiz ? `M${tx},${ty} L${(tx + ax) / 2},${ty} L${(tx + ax) / 2},${ay} L${ax},${ay}` : `M${tx},${ty} L${tx},${(ty + ay) / 2} L${ax},${(ty + ay) / 2} L${ax},${ay}`;
  return (
    <div className={`viz-co ${className}`} data-co={index}>
      <svg className="absolute inset-0 overflow-visible pointer-events-none" width="1" height="1" aria-hidden>
        <path className="viz-co-line" d={d} fill="none" stroke="var(--viz-ink-2)" strokeWidth={2} strokeLinejoin="round" />
        <circle className="viz-co-dot" cx={tx} cy={ty} r={7} fill="var(--viz-ink)" stroke="var(--viz-surface)" strokeWidth={3} />
      </svg>
      <div className={`viz-callout viz-co-box ${solid ? "is-solid" : ""}`} style={{ left: x, top: y, width: w }}>{children}</div>
    </div>
  );
}

/** Leader draws from the point to the box, then the box pops in. */
export function calloutIn(tl: TL, co: Element | undefined, at: At) {
  if (!co) return tl;
  tl.fromTo($$(co, ".viz-co-dot"), { scale: 0, transformOrigin: "50% 50%" }, { scale: 1, duration: 0.35, ease: "back.out(2.5)" }, at)
    .fromTo($$(co, ".viz-co-line"), { drawSVG: "0% 0%" }, { drawSVG: "0% 100%", duration: 0.45, ease: "power2.inOut" }, `<0.1`)
    .fromTo($$(co, ".viz-co-box"), { autoAlpha: 0, y: 12, scale: 0.96 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.45 }, "<0.3");
  return tl;
}

/** Highlight band over a span of a chart (x0..x1 in chart px), with a label on top. */
export function Band({ x0, x1, top, height, label, index, style }: { x0: number; x1: number; top: number; height: number; label?: ReactNode; index?: number; style?: CSSProperties }) {
  return (
    <div className="viz-band absolute" data-band={index} style={{ left: x0, top, width: x1 - x0, height, ...style }}>
      <div className="viz-band-fill absolute inset-0 rounded-[10px]" style={{ background: "var(--viz-band)", borderLeft: "2px solid var(--viz-band-line)", borderRight: "2px solid var(--viz-band-line)" }} />
      {label && <div className="viz-band-label absolute left-0 right-0 top-[10px] text-center viz-sub font-semibold whitespace-nowrap">{label}</div>}
    </div>
  );
}

export function bandIn(tl: TL, band: Element | undefined, at: At) {
  if (!band) return tl;
  tl.fromTo($$(band, ".viz-band-fill"), { scaleX: 0, transformOrigin: "0% 50%" }, { scaleX: 1, duration: 0.7, ease: "power3.inOut" }, at)
    .fromTo($$(band, ".viz-band-label"), { autoAlpha: 0, y: -8 }, { autoAlpha: 1, y: 0, duration: 0.4 }, "<0.4");
  return tl;
}

/** "Source: …" line for a chart card; pass the data object(s) the chart was drawn from. */
export function ChartSource({ of, className = "", style }: { of: { source: string } | { source: string }[]; className?: string; style?: CSSProperties }) {
  return <div className={`viz-source ${className}`} style={style}>Source: {sourceOf(...(Array.isArray(of) ? of : [of]))}</div>;
}

/** Unique sources joined, for a scene's `source` meta (footer). */
export const sourceOf = (...items: { source: string }[]) => [...new Set(items.map((i) => i.source))].join(" · ");

/** Showcase only: a small burst of particles at (x, y) in chart px. Deterministic (seeded), ends invisible. */
export function Burst({ x, y, n = 12, seed = 1, index }: { x: number; y: number; n?: number; seed?: number; index?: number }) {
  if (!VIZ.particles) return null;
  const r = rng(seed);
  return (
    <g className="viz-burst" data-burst={index} aria-hidden>
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 + r() * 0.5, dist = 34 + r() * 46;
        return <circle key={i} cx={x} cy={y} r={2 + r() * 3} fill={i % 3 ? "var(--viz-hi)" : "var(--viz-ink)"} opacity={0}
          data-dx={(Math.cos(a) * dist).toFixed(1)} data-dy={(Math.sin(a) * dist).toFixed(1)} />;
      })}
    </g>
  );
}

export function burstIn(tl: TL, burst: Element | undefined, at: At) {
  if (!burst) return tl;
  const t0 = resolveAt(tl, at);
  $$(burst, "circle").forEach((c, i) => {
    const dx = Number((c as SVGElement).dataset.dx), dy = Number((c as SVGElement).dataset.dy);
    const t = t0 + i * 0.012;
    tl.fromTo(c, { x: 0, y: 0 }, { x: dx, y: dy, duration: 0.9, ease: "power2.out" }, t)
      .fromTo(c, { opacity: 0 }, { opacity: 1, duration: 0.08, ease: "none" }, t)
      .to(c, { opacity: 0, duration: 0.75, ease: "power1.in", immediateRender: false }, t + 0.12);
  });
  return tl;
}

/** Showcase only: a light beam that travels once along `path` (a duplicate path with class viz-beam). Ends invisible. */
export function beamIn(tl: TL, beam: Element | undefined, at: At, duration = 1.4) {
  if (!beam || !VIZ.beams) return tl;
  const t = resolveAt(tl, at);
  tl.fromTo(beam, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.01 }, t)
    .fromTo(beam, { drawSVG: "0% 0%" }, { drawSVG: "0% 12%", duration: duration * 0.15, ease: "none" }, t)
    .to(beam, { drawSVG: "88% 100%", duration: duration * 0.7, ease: "none", immediateRender: false }, t + duration * 0.15)
    .to(beam, { drawSVG: "100% 100%", duration: duration * 0.15, ease: "none", immediateRender: false }, t + duration * 0.85)
    .to(beam, { autoAlpha: 0, duration: 0.01, immediateRender: false }, t + duration);
  return tl;
}

import type { ReactNode } from "react";
import { Band, Burst, Callout, bandIn, beamIn, burstIn, calloutIn } from "./annotate";
import { linear, niceTicks } from "./scale";
import { VIZ, vizClass } from "./theme";
import { $$, resolveAt, type At, type TL } from "./util";
import { fmtDate, fmtNum, type NumFmt } from "./format";

export type Pt = { x: string; y: number };
export type Series = { key: string; label: string; points: Pt[] };
export type LineNote = { x: string; text: ReactNode; dx?: number; dy?: number; w?: number };
export type LineBand = { from: string; to: string; label?: ReactNode };

const ms = (iso: string) => Date.parse(iso.length <= 7 ? `${iso}-01T00:00:00Z` : iso.length <= 10 ? `${iso}T00:00:00Z` : iso);

/**
 * Time line chart: the main series draws (DrawSVG) with an area wash and a marker that rides the head showing
 * its value; context series are grey; notes pin to dates of the main series (callout + leader); bands mark a span.
 * Straight segments only (no smoothing: a curve invents values between points).
 * y starts at 0 unless `zero={false}` (then the axis says where it starts).
 */
export function LineChart({ id, series, main, width, height, yFormat = {}, zero = true, notes = [], bands = [], xTicks, endLabel = true, children }: {
  id: string; series: Series[]; main: string; width: number; height: number; yFormat?: NumFmt; zero?: boolean;
  notes?: LineNote[]; bands?: LineBand[]; xTicks?: string[]; endLabel?: boolean; children?: ReactNode;
}) {
  const L = 96, R = endLabel ? 200 : 40, T = 40, B = 56;
  const pw = width - L - R, ph = height - T - B;
  const all = series.flatMap((s) => s.points);
  const xs = all.map((p) => ms(p.x));
  const lo = zero ? 0 : Math.min(...all.map((p) => p.y));
  const hiV = Math.max(...all.map((p) => p.y));
  const ticks = niceTicks(lo, hiV, 4);
  const yTop = ticks[ticks.length - 1] < hiV ? hiV : ticks[ticks.length - 1];
  const y0 = zero ? 0 : ticks[0];
  const X = linear([Math.min(...xs), Math.max(...xs)], [L, L + pw]);
  const Y = linear([y0, yTop], [T + ph, T]);
  const m = series.find((s) => s.key === main)!;
  const P = m.points.map((p) => [X(ms(p.x)), Y(p.y)] as [number, number]);
  const cum = [0];
  for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const d = (pts: [number, number][]) => "M" + pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("L");
  const area = `${d(P)}L${P[P.length - 1][0].toFixed(1)},${T + ph}L${P[0][0].toFixed(1)},${T + ph}Z`;
  const tickIdx = xTicks ? xTicks.map((x) => m.points.findIndex((p) => p.x === x)).filter((i) => i >= 0)
    : m.points.map((_, i) => i).filter((i) => i % Math.ceil(m.points.length / 6) === 0);
  const idx = (x: string) => { const i = m.points.findIndex((p) => p.x === x); if (i < 0) throw new Error(`LineChart ${id}: no point at ${x}`); return i; };
  const clip = `lc-clip-${id}`;
  const meta = { P, cum, v: m.points.map((p) => p.y), fmt: yFormat };
  const last = P[P.length - 1];
  return (
    <div data-viz={id} className={vizClass("relative")} style={{ width, height }} data-line={JSON.stringify(meta)}>
      {bands.map((b, i) => <Band key={i} index={i} x0={X(ms(b.from))} x1={X(ms(b.to))} top={T - 30} height={ph + 30} label={b.label} />)}
      <svg className="absolute inset-0 overflow-visible" width={width} height={height} aria-hidden>
        <defs><clipPath id={clip}><rect className="lc-clip" x={0} y={0} width={width} height={height} /></clipPath></defs>
        {ticks.filter((v) => v >= y0).map((v) => (
          <g key={v} className="lc-grid">
            <line x1={L} x2={L + pw} y1={Y(v)} y2={Y(v)} stroke={v === y0 ? "var(--viz-base)" : "var(--viz-grid)"} strokeWidth={v === y0 ? 2 : 1} />
            <text className="viz-tick" x={L - 16} y={Y(v) + 6} textAnchor="end">{fmtNum(v, { ...yFormat, decimals: 0, style: yFormat.style === "currency" || v >= 10000 ? "compact" : yFormat.style })}</text>
          </g>
        ))}
        {tickIdx.map((i) => (
          <text key={i} className="viz-tick lc-xtick" x={P[i][0]} y={T + ph + 34} textAnchor="middle">
            {fmtDate(m.points[i].x, { year: i === 0 || m.points[i].x.slice(5, 7) === "01" })}
          </text>
        ))}
        {series.filter((s) => s.key !== main).map((s) => {
          const pts = s.points.map((p) => [X(ms(p.x)), Y(p.y)] as [number, number]);
          const e = pts[pts.length - 1];
          return (
            <g key={s.key} className="lc-ctx">
              <path className="lc-ctx-line" d={d(pts)} fill="none" stroke="var(--viz-context)" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
              {endLabel && <text className="viz-sub lc-ctx-label" x={e[0] + 16} y={e[1] + 7}>{s.label}</text>}
            </g>
          );
        })}
        <path className="lc-area" d={area} fill="var(--viz-area)" clipPath={`url(#${clip})`} />
        <path className="lc-line viz-glow" d={d(P)} fill="none" stroke="var(--viz-hi)" strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
        {VIZ.beams && <path className="lc-beam viz-beam" d={d(P)} fill="none" stroke="white" strokeWidth={5} strokeLinecap="round" style={{ visibility: "hidden", filter: "drop-shadow(0 0 8px white) drop-shadow(0 0 18px var(--viz-hi))" }} />}
        {notes.map((n, i) => <Burst key={i} index={i} x={P[idx(n.x)][0]} y={P[idx(n.x)][1]} seed={i + 3} />)}
        <g className="lc-marker">
          <circle r={10} fill="var(--viz-hi)" stroke="var(--viz-surface)" strokeWidth={4} />
          <text className="lc-mval viz-value" y={-24} textAnchor="middle" style={{ paintOrder: "stroke", stroke: "var(--viz-surface)", strokeWidth: 8, strokeLinejoin: "round" }}>{fmtNum(m.points[m.points.length - 1].y, yFormat)}</text>
        </g>
        {endLabel && <text className="viz-label lc-end" x={last[0] + 22} y={last[1] + 8}>{m.label}</text>}
      </svg>
      {notes.map((n, i) => {
        const p = P[idx(n.x)];
        return <Callout key={i} index={i} tx={p[0]} ty={p[1]} x={p[0] + (n.dx ?? -380)} y={p[1] + (n.dy ?? -150)} w={n.w ?? 340}>{n.text}</Callout>;
      })}
      {children}
    </div>
  );
}

type Meta = { P: [number, number][]; cum: number[]; v: number[]; fmt: NumFmt };
const state = new WeakMap<Element, number>();
const metaOf = (root: Element) => JSON.parse((root as HTMLElement).dataset.line!) as Meta;

/** position + interpolated value at path length s */
function at(meta: Meta, s: number) {
  const { P, cum, v } = meta;
  let i = 0;
  while (i < cum.length - 2 && cum[i + 1] < s) i++;
  const seg = cum[i + 1] - cum[i] || 1;
  const u = Math.max(0, Math.min(1, (s - cum[i]) / seg));
  return { x: P[i][0] + (P[i + 1][0] - P[i][0]) * u, y: P[i][1] + (P[i + 1][1] - P[i][1]) * u, val: v[i] + (v[i + 1] - v[i]) * u };
}

/** Draw the main line from its current end to point index `to` (marker rides the head, area follows). */
export function lineTo(tl: TL, root: Element, to: number, at_: At, duration = 1.4) {
  const t = resolveAt(tl, at_);
  const meta = metaOf(root);
  const from = state.get(root) ?? 0;
  const total = meta.cum[meta.cum.length - 1];
  const f0 = meta.cum[from] / total, f1 = meta.cum[to] / total;
  const line = $$(root, ".lc-line")[0], clipR = $$(root, ".lc-clip")[0] as SVGRectElement, mk = $$(root, ".lc-marker")[0] as SVGGElement;
  const mval = $$(root, ".lc-mval")[0];
  const ease = "power1.inOut";
  tl.fromTo(line, { drawSVG: `0% ${f0 * 100}%` }, { drawSVG: `0% ${f1 * 100}%`, duration, ease, immediateRender: from === 0 }, t);
  const o = { s: meta.cum[from] };
  const place = () => {
    const p = at(meta, o.s);
    mk.setAttribute("transform", `translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`);
    clipR.setAttribute("width", p.x.toFixed(1));
    // exact data value at a data point, interpolated in between
    const exact = meta.cum.findIndex((c) => Math.abs(c - o.s) < 0.01);
    mval.textContent = fmtNum(exact >= 0 ? meta.v[exact] : p.val, meta.fmt);
  };
  tl.fromTo(o, { s: meta.cum[from] }, { s: meta.cum[to], duration, ease, immediateRender: false, onUpdate: place, onStart: place }, t);
  if (from === 0) { place(); }
  if (to === meta.P.length - 1) (mval as HTMLElement).dataset.final = fmtNum(meta.v[to], meta.fmt);
  state.set(root, to);
  return tl;
}

/** Grid, ticks and context series in, then the main line draws to point `to` (default: the end). */
export function lineIn(tl: TL, root: Element, at_: At, { to, duration = 1.6 }: { to?: number; duration?: number } = {}) {
  const t = resolveAt(tl, at_);
  const meta = metaOf(root);
  state.set(root, 0);
  tl.fromTo($$(root, ".lc-grid, .lc-xtick"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4, stagger: 0.03 }, t)
    .fromTo($$(root, ".lc-ctx-line"), { drawSVG: "0% 0%" }, { drawSVG: "0% 100%", duration: duration * 0.8, ease: "power1.inOut" }, t + 0.2)
    .fromTo($$(root, ".lc-ctx-label"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4 }, t + 0.2 + duration * 0.8)
    .fromTo($$(root, ".lc-marker"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2 }, t + 0.3)
    .set($$(root, ".lc-end"), { autoAlpha: 0 }, 0);
  $$(root, ".viz-co, .viz-band").forEach((e) => tl.set(e, { autoAlpha: 0 }, 0));
  lineTo(tl, root, to ?? meta.P.length - 1, t + 0.3, duration);
  if ((to ?? meta.P.length - 1) === meta.P.length - 1) lineEnd(tl, root, t + 0.3 + duration);
  return tl;
}

/** The series name appears at the line end; showcase: a light beam runs along the whole line. */
export function lineEnd(tl: TL, root: Element, at_: At) {
  const t = resolveAt(tl, at_);
  tl.fromTo($$(root, ".lc-end"), { autoAlpha: 0, x: -10 }, { autoAlpha: 1, x: 0, duration: 0.4, immediateRender: false }, t);
  beamIn(tl, $$(root, ".lc-beam")[0], t + 0.1);
  return tl;
}

/** Note i pins to its date: leader draws, box pops (showcase: particles at the point). */
export function lineNote(tl: TL, root: Element, i: number, at_: At) {
  const t = resolveAt(tl, at_);
  const co = $$(root, `.viz-co[data-co="${i}"]`)[0];
  tl.set(co, { autoAlpha: 1 }, t);
  calloutIn(tl, co, t);
  burstIn(tl, $$(root, `.viz-burst[data-burst="${i}"]`)[0], t);
  return tl;
}

export function lineBand(tl: TL, root: Element, i: number, at_: At) {
  const t = resolveAt(tl, at_);
  const b = $$(root, `.viz-band[data-band="${i}"]`)[0];
  tl.set(b, { autoAlpha: 1 }, t);
  return bandIn(tl, b, t);
}

/** Point index of an ISO date in the main series (for lineTo). */
export const pointIndex = (s: Series, x: string) => s.points.findIndex((p) => p.x === x);

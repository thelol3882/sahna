import type { ReactNode } from "react";
import { Burst, beamIn, burstIn } from "./annotate";
import { VIZ, vizClass } from "./theme";
import { $$, resolveAt, type At, type TL } from "./util";
import { fmtNum, type NumFmt } from "./format";

/** Output of scripts/geo-build.mjs */
export type MapData = {
  width: number; height: number; source: string;
  regions: { id: string; d: string; cx: number; cy: number; bbox: number[]; area: number }[];
  places: Record<string, { x: number; y: number; lon: number; lat: number }>;
};
export type MapPlace = { id: string; label: string; hub?: boolean; dir?: "r" | "l" | "t" | "b"; dx?: number; dy?: number };
export type MapRoute = { from: string; to: string; bend?: number };

/**
 * Generic SVG map from a build-time JSON (no geo library at runtime).
 * Regions fill from data in ordinal classes (`breaks`, light → dark, legend with the numbers),
 * pins drop on places, routes draw as arcs. Unknown region/place ids throw at render (typos never fail silently).
 */
export function GeoMap({ id, map, width, values, breaks, format = {}, places = [], routes = [], legendTitle, regionLabels = [], children }: {
  id: string; map: MapData; width: number; values?: Record<string, number>; breaks?: number[]; format?: NumFmt;
  places?: MapPlace[]; routes?: MapRoute[]; legendTitle?: ReactNode;
  regionLabels?: { id: string; text: ReactNode; dx?: number; dy?: number }[]; children?: ReactNode;
}) {
  const k = width / map.width;
  const height = map.height * k;
  const ids = new Set(map.regions.map((r) => r.id));
  for (const key of Object.keys(values ?? {})) if (!ids.has(key)) throw new Error(`GeoMap ${id}: unknown region "${key}"`);
  for (const p of places) if (!map.places[p.id]) throw new Error(`GeoMap ${id}: unknown place "${p.id}" (add it to the map config and rebuild)`);
  const cls = (v: number | undefined) => (v === undefined || !breaks ? 0 : 1 + breaks.filter((b) => v >= b).length);
  const pos = (pid: string) => map.places[pid];
  const arc = (r: MapRoute) => {
    const a = pos(r.from), b = pos(r.to);
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy);
    const bend = (r.bend ?? 0.18) * dist;
    // bend to the "north" side of the chord
    const nx = -dy / dist, ny = dx / dist, s = ny > 0 ? -1 : 1;
    return `M${a.x},${a.y} Q${(mx + nx * bend * s).toFixed(1)},${(my + ny * bend * s).toFixed(1)} ${b.x},${b.y}`;
  };
  const labelPos = (p: MapPlace, hub: boolean) => {
    const o = hub ? 22 : 16;
    const d = p.dir ?? "r";
    const base = d === "r" ? { x: o, y: 7, a: "start" } : d === "l" ? { x: -o, y: 7, a: "end" } : d === "t" ? { x: 0, y: -o - 6, a: "middle" } : { x: 0, y: o + 16, a: "middle" };
    return { ...base, x: base.x + (p.dx ?? 0), y: base.y + (p.dy ?? 0) };
  };
  const nClasses = breaks ? breaks.length + 1 : 0;
  return (
    <div data-viz={id} className={vizClass("relative")} style={{ width, height }}>
      <svg width={width} height={height} viewBox={`0 0 ${map.width} ${map.height}`} className="overflow-visible" aria-hidden>
        <g className="gm-outline">{map.regions.map((r) => <path key={r.id} className="viz-outline" d={r.d} style={{ strokeWidth: 5 / k }} />)}</g>
        <g className="gm-regions">{map.regions.map((r) => <path key={r.id} className="viz-region gm-region" data-id={r.id} d={r.d} style={{ strokeWidth: 1.4 / k }} />)}</g>
        <g className="gm-fills">{map.regions.filter((r) => values?.[r.id] !== undefined).map((r) => (
          <path key={r.id} className="gm-fill" data-id={r.id} data-cls={cls(values![r.id])} d={r.d} fill={`var(--viz-q${cls(values![r.id])})`} stroke="var(--viz-surface)" style={{ strokeWidth: 1.4 / k }} />
        ))}</g>
        {regionLabels.map((l) => {
          const r = map.regions.find((x) => x.id === l.id);
          if (!r) throw new Error(`GeoMap ${id}: unknown region label "${l.id}"`);
          return <text key={l.id} className="gm-rlabel viz-pin-label" x={r.cx + (l.dx ?? 0)} y={r.cy + (l.dy ?? 0)} textAnchor="middle" style={{ fontSize: 19 / k, strokeWidth: 6 / k }}>{l.text}</text>;
        })}
        <g className="gm-routes">{routes.map((r, i) => (
          <g key={i} className="gm-route" data-i={i}>
            <path className="gm-route-line viz-glow" d={arc(r)} fill="none" stroke="var(--viz-hi)" strokeWidth={3.5 / k} strokeLinecap="round" />
            {VIZ.beams && <path className="gm-route-beam" d={arc(r)} fill="none" stroke="white" strokeWidth={4 / k} strokeLinecap="round" style={{ visibility: "hidden", filter: "drop-shadow(0 0 6px white)" }} />}
          </g>
        ))}</g>
        <g className="gm-pins">{places.map((p) => {
          const { x, y } = pos(p.id);
          const hub = !!p.hub;
          const lp = labelPos(p, hub);
          const s = (hub ? 1.25 : 1) / k;
          return (
            <g key={p.id} className="gm-pin" data-id={p.id} transform={`translate(${x},${y})`}>
              <circle className="gm-ping" r={14 / k} fill="none" stroke="var(--viz-hi)" strokeWidth={3 / k} opacity={0} />
              <g className="gm-drop">
                <g transform={`scale(${s})`}>
                  {hub
                    ? <path d="M0,0 C-5,-9 -15,-15 -15,-28 A15,15 0 1 1 15,-28 C15,-15 5,-9 0,0Z" fill="var(--viz-hi)" stroke="var(--viz-surface)" strokeWidth={3} />
                    : <circle r={8} fill="var(--viz-ink)" stroke="var(--viz-surface)" strokeWidth={3.5} />}
                  {hub && <circle cy={-28} r={6} fill="var(--viz-surface)" />}
                </g>
              </g>
              <text className="gm-plabel viz-pin-label" x={lp.x / k} y={(lp.y + (hub && (p.dir ?? "r") !== "b" ? -14 : 0)) / k} textAnchor={lp.a as "start"}
                style={{ fontSize: (hub ? 24 : 20) / k, fontWeight: hub ? 800 : 600, strokeWidth: 6 / k }}>{p.label}</text>
              {hub && <Burst x={0} y={-28 / k} seed={7} n={14} />}
            </g>
          );
        })}</g>
      </svg>
      {breaks && (
        <div className="gm-legend absolute flex flex-col gap-2" style={{ left: 0, bottom: -8 }}>
          {legendTitle && <span className="viz-sub font-semibold">{legendTitle}</span>}
          <div className="flex items-end gap-[3px]">
            {Array.from({ length: nClasses }, (_, i) => (
              <div key={i} className="flex flex-col gap-1 items-start">
                <div className="w-[96px] h-[18px] rounded-[4px]" style={{ background: `var(--viz-q${i + 1})` }} />
                <span className="viz-tick" style={{ fontSize: 18, color: "var(--viz-muted)" }}>
                  {i === 0 ? `< ${fmtNum(breaks[0], format)}` : `≥ ${fmtNum(breaks[i - 1], format)}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {children}
    </div>
  );
}

export function mapIn(tl: TL, root: Element, at: At) {
  const t = resolveAt(tl, at);
  const regions = $$(root, ".gm-region");
  tl.fromTo($$(root, ".gm-outline"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6 }, t)
    .fromTo(regions, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5, stagger: { each: 0.03, from: "start" } }, t + 0.1);
  tl.set($$(root, ".gm-fill, .gm-rlabel, .gm-legend, .gm-pin, .gm-route"), { autoAlpha: 0 }, 0);
  return tl;
}

/** Regions fill with their class colour, west → east sweep; legend and region labels appear. */
export function mapFill(tl: TL, root: Element, at: At) {
  const t = resolveAt(tl, at);
  const fills = $$(root, ".gm-fill").sort((a, b) => (a as SVGGraphicsElement).getBBox().x - (b as SVGGraphicsElement).getBBox().x);
  tl.fromTo(fills, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5, stagger: 0.06, immediateRender: false }, t)
    .fromTo($$(root, ".gm-legend"), { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.4, immediateRender: false }, t + 0.2);
  const labels = $$(root, ".gm-rlabel");
  if (labels.length) tl.fromTo(labels, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4, stagger: 0.1, immediateRender: false }, t + 0.6);
  return tl;
}

/** Pins drop in (bounce), a ping ring expands from each tip, labels fade in. Hub first. */
export function mapPins(tl: TL, root: Element, at: At) {
  const t = resolveAt(tl, at);
  $$(root, ".gm-pin").forEach((pin, i) => {
    const ti = t + i * 0.09;
    tl.fromTo(pin, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.01, immediateRender: false }, ti)
      .fromTo($$(pin, ".gm-drop"), { y: -60, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.6, ease: "bounce.out" }, ti)
      .fromTo($$(pin, ".gm-ping"), { scale: 0.4, opacity: 0, transformOrigin: "50% 50%" }, { keyframes: [{ opacity: 0.9, scale: 0.6, duration: 0.05 }, { scale: 3, opacity: 0, duration: 0.7, ease: "power2.out" }] }, ti + 0.45)
      .fromTo($$(pin, ".gm-plabel"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.35 }, ti + 0.4);
    burstIn(tl, $$(pin, ".viz-burst")[0], ti + 0.5);
  });
  return tl;
}

/** Routes draw from their origin (DrawSVG), one after another; showcase: a beam runs along each. */
export function mapRoutes(tl: TL, root: Element, at: At, each = 0.18) {
  const t = resolveAt(tl, at);
  $$(root, ".gm-route").forEach((r, i) => {
    const ti = t + i * each;
    tl.fromTo(r, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.01, immediateRender: false }, ti)
      .fromTo($$(r, ".gm-route-line"), { drawSVG: "0% 0%" }, { drawSVG: "0% 100%", duration: 0.9, ease: "power2.inOut" }, ti);
    beamIn(tl, $$(r, ".gm-route-beam")[0], ti + 0.9, 0.9);
  });
  return tl;
}

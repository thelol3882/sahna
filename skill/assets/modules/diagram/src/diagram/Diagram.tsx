import type { CSSProperties, ReactNode } from "react";
import { style as dialStyle, allow, type Style } from "../fx/dial";
import { DiagramIcon } from "./icons";
import { arrowHead, fit, pointAt, roundPath, sequenceGeometry, toStage, type SeqGeo } from "./geometry";
import type { Box, Fit, LGraph, LayoutFile, Metrics, Region } from "./types";
import "./diagram.css";

/* ------------------------------------------------------------------ view model (plain data, shared by renderer and story) */

export type Level = {
  name: string;
  graph: LGraph;
  /** where the diagram sits on the stage */
  region: Region;
  fit: Fit;
  depth: number;
  /** the node this level opens from (zoom) */
  parent?: { level: string; node: string };
  /** sequence views of flows of this level, with their geometry */
  seq: Record<string, { region: Region; geo: SeqGeo }>;
};
export type View = { file: LayoutFile; metrics: Metrics; root: string; panel: Region; levels: Record<string, Level>; style: Style };
export type ViewOpts = {
  /** stage region for the root diagram */
  region: Region;
  /** stage rectangle a zoomed node grows into (all deeper levels) */
  panel?: Region;
  /** max scale (default 1: never enlarge beyond the layout's px) */
  max?: number;
  /** sequence views: { flowName: region } for the root, { "graph:flow": region } for deeper levels */
  seq?: Record<string, Region>;
  /** region inside the panel for the inner diagram (default: panel inset under the title) */
  inner?: (panel: Region) => Region;
};

const DEFAULT_PANEL: Region = { x: 60, y: 120, w: 1800, h: 830 };
const innerOf = (p: Region): Region => ({ x: p.x + 40, y: p.y + 124, w: p.w - 80, h: p.h - 150 });

/** Build the view once at module level: `const VIEW = diagramView(LAYOUT, "system", { region, panel, seq })`. */
export function diagramView(file: LayoutFile, root: string, opts: ViewOpts): View {
  const panel = opts.panel ?? DEFAULT_PANEL;
  const levels: Record<string, Level> = {};
  const add = (name: string, region: Region, depth: number, parent?: Level["parent"]) => {
    const graph = file.graphs[name];
    if (!graph) throw new Error(`diagram: no graph "${name}" in the layout file (have ${Object.keys(file.graphs).join(", ")})`);
    if (levels[name]) return;
    const f = fit(graph, region, opts.max ?? 1);
    const seq: Level["seq"] = {};
    for (const [key, r] of Object.entries(opts.seq ?? {})) {
      const [g, flow] = key.includes(":") ? key.split(":") : [root, key];
      if (g !== name) continue;
      if (!graph.flows[flow]) throw new Error(`diagram: seq "${key}": no flow "${flow}" in graph "${name}"`);
      seq[flow] = { region: r, geo: sequenceGeometry(graph, graph.flows[flow], r, f) };
    }
    levels[name] = { name, graph, region, fit: f, depth, parent, seq };
    for (const n of graph.nodes) if (n.inside) add(n.inside, (opts.inner ?? innerOf)(panel), depth + 1, { level: name, node: n.id });
  };
  add(root, opts.region, 0);
  return { file, metrics: file.metrics, root, panel, levels, style: dialStyle };
}

/** Stage box of a node (or group) of a level. */
export function stageBox(view: View, level: string, id: string): Box {
  const L = view.levels[level];
  const b = L.graph.nodes.find((n) => n.id === id) ?? L.graph.groups.find((g) => g.id === id);
  if (!b) throw new Error(`diagram: no node "${id}" in "${level}"`);
  return toStage(b, L.fit);
}

/* ------------------------------------------------------------------ renderer */

/** One level of a view, scaled into its region. `children` render in layout coordinates (overlays: tables, gauges). */
export function Diagram({ view, level, children, style }: { view: View; level: string; children?: ReactNode; style?: CSSProperties }) {
  const L = view.levels[level];
  const g = L.graph, f = L.fit, M = view.metrics;
  const light = allow("light", { diagram: true });
    return (
    <div className={`dgx dgx-${level}`} data-level={level} style={{ left: f.x, top: f.y, width: g.width, height: g.height, transform: `scale(${f.s})`, ...style }}>
      <div className="dg-gs">
        {g.groups.map((x) => (
          <div key={x.id} className={`dg-g dg-g-${x.id}`} style={{ left: x.x, top: x.y, width: x.w, height: x.h }}>
            <div className="dg-gb"><div className="dg-ring" style={{ borderRadius: 28 }} /><span className="dg-gt">{x.title}</span></div>
          </div>
        ))}
      </div>
      <svg className="dg-svg" width={g.width} height={g.height} aria-hidden>
        <g className="dg-edges">
          {g.edges.map((e) => e.points && (
            <g key={e.id}>
              <path className={`dg-e dg-e-${e.id} ${e.hot ? "hot" : ""} ${e.dashed ? "dashed" : ""}`} d={roundPath(e.points)} data-edge={e.id} />
              <path className={`dg-ah dg-ah-${e.id} ${e.hot ? "hot" : ""}`} d={arrowHead(e.points)} />
              {e.both && <path className={`dg-ah dg-ah-${e.id} ${e.hot ? "hot" : ""}`} d={arrowHead(e.points, true)} />}
            </g>
          ))}
        </g>
        <g className="dg-hls">
          {g.edges.map((e) => e.points && (
            <g key={e.id}>
              {light && <path className={`dg-hlw dg-hlw-${e.id}`} d={roundPath(e.points)} />}
              <path className={`dg-hl dg-hl-${e.id}`} d={roundPath(e.points)} />
            </g>
          ))}
        </g>
        {light && (
          <g className="dg-beams">
            {g.edges.map((e) => e.points && (
              <g key={e.id}>
                <path className={`dg-bmw dg-bmw-${e.id}`} d={roundPath(e.points)} />
                <path className={`dg-bm dg-bm-${e.id}`} d={roundPath(e.points)} />
              </g>
            ))}
          </g>
        )}
        {Object.entries(L.seq).map(([flow, { geo }]) => <SeqLayer key={flow} flow={flow} geo={geo} />)}
        <g className="dg-pk" />
      </svg>
      <div className="dg-ls">
        {g.edges.filter((e) => e.label && e.labelBox).map((e) => {
          const b = e.labelBox!;
          return <div key={e.id} className={`dg-l dg-l-${e.id}`} style={{ left: b.x, top: b.y, width: b.w, height: b.h }}><span className="dg-lb">{e.label}</span></div>;
        })}
      </div>
      {g.nodes.map((n) => {
        const m = M[n.size];
        return (
          <div key={n.id} className={`dg-n dg-n-${n.id}`} data-node={n.id} data-tone={n.tone} style={{ left: n.x, top: n.y, width: n.w, height: n.h }}>
            <div className="dg-body">
              <div className="dg-halo" />
              <div className="dg-ring" />
              <div className="dg-card" style={{ gap: m.gap, padding: `0 ${m.pad}px` }}>
                <DiagramIcon name={n.icon} size={m.icon} />
                <div className="dg-txt">
                  <span className="dg-title" style={{ fontSize: m.title }}>{n.title}</span>
                  {n.sub && <span className="dg-sub" style={{ fontSize: m.sub }}>{n.sub}</span>}
                </div>
              </div>
              <div className="dg-alarm" />
              {n.badge && <span className="dg-badge">{n.badge}</span>}
            </div>
          </div>
        );
      })}
      {/* hop numbers: one per hop of every flow, placed along its edge (forward early, replies late) */}
      <div className="dg-hops">
        {/* hop numbers: one badge per (flow, edge) with every hop number that uses it ("1·9"), at ~1/3 of the edge */}
        {Object.entries(g.flows).flatMap(([name, fl]) => {
          const byEdge = new Map<string, number[]>();
          fl.hops.forEach((h, i) => byEdge.set(h.edge, [...(byEdge.get(h.edge) ?? []), i]));
          return [...byEdge.entries()].map(([edge, idx]) => {
            const e = g.edges.find((x) => x.id === edge);
            if (!e?.points) return null;
            const h = fl.hops[idx[0]];
            const [x, y] = pointAt(e.points, h.rev ? 0.68 : 0.32);
            return <span key={`${name}-${edge}`} className={`dg-hop ${idx.map((i) => `dg-hop-${name}-${i}`).join(" ")}`} style={{ left: x, top: y }}>{idx.map((i) => i + 1).join("·")}</span>;
          });
        })}
      </div>
      {Object.entries(L.seq).map(([flow, { geo }]) => geo.msgs.map((m) => (
        <span key={`${flow}-${m.i}`} className={`dg-st dg-st-${flow} dg-st-${flow}-${m.i}`} style={{ left: (m.x1 + m.x2) / 2, top: m.y - 4, opacity: 0, visibility: "hidden" }}><b className="dg-sn">{m.i + 1}</b>{m.label}</span>
      )))}
      {children}
    </div>
  );
}

/** Lifelines and messages of a sequence view (hidden until story.toSequence). */
function SeqLayer({ flow, geo }: { flow: string; geo: SeqGeo }) {
  return (
    <g className={`dg-seq dg-seq-${flow}`}>
      {geo.lanes.map((l) => <line key={l.id} className={`dg-sl dg-sl-${flow}`} x1={l.cx} x2={l.cx} y1={geo.top} y2={geo.bottom} style={{ opacity: 0 }} />)}
      {geo.msgs.map((m) => {
        const dir = Math.sign(m.x2 - m.x1) || 1;
        const x2 = m.x2 - dir * 2;
        const pts = [[m.x1, m.y], [x2, m.y]];
        return (
          <g key={m.i} className={`dg-sg dg-sg-${flow} dg-sg-${flow}-${m.i}`} style={{ opacity: 0, visibility: "hidden" }}>
            <path className={`dg-sm dg-sm-${flow}-${m.i} ${m.reply ? "reply" : ""} ${m.async ? "async" : ""}`} d={`M${m.x1} ${m.y} L${x2} ${m.y}`} />
            <path className={`dg-sa ${m.async ? "async" : ""}`} d={arrowHead(pts, false, 12)} />
          </g>
        );
      })}
    </g>
  );
}

/**
 * The whole view: background (showcase dot grid), the root diagram in a camera wrapper, and for every node with
 * `inside` a hidden panel + inner diagram (one level deeper each). `overlays[level]` render inside that level's
 * diagram in layout coordinates.
 */
export function DiagramView({ view, overlays = {}, bg = true, children }: { view: View; overlays?: Record<string, ReactNode>; bg?: boolean; children?: ReactNode }) {
  const levels = Object.values(view.levels).sort((a, b) => a.depth - b.depth);
  return (
    <div className="dgv" data-dg-style={view.style}>
      {bg && <div className="dgv-bg" />}
      {levels.map((L) => {
        const parent = L.parent ? view.levels[L.parent.level].graph.nodes.find((n) => n.id === L.parent!.node) : undefined;
        return (
          <div key={L.name} className={`dgc dgc-${L.name}`} style={L.depth ? { visibility: "hidden", opacity: 0 } : undefined}>
            {parent && (
              <div className={`dgp dgp-${L.name}`} style={{ left: view.panel.x, top: view.panel.y, width: view.panel.w, height: view.panel.h, borderRadius: 28 }}>
                <div data-tone={parent.tone} style={{ position: "absolute", inset: 0 }}>
                  <div className="dgp-cover"><DiagramIcon name={parent.icon} size={52} />{parent.title}</div>
                </div>
                <div className="dgp-head">
                  <span className="dgp-eyebrow">Inside · {parent.title}</span>
                  <span className="dgp-title">{L.graph.title}</span>
                </div>
              </div>
            )}
            <Diagram view={view} level={L.name}>{overlays[L.name]}</Diagram>
          </div>
        );
      })}
      {/* stage-coordinate extras (captions, HUDs, side tables) that should use the diagram tokens */}
      {children}
    </div>
  );
}

import type { CSSProperties } from "react";
import { resolveAt, type At, type FlowOpts, type Story, count } from "../story";

/**
 * Trace waterfall: one span per service of a journey. As the packet reaches a node, that node's bar starts to fill;
 * it is full when the reply leaves the node (or when the next hop arrives, for one-way hops). Bar geometry comes
 * from real milliseconds (start, dur); only the fill timing follows the packet.
 */
export type Span = { node: string; name: string; start: number; dur: number; depth?: number };

export function Waterfall({ id, spans, total, title = "trace", style, width = 760 }: { id: string; spans: Span[]; total: number; title?: string; style?: CSSProperties; width?: number }) {
  const NAME = 250, BAR = width - NAME - 110;
  return (
    <div className={`wf wf-${id}`} style={{ position: "absolute", width, padding: "18px 22px", borderRadius: 20, background: "var(--dg-node-bg)", border: "var(--dg-node-border)", boxShadow: "var(--dg-node-shadow)", color: "var(--dg-ink)", ...style }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, whiteSpace: "nowrap" }}>
        <span style={{ font: "500 18px var(--font-mono)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--dg-sub)" }}>{title}</span>
        <span style={{ fontSize: 20, fontWeight: 700 }}>total <span className="wf-total tnum">0</span> ms</span>
      </div>
      {spans.map((s, i) => (
        <div key={s.node + i} className={`wf-row wf-row-${s.node}`} style={{ display: "flex", alignItems: "center", height: 44 }}>
          <span style={{ width: NAME, paddingLeft: (s.depth ?? 0) * 18, fontSize: 20, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden" }}>{s.name}</span>
          <span style={{ position: "relative", width: BAR, height: 22 }}>
            <span style={{ position: "absolute", top: 10, left: 0, right: 0, height: 2, background: "color-mix(in srgb, var(--dg-sub) 25%, transparent)" }} />
            <span className="wf-bar" style={{ position: "absolute", top: 0, height: 22, borderRadius: 6, left: (s.start / total) * BAR, width: Math.max(4, (s.dur / total) * BAR), background: "color-mix(in srgb, var(--dg-flow-primary) 22%, transparent)" }}>
              <span className="wf-fill" style={{ position: "absolute", inset: 0, borderRadius: 6, background: "var(--dg-flow-primary)", transform: "scaleX(0)", transformOrigin: "0 50%" }} />
            </span>
          </span>
          <span className="mono" style={{ width: 110, textAlign: "right", fontSize: 19, whiteSpace: "nowrap" }}><span className="wf-ms tnum">0</span> ms</span>
        </div>
      ))}
    </div>
  );
}

/** Scene timeline: play the journey and fill the bars in sync. Returns the end time. */
export function trace(d: Story, tl: gsap.core.Timeline, q: (s: string) => Element[], { id, flow, spans, total }: { id: string; flow: string; spans: Span[]; total: number }, at: At, opts: FlowOpts = {}) {
  const t0 = resolveAt(tl, at);
  const open: Record<string, number> = {}, close: Record<string, number> = {};
  const end = d.flow(flow, t0, {
    ...opts,
    onHop: (i, arrive, hop, start) => {
      if (!hop.reply && open[hop.to] === undefined) open[hop.to] = arrive;
      if (hop.reply && close[hop.from] === undefined) close[hop.from] = start;
      opts.onHop?.(i, arrive, hop, start);
    },
  });
  spans.forEach((s, i) => {
    const a = open[s.node] ?? t0, b = Math.max(a + 0.25, close[s.node] ?? end - 0.1);
    const row = q(`.wf-${id} .wf-row`)[i];
    tl.fromTo(row.querySelector(".wf-fill"), { scaleX: 0 }, { scaleX: 1, duration: b - a, ease: "none", immediateRender: false }, a);
    count(tl, row.querySelector(".wf-ms"), 0, s.dur, a, { duration: b - a });
  });
  count(tl, q(`.wf-${id} .wf-total`)[0], 0, total, t0, { duration: end - t0 });
  return end;
}

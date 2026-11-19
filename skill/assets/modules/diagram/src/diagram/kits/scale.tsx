import type { CSSProperties } from "react";
import { resolveAt, type At, type Story, count } from "../story";
import type { Live } from "../live";

/**
 * Scale-out: one instance under load (throughput flat, p95 climbs, the instance turns red), then replicas appear
 * behind the load balancer and the numbers recover. Replicas are ordinary nodes of the graph (so ELK routes their
 * edges) kept out by story.enter(at, { hidden: replicas }) until scaleOut() reveals them.
 */
const fmt = (v: number) => Math.round(v).toLocaleString("en-US");
export type Stat = { key: string; label: string; unit: string; initial?: number };

/** HUD with big counters; render in stage coordinates. `initial` is the markup value; the timeline counts from there. */
export function Hud({ id, stats, style }: { id: string; stats: Stat[]; style?: CSSProperties }) {
  return (
    <div className={`hud hud-${id}`} style={{ position: "absolute", display: "flex", gap: 20, ...style }}>
      {stats.map((s) => (
        <div key={s.key} className={`hud-s hud-${s.key}`} style={{ minWidth: 250, padding: "16px 22px", borderRadius: 18, background: "var(--dg-node-bg)", border: "var(--dg-node-border)", boxShadow: "var(--dg-node-shadow)", color: "var(--dg-ink)" }}>
          <div style={{ font: "500 18px var(--font-mono)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--dg-sub)", whiteSpace: "nowrap" }}>{s.label}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, whiteSpace: "nowrap" }}>
            <span className="hud-v tnum" style={{ fontSize: 52, fontWeight: 700, letterSpacing: "-0.03em" }}>{fmt(s.initial ?? 0)}</span>
            <span style={{ fontSize: 22, color: "var(--dg-sub)" }}>{s.unit}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Set HUD values (count from the current ones). `tone` colours a stat: "danger" | "success" | null. */
export function hudTo(tl: gsap.core.Timeline, q: (s: string) => Element[], id: string, values: Record<string, { from: number; to: number; tone?: "danger" | "success" | null }>, at: At, duration = 1.6) {
  const t = resolveAt(tl, at);
  for (const [k, v] of Object.entries(values)) {
    count(tl, q(`.hud-${id} .hud-${k} .hud-v`)[0], v.from, v.to, t, { duration, format: fmt });
    if (v.tone !== undefined) tl.to(q(`.hud-${id} .hud-${k} .hud-v`), { color: v.tone ? `var(--dg-flow-${v.tone})` : "var(--dg-ink)", duration: 0.4 }, t + 0.2);
  }
  return t + duration;
}

/** Scene timeline: load spike on the single instance. */
export function overload(d: Story, tl: gsap.core.Timeline, q: (s: string) => Element[], o: { hud: string; node: string; flow: string; stats: Record<string, [number, number]> }, at: At) {
  const t = resolveAt(tl, at);
  const end = d.flow(o.flow, t, { numbers: false });
  d.alarm(o.node, t + 0.8);
  hudTo(tl, q, o.hud, Object.fromEntries(Object.entries(o.stats).map(([k, [a, b]], i) => [k, { from: a, to: b, tone: i === 1 ? "danger" : null }])), t + 0.4);
  return Math.max(end, t + 2.1);
}

/** Scene timeline: replicas appear, every instance gets traffic, numbers recover. */
export function scaleOut(d: Story, tl: gsap.core.Timeline, q: (s: string) => Element[], o: { hud: string; node: string; replicas: string[]; flows: string[]; stats: Record<string, [number, number]> }, at: At) {
  const t = resolveAt(tl, at);
  d.alarm(o.node, t, false);
  let end = d.reveal(o.replicas, t + 0.2);
  // one request per instance, in parallel, keeping each other's highlights
  o.flows.forEach((f, i) => { end = Math.max(end, d.flow(f, end - 0.2 + i * 0.25, { keep: i > 0, numbers: false, color: "success", focus: false })); });
  hudTo(tl, q, o.hud, Object.fromEntries(Object.entries(o.stats).map(([k, [a, b]], i) => [k, { from: a, to: b, tone: i === 1 ? "success" : null }])), t + 0.6, 2.0);
  return Math.max(end, t + 2.7);
}

/** Live: round robin across the instances (one flow per instance, staggered). */
export function liveRoundRobin(live: Live, flows: string[], color = "primary") {
  let t = 0;
  for (let k = 0; k < 2; k++) for (const f of flows) { live.flow(f, { at: t, color }); t += 0.35; }
  return t + 1.2;
}

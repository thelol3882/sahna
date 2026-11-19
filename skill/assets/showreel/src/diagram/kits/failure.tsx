import type { CSSProperties } from "react";
import { flowColor, makePacket, resolveAt, type At, type Story, count } from "../story";
import type { Live } from "../live";
import { hopDur } from "../geometry";

/**
 * Failure & recovery: a dependency turns red, the queue in front of it backs up (gauge + counter), the caller retries
 * with backoff (packets bounce off the red node, "retry 1 · 1 s" chips stack up), then the dependency recovers:
 * green, the backlog drains to zero. Two scene-timeline calls (failure, recovery), one live loop for each state.
 */

/** Queue gauge: render in layout coordinates next to the queue node (overlay of the diagram). */
export function QueueGauge({ id, label = "backlog", max, unit = "msgs", style }: { id: string; label?: string; max: number; unit?: string; style?: CSSProperties }) {
  return (
    <div className={`qg qg-${id}`} data-max={max} style={{ position: "absolute", width: 240, padding: "12px 16px", borderRadius: 16, background: "var(--dg-node-bg)", border: "var(--dg-node-border)", boxShadow: "var(--dg-node-shadow)", color: "var(--dg-ink)", opacity: 0, visibility: "hidden", ...style }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", whiteSpace: "nowrap" }}>
        <span style={{ font: "500 18px var(--font-mono)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--dg-sub)" }}>{label}</span>
        <span style={{ fontSize: 22, fontWeight: 700 }}><span className="qg-n tnum">0</span> <span style={{ fontSize: 18, fontWeight: 500, color: "var(--dg-sub)" }}>{unit}</span></span>
      </div>
      <div style={{ marginTop: 8, height: 12, borderRadius: 99, background: "color-mix(in srgb, var(--dg-sub) 22%, transparent)", overflow: "hidden" }}>
        <div className="qg-fill" style={{ height: "100%", borderRadius: 99, background: "var(--dg-flow-danger)", transform: "scaleX(0)", transformOrigin: "0 50%" }} />
      </div>
    </div>
  );
}

/** Status chip + retry list next to the failing node (layout coordinates). */
export function FailureNotes({ id, retries, down = "503 · timeouts", up = "200 · recovered", style }: { id: string; retries: number[]; down?: string; up?: string; style?: CSSProperties }) {
  const chip: CSSProperties = { position: "absolute", left: 0, top: 0, display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 999, padding: "4px 14px", fontSize: 19, fontWeight: 700, whiteSpace: "nowrap", opacity: 0, visibility: "hidden" };
  return (
    <div className={`fn fn-${id}`} style={{ position: "absolute", width: 260, height: 40 + retries.length * 36, ...style }}>
      <span className="fn-down" style={{ ...chip, background: "color-mix(in srgb, var(--dg-flow-danger) 16%, transparent)", color: "var(--dg-flow-danger)" }}>● {down}</span>
      <span className="fn-up" style={{ ...chip, background: "color-mix(in srgb, var(--dg-flow-success) 16%, transparent)", color: "var(--dg-flow-success)" }}>● {up}</span>
      {retries.map((s, i) => (
        <span key={i} className="fn-retry mono" style={{ position: "absolute", left: 0, top: 44 + i * 34, fontSize: 18, whiteSpace: "nowrap", color: "var(--dg-sub)", opacity: 0, visibility: "hidden" }}>
          ↻ retry {i + 1} · backoff {s} s
        </span>
      ))}
    </div>
  );
}

type FailOpts = {
  id: string;
  /** the dependency that fails */
  node: string;
  /** the edge the caller retries on, and the caller */
  edge: string; from: string;
  queue?: { id: string; peak: number };
  /** backoff seconds per retry (one chip each) */
  retries: number[];
  /** nodes to keep bright (the rest dims); edges between them stay bright too */
  focus?: string[];
};

/** Scene timeline: the node fails, the backlog grows, retries bounce. Returns the end time. */
export function failure(d: Story, tl: gsap.core.Timeline, q: (s: string) => Element[], o: FailOpts, at: At) {
  const t = resolveAt(tl, at);
  const root = d.el(`.dg-pk`)[0];
  const e = d.graph.edges.find((x) => x.id === o.edge)!;
  const path = d.el(`.dg-e-${o.edge}`)[0] as SVGPathElement;
  const rev = e.from !== o.from;
  if (o.focus) {
    const on = new Set(o.focus);
    d.focus({ nodes: o.focus, edges: d.graph.edges.filter((x) => on.has(x.from) && on.has(x.to)).map((x) => x.id) }, t);
  }
  d.alarm(o.node, t);
  tl.fromTo(q(`.fn-${o.id} .fn-down`), { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.3, immediateRender: false }, t + 0.2);
  let end = t + 0.6;
  if (o.queue) {
    const g = q(`.qg-${o.queue.id}`)[0] as HTMLElement;
    const max = Number(g.dataset.max);
    tl.fromTo(g, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.35, immediateRender: false }, t + 0.3)
      .fromTo(g.querySelector(".qg-fill"), { scaleX: 0 }, { scaleX: Math.min(1, o.queue.peak / max), duration: 2.4, ease: "power1.in", immediateRender: false }, t + 0.6);
    count(tl, g.querySelector(".qg-n"), 0, o.queue.peak, t + 0.6, { duration: 2.4 });
    end = t + 3.0;
  }
  // retries: a packet rides most of the edge, flashes, bounces back; one chip per retry
  const dur = hopDur(e.points);
  o.retries.forEach((_, i) => {
    const s = t + 0.5 + i * (dur * 1.6 + 0.25);
    const pk = makePacket(root, flowColor("danger"), 8);
    tl.set(pk, { autoAlpha: 1, immediateRender: false }, s)
      .fromTo(pk, { motionPath: { path, align: path, alignOrigin: [0.5, 0.5], start: rev ? 1 : 0, end: rev ? 1 : 0 } },
        { motionPath: { path, align: path, alignOrigin: [0.5, 0.5], start: rev ? 1 : 0, end: rev ? 0.12 : 0.88 }, duration: dur * 0.8, ease: "power1.in", immediateRender: false }, s)
      .to(pk, { motionPath: { path, align: path, alignOrigin: [0.5, 0.5], start: rev ? 0.12 : 0.88, end: rev ? 0.45 : 0.55 }, duration: dur * 0.6, ease: "power2.out", immediateRender: false }, s + dur * 0.8)
      .set(pk, { autoAlpha: 0, immediateRender: false }, s + dur * 1.4)
      .fromTo(q(`.fn-${o.id} .fn-retry`)[i], { autoAlpha: 0, x: -8 }, { autoAlpha: 1, x: 0, duration: 0.25, immediateRender: false }, s + dur * 0.8);
    end = Math.max(end, s + dur * 1.4);
  });
  return end + 0.2;
}

/** Scene timeline: the node recovers, the backlog drains, the journey passes again. Returns the end time. */
export function recovery(d: Story, tl: gsap.core.Timeline, q: (s: string) => Element[], o: FailOpts & { flow?: string }, at: At) {
  const t = resolveAt(tl, at);
  d.alarm(o.node, t, false);
  tl.to(q(`.fn-${o.id} .fn-down, .fn-${o.id} .fn-retry`), { autoAlpha: 0, duration: 0.25 }, t)
    .fromTo(q(`.fn-${o.id} .fn-up`), { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.3, immediateRender: false }, t + 0.2);
  let end = t + 0.6;
  if (o.flow) end = Math.max(end, d.flow(o.flow, t + 0.2, { color: "success", keep: false }));
  d.ring(o.node, t + 0.3, "success");
  if (o.queue) {
    const g = q(`.qg-${o.queue.id}`)[0] as HTMLElement;
    tl.to(g.querySelector(".qg-fill"), { scaleX: 0, duration: 2.0, ease: "power2.inOut" }, t + 0.4)
      .to(g.querySelector(".qg-fill"), { backgroundColor: "var(--dg-flow-success)", duration: 0.4 }, t + 0.4);
    count(tl, g.querySelector(".qg-n"), o.queue.peak, 0, t + 0.4, { duration: 2.0 });
    end = Math.max(end, t + 2.4);
  }
  return end + 0.1;
}

/** Live while failing: messages pile into the queue, retries bounce off the red node. */
export function liveFailure(live: Live, o: { into: string; edge: string; from: string; node: string }) {
  const L = live;
  L.flow(o.into, { at: 0, color: "accent" });
  L.flow(o.into, { at: 0.7, color: "accent" });
  const pulseAt = 1.6;
  L.pulse(o.node, pulseAt, "danger");
  return 2.4;
}

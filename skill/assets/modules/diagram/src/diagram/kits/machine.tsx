import { flowColor, resolveAt, type At, type Story } from "../story";
import type { LGraph } from "../types";

/**
 * State machine: a token (the object whose state changes) travels from state to state along the transitions. Guards
 * are the edge labels ("[paid]"): a passing guard turns green as the token crosses it; a blocked guard turns red, the
 * token stops half-way, shakes and goes back. The current state keeps a ring; the token's own label can change.
 */
export function Token({ id, label, graph, at }: { id: string; label: string; graph: LGraph; at: string }) {
  const n = graph.nodes.find((x) => x.id === at)!;
  const w = 210, h = 40;
  return (
    <div className={`tk tk-${id}`} data-w={w} data-h={h}
      style={{ position: "absolute", left: 0, top: 0, width: w, height: h, transform: `translate(${n.x + n.w / 2 - w / 2}px, ${n.y - h / 2}px)`,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 999, fontSize: 19, fontWeight: 700, whiteSpace: "nowrap",
        background: "var(--dg-flow-primary)", color: "var(--color-on-primary)", boxShadow: "0 6px 20px rgb(0 0 0 / 0.18)", zIndex: 5 }}>
      <span style={{ width: 9, height: 9, borderRadius: 9, background: "currentColor", opacity: 0.8 }} />{label}
    </div>
  );
}

export function machine(d: Story, tl: gsap.core.Timeline, q: (s: string) => Element[], { id, start }: { id: string; start: string }) {
  const g = d.graph;
  const tk = q(`.tk-${id}`)[0] as HTMLElement;
  const W = Number(tk.dataset.w), H = Number(tk.dataset.h);
  let cur = start;
  const park = (sid: string) => { const n = g.nodes.find((x) => x.id === sid)!; return { x: n.x + n.w / 2 - W / 2, y: n.y - H / 2 }; };
  tl.set(tk, { x: park(start).x, y: park(start).y }, 0);
  const label = (edge: string) => d.el(`.dg-l-${edge} .dg-lb`);

  return {
    /** Entrance of the token and the ring on the start state. */
    enter(at: At) {
      const t = resolveAt(tl, at);
      tl.fromTo(tk, { autoAlpha: 0, scale: 0.6 }, { autoAlpha: 1, scale: 1, duration: 0.4, ease: "back.out(2)", immediateRender: false }, t);
      d.ring(start, t, "primary");
      return t + 0.45;
    },
    /** Move to `to` (guard passes) or try and bounce back (`blocked: true`). Returns the end time. */
    go(to: string, at: At, { blocked = false }: { blocked?: boolean } = {}) {
      const t = resolveAt(tl, at);
      const e = g.edges.find((x) => x.from === cur && x.to === to);
      if (!e) throw new Error(`machine: no transition ${cur} → ${to}`);
      const pts = e.points.map(([x, y]) => ({ x: x - W / 2, y: y - H / 2 }));
      const a = park(cur), b = park(to);
      const lab = label(e.id);
      const ok = blocked ? "danger" : "success";
      if (lab.length) tl.to(lab, { backgroundColor: `color-mix(in srgb, ${flowColor(ok)} 22%, transparent)`, color: flowColor(ok), duration: 0.3 }, t + 0.2);
      if (!blocked) {
        const path = [a, ...pts, b];
        const seg = path.slice(1).map((p, i) => Math.hypot(p.x - path[i].x, p.y - path[i].y));
        const total = seg.reduce((s, v) => s + v, 0);
        const dur = Math.min(2.2, Math.max(1, total / 500));
        let s = t;
        path.slice(1).forEach((p, i) => { const dd = (seg[i] / total) * dur; tl.to(tk, { x: p.x, y: p.y, duration: dd, ease: "none" }, s); s += dd; });
        d.ring(cur, t, "primary", false);
        d.ring(to, s - 0.05, "success");
        tl.to(d.el(`.dg-hl-${e.id}`), { stroke: flowColor("success"), opacity: 1, duration: 0.01 }, t)
          .fromTo(d.el(`.dg-hl-${e.id}`), { drawSVG: "0% 0%" }, { drawSVG: "0% 100%", duration: dur, ease: "none", immediateRender: false }, t);
        cur = to;
        return s + 0.2;
      }
      // blocked: halfway along the edge, shake, back
      const mid = pts[Math.floor(pts.length / 2)] ?? pts[0];
      const half = { x: (pts[0].x + mid.x) / 2 + (mid.x - pts[0].x) * 0.3, y: (pts[0].y + mid.y) / 2 + (mid.y - pts[0].y) * 0.3 };
      tl.to(tk, { x: pts[0].x, y: pts[0].y, duration: 0.3, ease: "power1.in" }, t)
        .to(tk, { x: half.x, y: half.y, duration: 0.45, ease: "power1.out" }, t + 0.3)
        .to(tk, { keyframes: { rotation: [0, -6, 6, -4, 4, 0] }, duration: 0.45, ease: "none" }, t + 0.8)
        .to(tk, { backgroundColor: flowColor("danger"), duration: 0.2 }, t + 0.8)
        .to(tk, { x: a.x, y: a.y, duration: 0.6, ease: "power2.inOut" }, t + 1.3)
        .to(tk, { backgroundColor: flowColor("primary"), duration: 0.3 }, t + 1.6);
      return t + 2.0;
    },
    /** Change the token's text-free colour (e.g. final states). */
    color(c: string, at: At) { tl.to(tk, { backgroundColor: flowColor(c), duration: 0.3 }, resolveAt(tl, at)); },
  };
}

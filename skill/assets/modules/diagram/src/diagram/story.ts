import { counter } from "../ui/kit";
import { gsap } from "../gsap";
import { allow } from "../fx/dial";
import { stageBox, type View } from "./Diagram";
import { hopDur } from "./geometry";
import type { Hop, LGraph } from "./types";

/**
 * Story API: everything here writes into the scene's ONE paused timeline, so ← , jumps and export work for free
 * (plain property tweens, fromTo with immediateRender:false for anything that can repeat). The persistent result of a
 * step (lit path, hop numbers, rings, sequence view, open panel) is the printed end state. Live loops (live.ts) add
 * motion on top while a step is on screen and never touch what this file animates.
 */

export type At = number | string;
type Q = (sel: string) => Element[];
export type FlowOpts = {
  /** colour: "primary" | "accent" | "danger" | "success" | any CSS colour (default: the flow's colour or primary) */
  color?: string;
  /** keep the highlights of earlier flows (default false: they fade first) */
  keep?: boolean;
  /** dim everything off the journey (default true) */
  focus?: boolean;
  /** hop numbers on the edges (default true) */
  numbers?: boolean;
  /** packet speed multiplier (default 1) */
  speed?: number;
  /** called for every hop: i, arrival time, the hop, its start time (add your own tweens there) */
  onHop?: (i: number, t: number, hop: Hop, start: number) => void;
};

const NAMED: Record<string, string> = {
  primary: "var(--dg-flow-primary)", accent: "var(--dg-flow-accent)", danger: "var(--dg-flow-danger)", success: "var(--dg-flow-success)",
};
export const flowColor = (c?: string) => (c ? NAMED[c] ?? c : NAMED.primary);
export const DIM = 0.22;

/** "s1", "s1+=0.4", "s2-=0.2" or a number → seconds. The label must already exist (add labels before using them). */
export function resolveAt(tl: gsap.core.Timeline, at: At): number {
  if (typeof at === "number") return at;
  const m = /^([A-Za-z][\w-]*)?\s*(?:([+-])=\s*([\d.]+))?$/.exec(at.trim());
  if (!m) throw new Error(`diagram: cannot read position "${at}"`);
  const base = m[1] ? tl.labels[m[1]] : tl.duration();
  if (base === undefined) throw new Error(`diagram: label "${m[1]}" does not exist yet — add it before referencing it`);
  return base + (m[2] ? (m[2] === "+" ? 1 : -1) * Number(m[3]) : 0);
}

const SVGNS = "http://www.w3.org/2000/svg";
/** A packet: core dot (+ soft layered halo when the dial allows light). Owned by whoever created it. */
export function makePacket(layer: Element, color: string, r = 9) {
  const g = document.createElementNS(SVGNS, "g");
  g.setAttribute("class", "dg-pkt");
  g.style.visibility = "hidden";
  g.style.opacity = "0";
  if (allow("light", { diagram: true })) {
    for (const [k, o] of [[3, 0.12], [1.9, 0.22]] as const) {
      const c = document.createElementNS(SVGNS, "circle");
      c.setAttribute("r", String(r * k));
      c.style.fill = color;
      c.style.opacity = String(o);
      g.appendChild(c);
    }
  }
  const core = document.createElementNS(SVGNS, "circle");
  core.setAttribute("r", String(r));
  core.style.fill = color;
  core.style.stroke = allow("glass") ? "rgb(255 255 255 / 0.85)" : "var(--color-surface)";
  core.style.strokeWidth = "2.5";
  g.appendChild(core);
  layer.appendChild(g);
  return g;
}

/** Ride a packet along a path between t and t+dur (reversible). */
export function ride(tl: gsap.core.Timeline, pk: Element, path: SVGPathElement, t: number, dur: number, rev = false, ease = "power1.inOut") {
  tl.set(pk, { autoAlpha: 1, immediateRender: false }, t)
    .fromTo(pk, { motionPath: { path, align: path, alignOrigin: [0.5, 0.5], start: rev ? 1 : 0, end: rev ? 1 : 0 } },
      { motionPath: { path, align: path, alignOrigin: [0.5, 0.5], start: rev ? 1 : 0, end: rev ? 0 : 1 }, duration: dur, ease, immediateRender: false }, t)
    .set(pk, { autoAlpha: 0, immediateRender: false }, t + dur);
}

/**
 * Count a number in an element's text between t and t+duration; returns the end time (story style).
 * The one counter of the deck is `counter()` in src/ui/kit.tsx (seek-safe: writes nothing at build time, so the
 * markup holds the initial value); this wrapper only adapts the argument order.
 */
export function count(tl: gsap.core.Timeline, el: Element | null | undefined, from: number, to: number, at: number,
  { duration = 1.2, format = (v: number) => Math.round(v).toLocaleString("en-US") }: { duration?: number; format?: (v: number) => string } = {}) {
  counter(tl, el, to, at, { from, duration, format });
  return at + duration;
}

export type Story = ReturnType<typeof story>;

/** Story for one level of a view: `const d = story(tl, q, VIEW)`; `d.level("orders")` for a deeper level. */
export function story(tl: gsap.core.Timeline, q: Q, view: View, level = view.root) {
  const L = view.levels[level];
  if (!L) throw new Error(`diagram: no level "${level}" in this view`);
  const g: LGraph = L.graph;
  const root = q(`.dgx-${level}`)[0] as HTMLElement | undefined;
  if (!root) throw new Error(`diagram: .dgx-${level} is not rendered — put <DiagramView view={…} /> in the scene`);
  // the live loops find the scene timeline here (to start only when the step's part has finished)
  const scene = root.closest("[data-scene]") as (HTMLElement & { __dgTl?: gsap.core.Timeline }) | null;
  if (scene) scene.__dgTl = tl;
  const $ = (sel: string) => Array.from(root.querySelectorAll(sel));
  const one = <T extends Element = HTMLElement>(sel: string) => {
    const el = root.querySelector(sel);
    if (!el) throw new Error(`diagram "${level}": nothing matches ${sel}`);
    return el as unknown as T;
  };
  const T = (at: At) => resolveAt(tl, at);
  const node = (id: string) => g.nodes.find((n) => n.id === id);
  const group = (id: string) => g.groups.find((x) => x.id === id);
  const flowOf = (name: string) => {
    const f = g.flows[name];
    if (!f) throw new Error(`diagram "${level}": no flow "${name}" (have ${Object.keys(g.flows).join(", ") || "none"})`);
    return f;
  };
  const ringEl = (id: string) => $(`.dg-n-${id} > .dg-body > .dg-ring, .dg-g-${id} .dg-ring`);
  const pkLayer = one(".dg-pk");

  /** Members of a flow: nodes, groups and edges it touches. */
  function flowSet(name: string) {
    const f = flowOf(name);
    const nodes = new Set<string>([f.start]), edges = new Set<string>();
    for (const h of f.hops) {
      nodes.add(h.from); nodes.add(h.to); edges.add(h.edge);
      (h.light ?? []).forEach((m) => nodes.add(m));
      const gr = group(h.to);
      if (gr && !h.light) gr.members.forEach((m) => nodes.add(m));
    }
    return { nodes, edges };
  }

  const api = {
    level: (name: string) => story(tl, q, view, name),
    graph: g,
    el: $,

    /**
     * Entrance: groups, nodes pop in, edges draw, labels. `hidden` nodes (and their edges) stay out until
     * reveal() (replicas, a later component). Returns the end time.
     */
    enter(at: At = 0.2, { speed = 1, hidden = [] }: { speed?: number; hidden?: string[] } = {}) {
      const t = T(at), k = 1 / speed;
      const hid = new Set(hidden);
      const hidEdges = new Set(g.edges.filter((e) => hid.has(e.from) || hid.has(e.to)).map((e) => e.id));
      const nodes = g.nodes.filter((n) => !hid.has(n.id)).map((n) => one(`.dg-n-${n.id}`));
      const es = g.edges.filter((e) => !hidEdges.has(e.id));
      const edges = es.filter((e) => !e.dashed).map((e) => one(`.dg-e-${e.id}`));
      const dashed = es.filter((e) => e.dashed).map((e) => one(`.dg-e-${e.id}`));
      const heads = es.flatMap((e) => $(`.dg-ah-${e.id}`));
      const labels = es.filter((e) => e.labelBox).map((e) => one(`.dg-l-${e.id}`));
      if (hid.size) {
        tl.set([...[...hid].map((id) => one(`.dg-n-${id}`)), ...[...hidEdges].flatMap((id) => $(`.dg-e-${id}, .dg-ah-${id}, .dg-l-${id}`))], { autoAlpha: 0 }, 0);
      }
      if ($(".dg-g").length) tl.from($(".dg-g"), { autoAlpha: 0, scale: 0.98, duration: 0.45 * k, stagger: 0.06 * k }, t);
      tl.from(nodes, { autoAlpha: 0, y: 14, scale: 0.94, duration: 0.5 * k, stagger: Math.min(0.06, 0.9 / nodes.length) * k, ease: "back.out(1.5)" }, t + 0.1 * k);
      const te = t + 0.55 * k;
      if (edges.length) tl.fromTo(edges, { drawSVG: "0% 0%" }, { drawSVG: "0% 100%", duration: 0.6 * k, stagger: Math.min(0.05, 0.6 / edges.length) * k, ease: "power2.inOut" }, te);
      if (dashed.length) tl.from(dashed, { opacity: 0, duration: 0.5 * k }, te);
      if (heads.length) tl.from(heads, { opacity: 0, duration: 0.3 * k, stagger: Math.min(0.03, 0.4 / Math.max(1, edges.length)) * k }, te + 0.45 * k);
      if (labels.length) tl.from(labels, { autoAlpha: 0, duration: 0.35 * k }, te + 0.6 * k);
      return te + 1.0 * k;
    },

    /** Dim everything but these nodes/edges (a flow name, a set, or null = everything back). */
    focus(target: string | { nodes?: string[]; edges?: string[] } | null, at: At, dur = 0.4) {
      const t = T(at);
      const set = target === null ? null : typeof target === "string" ? flowSet(target)
        : { nodes: new Set(target.nodes ?? []), edges: new Set(target.edges ?? []) };
      const on = (id: string) => !set || set.nodes.has(id);
      const eon = (id: string) => !set || set.edges.has(id);
      const nodesOn = g.nodes.filter((n) => on(n.id)), nodesOff = g.nodes.filter((n) => !on(n.id));
      const body = (ns: typeof g.nodes) => ns.map((n) => one(`.dg-n-${n.id} > .dg-body`));
      if (nodesOn.length) tl.to(body(nodesOn), { opacity: 1, duration: dur }, t);
      if (nodesOff.length) tl.to(body(nodesOff), { opacity: DIM, duration: dur }, t);
      for (const x of g.groups) {
        const lit = !set || set.nodes.has(x.id) || x.members.some((m) => set.nodes.has(m));
        tl.to(one(`.dg-g-${x.id} .dg-gb`), { opacity: lit ? 1 : 0.35, duration: dur }, t);
      }
      const eOn = g.edges.filter((e) => eon(e.id)), eOff = g.edges.filter((e) => !eon(e.id));
      const sel = (es: typeof g.edges, c: string) => es.flatMap((e) => $(`.${c}-${e.id}`));
      if (eOn.length) tl.to(sel(eOn, "dg-e"), { strokeOpacity: 1, duration: dur }, t).to(sel(eOn, "dg-ah"), { fillOpacity: 1, duration: dur }, t);
      if (eOff.length) tl.to(sel(eOff, "dg-e"), { strokeOpacity: 0.3, duration: dur }, t).to(sel(eOff, "dg-ah"), { fillOpacity: 0.3, duration: dur }, t);
      const lab = (es: typeof g.edges) => es.filter((e) => e.labelBox).map((e) => one(`.dg-l-${e.id} .dg-lb`));
      if (lab(eOn).length) tl.to(lab(eOn), { opacity: 1, duration: dur }, t);
      if (lab(eOff).length) tl.to(lab(eOff), { opacity: 0.35, duration: dur }, t);
      return t + dur;
    },

    /** Fade every flow highlight (lit edges, rings, hop numbers). */
    clear(at: At, dur = 0.25) {
      const t = T(at);
      tl.to($(".dg-hl, .dg-hlw"), { opacity: 0, duration: dur }, t)
        .to($(".dg-ring"), { autoAlpha: 0, duration: dur }, t)
        .to($(".dg-hop"), { autoAlpha: 0, duration: dur }, t);
      return t + dur;
    },

    /** Ring nodes on (or off) in a colour. */
    ring(ids: string[] | string, at: At, color = "primary", on = true) {
      const t = T(at), c = flowColor(color);
      for (const id of [ids].flat()) {
        const el = ringEl(id);
        if (!el.length) continue;
        if (on) tl.set(el, { "--rc": c }, t).fromTo(el, { autoAlpha: 0, scale: 1.12 }, { autoAlpha: 1, scale: 1, duration: 0.35, ease: "power2.out", immediateRender: false }, t);
        else tl.to(el, { autoAlpha: 0, duration: 0.25 }, t);
      }
      return t + 0.35;
    },

    /** Light the members of a group (or a list of nodes) one after another. Returns the end time. */
    light(target: string | string[], at: At, color = "primary", gap = 0.18) {
      const t = T(at);
      const ids = Array.isArray(target) ? target : group(target)?.members ?? [target];
      ids.forEach((id, i) => api.ring(id, t + i * gap, color));
      return t + ids.length * gap + 0.2;
    },

    /**
     * Play a named journey once: packets ride each hop, edges light up behind them, reached nodes get a ring,
     * groups light their members, hop numbers appear. The lit path stays (the printed end state). Returns the end time.
     */
    flow(name: string, at: At, opts: FlowOpts = {}) {
      const f = flowOf(name);
      const color = flowColor(opts.color ?? f.color);
      let t = T(at);
      if (!opts.keep) t = api.clear(t) + 0.05;
      if (opts.focus !== false) api.focus(name, t);
      api.ring(f.start, t, color);
      t += 0.2;
      let prevStart = t, prevEnd = t;
      const lit = new Set<string>();
      const lightOn = allow("light", { diagram: true });
      f.hops.forEach((h, i) => {
        const e = g.edges.find((x) => x.id === h.edge)!;
        const path = one<SVGPathElement>(`.dg-e-${h.edge}`);
        const dur = hopDur(e.points, opts.speed);
        const s = h.with ? prevStart : prevEnd;
        ride(tl, makePacket(pkLayer, color, h.reply ? 7 : 9), path, s, dur, h.rev);
        if (!lit.has(h.edge)) {
          lit.add(h.edge);
          const from = h.rev ? { drawSVG: "100% 100%" } : { drawSVG: "0% 0%" };
          const hl = $(`.dg-hl-${h.edge}`).concat(lightOn ? $(`.dg-hlw-${h.edge}`) : []);
          tl.set(hl, { stroke: color }, s)
            .fromTo(hl, { ...from, opacity: 1 }, { drawSVG: "0% 100%", opacity: (j: number) => (j === 0 ? 1 : 0.16), duration: dur, ease: "power1.inOut", immediateRender: false }, s);
        }
        if (opts.numbers !== false) {
          const hop = $(`.dg-hop-${name}-${i}`);
          tl.set(hop, { "--rc": color }, s).fromTo(hop, { autoAlpha: 0, scale: 0.4, xPercent: -50, yPercent: -50 }, { autoAlpha: 1, scale: 1, xPercent: -50, yPercent: -50, duration: 0.3, ease: "back.out(2)", immediateRender: false }, s + dur * 0.3);
        }
        let end = s + dur;
        api.ring(h.to, end - 0.05, color);
        if (h.light) end = api.light(h.light, end, color) - 0.1;
        opts.onHop?.(i, end, h, s);
        prevStart = s;
        prevEnd = h.with ? Math.max(prevEnd, end) : end;
      });
      return prevEnd + 0.1;
    },

    /** The node grows into the panel and its `inside` graph builds. Returns { story, end } for the inner level. */
    zoom(nodeId: string, at: At) {
      const n = node(nodeId);
      if (!n?.inside) throw new Error(`diagram "${level}": node "${nodeId}" has no "inside" graph to zoom into`);
      const t = T(at), from = stageBox(view, level, nodeId), P = view.panel;
      const cam = q(`.dgc-${level}`)[0], cam2 = q(`.dgc-${n.inside}`)[0], panel = q(`.dgp-${n.inside}`)[0];
      const cover = panel.querySelector(".dgp-cover"), head = panel.querySelector(".dgp-head");
      tl.set(cam, { transformOrigin: `${from.x + from.w / 2}px ${from.y + from.h / 2}px` }, t)
        .to(cam, { scale: 1.6, autoAlpha: 0, duration: 0.8, ease: "power2.in" }, t)
        .set(cam2, { autoAlpha: 1 }, t)
        .fromTo(panel, { left: from.x, top: from.y, width: from.w, height: from.h, borderRadius: 18 },
          { left: P.x, top: P.y, width: P.w, height: P.h, borderRadius: 28, duration: 1.0, ease: "power3.inOut", immediateRender: false }, t)
        .fromTo(cover, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.45, ease: "power1.in", immediateRender: false }, t + 0.3)
        .fromTo(head, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.4, immediateRender: false }, t + 0.85);
      const inner = story(tl, q, view, n.inside);
      const end = inner.enter(t + 0.95, { speed: 1.4 });
      return { story: inner, end };
    },

    /** Back out of a zoom started from `nodeId` of this level (as a forward step; ← already reverses a zoom). */
    zoomOut(nodeId: string, at: At) {
      const n = node(nodeId)!;
      const t = T(at), to = stageBox(view, level, nodeId);
      const cam = q(`.dgc-${level}`)[0], cam2 = q(`.dgc-${n.inside}`)[0], panel = q(`.dgp-${n.inside}`)[0];
      const inner = q(`.dgx-${n.inside}`)[0];
      tl.to(panel.querySelector(".dgp-head"), { autoAlpha: 0, duration: 0.25 }, t)
        .to(inner, { autoAlpha: 0, duration: 0.3 }, t)
        .to(panel.querySelector(".dgp-cover"), { autoAlpha: 1, duration: 0.35 }, t + 0.2)
        .to(panel, { left: to.x, top: to.y, width: to.w, height: to.h, borderRadius: 18, duration: 0.9, ease: "power3.inOut" }, t + 0.2)
        .to(cam, { scale: 1, autoAlpha: 1, duration: 0.8, ease: "power2.out" }, t + 0.5)
        .set(cam2, { autoAlpha: 0 }, t + 1.15)
        .set(inner, { autoAlpha: 1 }, t + 1.15);
      return t + 1.2;
    },

    /**
     * Morph the journey into a sequence diagram: its nodes travel to lane headers, everything else fades, lifelines
     * grow, messages appear in time order with a packet on each. Needs `seq: { [flow]: region }` in diagramView().
     */
    toSequence(name: string, at: At) {
      const S = L.seq[name];
      if (!S) throw new Error(`diagram "${level}": no sequence region for "${name}" — add seq: { "${name}": region } to diagramView()`);
      const t = T(at), geo = S.geo, f = flowOf(name);
      const lanes = new Set(geo.lanes.map((l) => l.id));
      const color = flowColor(f.color);
      tl.to($(".dg-gs, .dg-edges, .dg-hls, .dg-beams, .dg-ls, .dg-hops"), { autoAlpha: 0, duration: 0.4 }, t);
      const others = g.nodes.filter((n) => !lanes.has(n.id)).map((n) => one(`.dg-n-${n.id}`));
      if (others.length) tl.to(others, { autoAlpha: 0, duration: 0.4 }, t);
      for (const l of geo.lanes) {
        const n = node(l.id) ?? group(l.id)!;
        const el = node(l.id) ? one(`.dg-n-${l.id}`) : one(`.dg-g-${l.id}`);
        tl.to(el, { x: l.box.x - n.x, y: l.box.y - n.y, scale: l.scale, transformOrigin: "0 0", duration: 0.9, ease: "power3.inOut" }, t + 0.15);
        tl.to(el.querySelector(".dg-body") ?? el, { opacity: 1, duration: 0.3 }, t + 0.15);
      }
      tl.fromTo($(`.dg-sl-${name}`), { opacity: 0, scaleY: 0, transformOrigin: "50% 0%" }, { opacity: 1, scaleY: 1, duration: 0.6, stagger: 0.05, immediateRender: false }, t + 0.85);
      let s = t + 1.2;
      geo.msgs.forEach((m) => {
        const grp = $(`.dg-sg-${name}-${m.i}`), path = one<SVGPathElement>(`.dg-sm-${name}-${m.i}`);
        const dir = Math.sign(m.x2 - m.x1) || 1;
        tl.fromTo(grp, { autoAlpha: 0, x: -dir * 16 }, { autoAlpha: 1, x: 0, duration: 0.3, immediateRender: false }, s);
        ride(tl, makePacket(pkLayer, m.async ? flowColor("accent") : color, 7), path, s, 0.34, false, "power1.in");
        tl.fromTo($(`.dg-st-${name}-${m.i}`), { autoAlpha: 0, y: 6, xPercent: -50, yPercent: -100 }, { autoAlpha: 1, y: 0, xPercent: -50, yPercent: -100, duration: 0.25, immediateRender: false }, s + 0.15);
        s += 0.36;
      });
      return s + 0.2;
    },

    /** Back from the sequence view to the graph (as a forward step). */
    fromSequence(name: string, at: At) {
      const S = L.seq[name];
      if (!S) throw new Error(`diagram "${level}": no sequence region for "${name}"`);
      const t = T(at);
      tl.to($(`.dg-sg-${name}, .dg-st-${name}`), { autoAlpha: 0, duration: 0.3 }, t)
        .to($(`.dg-sl-${name}`), { opacity: 0, duration: 0.3 }, t);
      for (const l of S.geo.lanes) tl.to(node(l.id) ? one(`.dg-n-${l.id}`) : one(`.dg-g-${l.id}`), { x: 0, y: 0, scale: 1, duration: 0.9, ease: "power3.inOut" }, t + 0.2);
      tl.to($(".dg-n"), { autoAlpha: 1, duration: 0.4 }, t + 0.8)
        .to($(".dg-gs, .dg-edges, .dg-hls, .dg-beams, .dg-ls, .dg-hops"), { autoAlpha: 1, duration: 0.4 }, t + 0.8);
      return t + 1.25;
    },

    /** Red alarm on a node (failure) or off (recovery). */
    alarm(id: string, at: At, on = true) {
      const t = T(at), el = $(`.dg-n-${id} .dg-alarm`);
      if (on) tl.fromTo(el, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3, immediateRender: false }, t)
        .fromTo(one(`.dg-n-${id}`), { x: 0 }, { keyframes: { x: [0, -7, 7, -5, 5, -2, 0] }, duration: 0.45, ease: "none", immediateRender: false }, t);
      else tl.to(el, { autoAlpha: 0, duration: 0.35 }, t);
      return t + 0.45;
    },

    /** Bring in nodes that enter() kept hidden, with their edges. Returns the end time. */
    reveal(ids: string[], at: At, stagger = 0.15) {
      const t = T(at);
      ids.forEach((id, i) => {
        const es = g.edges.filter((e) => e.from === id || e.to === id);
        tl.fromTo(one(`.dg-n-${id}`), { autoAlpha: 0, x: -40, scale: 0.9 }, { autoAlpha: 1, x: 0, scale: 1, duration: 0.5, ease: "back.out(1.6)", immediateRender: false }, t + i * stagger);
        for (const e of es) {
          tl.fromTo($(`.dg-e-${e.id}`), { autoAlpha: 1, drawSVG: "0% 0%" }, { drawSVG: "0% 100%", duration: 0.45, immediateRender: false }, t + i * stagger + 0.25)
            .fromTo($(`.dg-ah-${e.id}, .dg-l-${e.id}`), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2, immediateRender: false }, t + i * stagger + 0.6);
        }
      });
      return t + ids.length * stagger + 0.7;
    },
  };
  return api;
}

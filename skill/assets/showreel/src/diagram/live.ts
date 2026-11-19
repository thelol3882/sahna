import { useEffect, useState, type RefObject } from "react";
import { gsap, reducedMotion } from "../gsap";
import { allow } from "../fx/dial";
import { labelTime } from "../deck";
import type { View } from "./Diagram";
import { hopDur } from "./geometry";
import { flowColor, makePacket } from "./story";

/**
 * Live loops: ambient motion while a step is on screen (packets keep riding, beams run along active edges, nodes
 * pulse). Rules that keep ←, jumps and export exact:
 *  - a loop starts only when the scene timeline rests on the step's label, and is killed on any step change;
 *  - it touches only loop-owned things (packets it creates, .dg-halo, .dg-bm*), and its gsap.context is reverted;
 *  - it never runs in export, #print or reduced motion: the scene timeline's end state is the static picture.
 */

/** True while the deck exports, prints, or motion is reduced (live loops stay off). */
export function useStill() {
  const read = () => {
    const c = document.documentElement.classList;
    return c.contains("export-mode") || c.contains("print-mode") || reducedMotion();
  };
  const [still, setStill] = useState(read);
  useEffect(() => {
    const mo = new MutationObserver(() => setStill(read()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);
  return still;
}

export type Live = ReturnType<typeof makeLive>;

function makeLive(loop: gsap.core.Timeline, scene: HTMLElement, view: View, created: Element[], level = view.root) {
  const L = view.levels[level];
  const root = scene.querySelector(`.dgx-${level}`)!;
  const $ = (sel: string) => Array.from(root.querySelectorAll(sel));
  const light = allow("light", { diagram: true });
  const layer = root.querySelector(".dg-pk")!;
  const packet = (color: string, r = 9) => {
    const p = makePacket(layer, color, r);
    created.push(p);
    return p;
  };
  const rideLoop = (path: SVGPathElement, t: number, dur: number, rev: boolean, color: string, r = 9, ease = "power1.inOut") => {
    const pk = packet(color, r);
    loop.set(pk, { autoAlpha: 1, immediateRender: false }, t)
      .fromTo(pk, { motionPath: { path, align: path, alignOrigin: [0.5, 0.5], start: rev ? 1 : 0, end: rev ? 1 : 0 } },
        { motionPath: { path, align: path, alignOrigin: [0.5, 0.5], start: rev ? 1 : 0, end: rev ? 0 : 1 }, duration: dur, ease, immediateRender: false }, t)
      .set(pk, { autoAlpha: 0, immediateRender: false }, t + dur);
  };
  const api = {
    tl: loop,
    el: $,
    level: (name: string) => makeLive(loop, scene, view, created, name),

    /** A beam of light running along an edge once (balanced/showcase only). */
    beam(edge: string, t: number, dur: number, rev = false, color = "primary") {
      if (!light) return;
      const c = flowColor(color);
      for (const [cls, op] of [["dg-bm", 0.95], ["dg-bmw", 0.22]] as const) {
        const p = root.querySelector(`.${cls}-${edge}`) as SVGPathElement | null;
        if (!p) continue;
        const len = p.getTotalLength(), seg = Math.min(110, len * 0.45);
        loop.set(p, { stroke: c, strokeDasharray: `${seg} ${len + seg}` }, t)
          .fromTo(p, { strokeDashoffset: rev ? -len : seg, opacity: op }, { strokeDashoffset: rev ? seg : -len, duration: dur, ease: "power1.inOut", immediateRender: false }, t)
          .set(p, { opacity: 0 }, t + dur);
      }
    },

    /** Pulse a node's halo (balanced/showcase) at time t. */
    pulse(id: string, t: number, color = "primary") {
      if (!light) return;
      const h = $(`.dg-n-${id} .dg-halo`);
      if (!h.length) return;
      loop.set(h, { "--hc": flowColor(color) }, t)
        .fromTo(h, { opacity: 0, scale: 0.97 }, { keyframes: { opacity: [0, 1, 0], scale: [0.97, 1.03, 1.05] }, duration: 0.7, ease: "none", immediateRender: false }, t);
    },

    /** One pass of a named journey: packets, beams and pulses. Returns the end time inside the loop. */
    flow(name: string, { at = 0, color, speed = 1 }: { at?: number; color?: string; speed?: number } = {}) {
      const f = L.graph.flows[name];
      if (!f) throw new Error(`live "${level}": no flow "${name}"`);
      const c = flowColor(color ?? f.color);
      let prevStart = at, prevEnd = at;
      for (const h of f.hops) {
        const e = L.graph.edges.find((x) => x.id === h.edge)!;
        const path = root.querySelector(`.dg-e-${h.edge}`) as SVGPathElement;
        const dur = hopDur(e.points, speed);
        const s = h.with ? prevStart : prevEnd;
        rideLoop(path, s, dur, h.rev, c, h.reply ? 7 : 9);
        api.beam(h.edge, s, dur, h.rev, color ?? f.color ?? "primary");
        api.pulse(h.to, s + dur - 0.05, color ?? f.color ?? "primary");
        let end = s + dur;
        if (h.light) { h.light.forEach((m, i) => api.pulse(m, end + i * 0.15, color ?? f.color)); end += h.light.length * 0.15; }
        prevStart = s;
        prevEnd = h.with ? Math.max(prevEnd, end) : end;
      }
      return prevEnd;
    },

    /** Packets ride the messages of a sequence view in time order. Returns the end time. */
    seq(name: string, { at = 0 }: { at?: number } = {}) {
      const S = L.seq[name];
      if (!S) throw new Error(`live "${level}": no sequence for "${name}"`);
      const c = flowColor(L.graph.flows[name].color);
      let t = at;
      for (const m of S.geo.msgs) {
        const path = root.querySelector(`.dg-sm-${name}-${m.i}`) as SVGPathElement;
        rideLoop(path, t, 0.42, false, m.async ? flowColor("accent") : c, 7, "power1.in");
        t += 0.46;
      }
      return t;
    },

    /** Run a callback at time t in the loop (e.g. update a live counter element owned by the loop). */
    call(fn: () => void, t: number) {
      loop.call(fn, [], t);
    },
  };
  return api;
}

/**
 * `useLive(ref, VIEW, (live, step) => { if (step === 1) live.flow("checkout"); })` — builds a repeating loop for
 * the current step. `ref` is the scene ref from useScene; `step` from useSceneStep().
 */
export function useLive(ref: RefObject<HTMLElement | null>, view: View, step: number, build: (live: Live, step: number) => void, { gap = 0.6 }: { gap?: number } = {}) {
  const still = useStill();
  useEffect(() => {
    const scene = ref.current as (HTMLElement & { __dgTl?: gsap.core.Timeline }) | null;
    const main = scene?.__dgTl;
    if (!scene || !main || step < 0 || still) return;
    const loop = gsap.timeline({ repeat: -1, repeatDelay: gap, paused: true });
    const created: Element[] = [];
    const ctx = gsap.context(() => build(makeLive(loop, scene, view, created), step), scene);
    if (loop.duration() === 0) return () => { ctx.revert(); created.forEach((e) => e.remove()); };
    const target = labelTime(main, step);
    const tick = () => {
      if (Math.abs(main.time() - target) < 0.02) { gsap.ticker.remove(tick); loop.play(0); }
    };
    gsap.ticker.add(tick);
    return () => {
      gsap.ticker.remove(tick);
      loop.kill();
      ctx.revert();
      created.forEach((e) => e.remove());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, still]);
}

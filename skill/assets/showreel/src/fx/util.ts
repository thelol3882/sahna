import { useEffect, useRef } from "react";
import { gsap } from "../gsap";
import { useSceneActive } from "../deck";
import { loopsMayRun } from "./dial";

export type TL = gsap.core.Timeline;
export type At = number | string;

/** `at` + offset that also works for label positions ("s1" → "s1+=0.2"). */
export const plus = (at: At, d: number): At => (typeof at === "number" ? at + d : d === 0 ? at : `${at}+=${d.toFixed(3)}`);

/** The scene root (`[data-scene]`) that holds an element. */
export const sceneOf = (el: Element) => el.closest<HTMLElement>("[data-scene]");

/**
 * Rect of `el` in stage pixels relative to `root` (default: its scene), from getBoundingClientRect divided by the
 * stage scale. Includes transforms, so call it when the layout you want is in place: inside a function-based tween
 * value, which GSAP evaluates when the tween first renders (after earlier tweens of the same timeline rendered).
 */
export function rectIn(el: Element, root?: Element | null) {
  const r = (root ?? sceneOf(el) ?? document.body).getBoundingClientRect();
  const k = r.width / ((root ?? sceneOf(el))?.clientWidth || r.width || 1) || 1;
  const b = el.getBoundingClientRect();
  return { x: (b.left - r.left) / k, y: (b.top - r.top) / k, w: b.width / k, h: b.height / k, cx: (b.left - r.left + b.width / 2) / k, cy: (b.top - r.top + b.height / 2) / k };
}

/** Resolve a target: an element, or a selector inside the scene of `from`. */
export function resolve(target: Element | string, from: Element): Element | null {
  if (typeof target !== "string") return target;
  return sceneOf(from)?.querySelector(target) ?? document.querySelector(target);
}

/**
 * An ambient loop that runs only while the scene is on screen (and never in export, print or reduced motion).
 * `make` builds a paused-able animation once; when not live it is paused at `still` seconds, so screenshots are
 * deterministic. Returns nothing; the animation is killed on unmount.
 */
export function useLoop(make: () => gsap.core.Animation | null, { still = 0, enabled = true }: { still?: number; enabled?: boolean } = {}) {
  const active = useSceneActive();
  const live = enabled && loopsMayRun(active);
  const anim = useRef<gsap.core.Animation | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const a = make();
    anim.current = a;
    a?.pause(still);
    a?.progress(a.progress()); // render once with events so onUpdate-drawn loops (canvas) show the still frame
    return () => { a?.kill(); anim.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
  useEffect(() => {
    const a = anim.current;
    if (!a) return;
    if (live) a.play();
    else { a.pause(); a.seek(still, false); }
  }, [live, still]);
}

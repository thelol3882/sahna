import { gsap, SplitText } from "../gsap";
import { allow } from "./dial";

type TL = gsap.core.Timeline;
type At = number | string;
type El = Element | null | undefined;

/** Fallback entrance when a kinetic effect is not allowed: a calm rise. */
function rise(tl: TL, el: Element, at: At, duration = 0.7) {
  return tl.from(el, { y: 24, autoAlpha: 0, duration, ease: "power3.out" }, at);
}

/* ------------------------------------------------------------------ maskLines */

/**
 * Lines slide up from behind their own mask (SplitText `mask: "lines"`). Academic: the block rises and fades.
 * Call after fonts are loaded (the starter mounts after document.fonts.ready) and before other tweens move `el`.
 */
export function maskLines(tl: TL, el: El, at: At = 0, { duration = 1.05, stagger = 0.09, ease = "expo.out" } = {}) {
  if (!el) return tl;
  if (!allow("kinetic")) return rise(tl, el, at);
  const split = new SplitText(el, { type: "lines", mask: "lines", linesClass: "fx-line", aria: "auto" });
  split.masks?.forEach((m) => m.classList.add("fx-line-mask"));
  return tl.from(split.lines, { yPercent: 108, duration, stagger, ease }, at);
}

/* ------------------------------------------------------------------ decode */

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=<>/";
const hash = (a: number, b: number) => {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
};

/**
 * Scramble into the final text. Deterministic: every frame is a pure function of one tweened property `p`
 * (0 → 1), so a seek with events in either direction lands on the same characters (no Math.random, no time).
 * Not allowed (academic, balanced): falls back to maskLines (balanced) or a rise (academic).
 * Each character keeps its final width (the glyph is an overlay), so the line never jitters.
 */
export function decode(tl: TL, el: El, at: At = 0, { duration = 1.4, spread = 0.55, fps = 22, glyphs = GLYPHS } = {}) {
  if (!el) return tl;
  if (!allow("decode")) return maskLines(tl, el, at);
  const text = el.textContent ?? "";
  (el as HTMLElement).setAttribute("aria-label", text);
  el.textContent = "";
  const cells: { span: HTMLElement; glyph: HTMLElement; s: number; i: number }[] = [];
  const letters = [...text].filter((c) => c.trim()).length;
  let k = 0;
  for (const word of text.split(/(\s+)/)) {
    if (!word) continue;
    if (/^\s+$/.test(word)) { el.appendChild(document.createTextNode(word)); continue; }
    const w = document.createElement("span");
    w.className = "fx-dc-w";
    w.setAttribute("aria-hidden", "true");
    for (const ch of word) {
      const span = document.createElement("span");
      span.className = "fx-dc";
      span.textContent = ch;
      const glyph = document.createElement("i");
      span.appendChild(glyph);
      w.appendChild(span);
      cells.push({ span, glyph, s: -1, i: k++ });
    }
    el.appendChild(w);
  }
  const win = 1 - spread; // each char scrambles for this share of p
  const frames = duration * fps;
  const render = (p: number) => {
    const f = Math.floor(p * frames);
    for (const c of cells) {
      const start = (c.i / Math.max(1, letters - 1)) * spread;
      const local = (p - start) / win;
      const s = p <= 0 || local < 0 ? 0 : local >= 1 || p >= 1 ? 2 : 1;
      if (s !== c.s) { c.s = s; c.span.dataset.s = String(s); }
      if (s === 1) c.glyph.textContent = glyphs[hash(c.i, f) % glyphs.length];
    }
  };
  const o = { p: 0 };
  render(0);
  return tl.to(o, { p: 1, duration, ease: "none", onUpdate: () => render(o.p) }, at);
}

/* ------------------------------------------------------------------ odometer */

export type OdometerOpts = {
  format?: (v: number) => string;
  duration?: number;
  /** delay between columns, left to right */
  stagger?: number;
  /** extra full turns for the rightmost column (fewer for the next ones) */
  laps?: number;
  ease?: string;
};

const fmtInt = (v: number) => Math.round(v).toLocaleString("en-US");

/**
 * Rolling digit columns (Stripe/Apple style). Each column is a strip 0-9 (repeated for extra laps) moved with
 * its own `y` tween, so ←, jumps and export land exactly (no onUpdate). Allowed in every style (it explains).
 * Separators (, . % $ etc.) stay put. Leading columns that are zero in `from` fade in as they start rolling.
 */
export function odometer(tl: TL, el: El, from: number, to: number, at: At = 0, opts: OdometerOpts = {}) {
  if (!el) return tl;
  const { format = fmtInt, duration = 1.6, stagger = 0.06, laps = 2, ease = "power4.out" } = opts;
  const target = format(to);
  const start = format(from);
  const tDigits = [...target].filter((c) => /\d/.test(c));
  const sDigits = [...start].filter((c) => /\d/.test(c));
  const pad = Array(Math.max(0, tDigits.length - sDigits.length)).fill("0");
  const fromDigits = [...pad, ...sDigits].slice(-tDigits.length);
  const leading = (i: number) => i < pad.length;
  (el as HTMLElement).setAttribute("aria-label", target);
  el.textContent = "";
  el.classList.add("fx-odo");
  const cols: { strip: HTMLElement; a: number; b: number; i: number }[] = [];
  const seps: { node: HTMLElement; next: number }[] = [];
  let d = 0;
  for (const ch of target) {
    if (/\d/.test(ch)) {
      const col = document.createElement("span");
      col.className = "fx-odo-col";
      col.setAttribute("aria-hidden", "true");
      const strip = document.createElement("span");
      const fromN = +fromDigits[d], toN = +ch;
      const fromRight = tDigits.length - 1 - d;
      const lap = Math.max(0, laps - fromRight);
      let idx = lap * 10 + toN;
      if (idx < fromN) idx += 10;
      if (from !== to && idx === fromN && fromRight === 0) idx += 10; // the last digit always turns once
      for (let n = 0; n <= idx; n++) {
        const b = document.createElement("b");
        b.textContent = String(n % 10);
        strip.appendChild(b);
      }
      col.appendChild(strip);
      el.appendChild(col);
      cols.push({ strip, a: fromN, b: idx, i: d });
      d++;
    } else {
      const s = document.createElement("span");
      s.className = "fx-odo-sep";
      s.textContent = ch === " " ? "\u00a0" : ch; // a plain space collapses in an inline-block
      el.appendChild(s);
      seps.push({ node: s, next: d });
    }
  }
  const cell = (cols[0]?.strip.firstElementChild as HTMLElement | null)?.offsetHeight || 1;
  for (const c of cols) {
    const t = typeof at === "number" ? at + c.i * stagger : `${at}+=${(c.i * stagger).toFixed(3)}`;
    tl.fromTo(c.strip, { y: -c.a * cell }, { y: -c.b * cell, duration, ease }, t);
    if (leading(c.i)) tl.fromTo(c.strip.parentElement!, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.35, ease: "power1.out" }, t);
  }
  for (const s of seps) {
    if (!leading(s.next) && !leading(s.next - 1)) continue;
    const i = Math.min(s.next, cols.length - 1);
    const t = typeof at === "number" ? at + i * stagger : `${at}+=${(i * stagger).toFixed(3)}`;
    tl.fromTo(s.node, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.35, ease: "power1.out" }, t);
  }
  return tl;
}

/* ------------------------------------------------------------------ weight */

/**
 * Variable-font weight. With `stagger` > 0 the text splits into characters and a weight wave runs through it.
 * Needs a variable face (the kit ships Geist Variable as --font-display, 100-900, Latin + Cyrillic + Kazakh).
 * Academic: no motion, the final weight is set.
 */
export function weight(tl: TL, el: El, from: number, to: number, at: At = 0, { duration = 1.2, stagger = 0, ease = "power2.inOut" } = {}) {
  if (!el) return tl;
  if (!allow("kinetic")) { gsap.set(el, { fontWeight: to }); return tl; }
  if (stagger > 0) {
    const split = new SplitText(el, { type: "chars,words", aria: "auto" });
    return tl.fromTo(split.chars, { fontWeight: from }, { fontWeight: to, duration, stagger, ease }, at);
  }
  return tl.fromTo(el, { fontWeight: from }, { fontWeight: to, duration, ease }, at);
}

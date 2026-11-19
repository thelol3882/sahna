import { gsap } from "gsap";
import type { CodeStep, LineRef } from "./types";

type Q = (sel: string) => Element[];

export type CodeStepsOptions = {
  /** selector of the CodeBlock inside the scene (default ".cs-root"; the first match) */
  root?: string;
  /** selector of a CodePanel to sync (default ".cs-panel"; ignored if absent), false = none */
  panel?: string | false;
  /** first step label index (default: the next free sN after the existing labels) */
  from?: number;
  /** opacity of lines outside the focus (default 0.3) */
  dim?: number;
  /** blur in px of lines outside the focus (default 1.2, 0 = none) */
  blur?: number;
  /** seconds the run marker stays on each line (default 0.5) */
  dwell?: number;
  /** soft bar behind the focused range (default true) */
  focusBar?: boolean;
};

export type CodeStepsResult = {
  /** label names used, e.g. ["s1", "s2", "s3"] */
  labels: string[];
  /** start time of step k (1-based) in the timeline, for adding your own tweens */
  start: (k: number) => number;
};

const EASE = "power2.inOut";

/**
 * Entrance for a CodeBlock (and a CodePanel next to it): the card rises in, the lines fade in top to bottom.
 * Call it before codeSteps(). Only touches the card and the text spans, so it never fights the steps.
 */
export function codeIn(tl: gsap.core.Timeline, q: Q, at: number | string = 0.2, opts: { root?: string; panel?: string } = {}) {
  const root = q(opts.root ?? ".cs-root")[0] as HTMLElement | undefined;
  if (!root) return tl;
  const txts = Array.from(root.querySelectorAll(".cs-txt"));
  tl.from(root, { y: 40, autoAlpha: 0, duration: 0.7 }, at);
  if (txts.length) tl.from(txts, { x: -14, opacity: 0, duration: 0.45, stagger: { amount: Math.min(0.7, txts.length * 0.04) } }, typeof at === "number" ? at + 0.25 : `${at}+=0.25`);
  const panel = q(opts.panel ?? ".cs-panel")[0];
  if (panel) tl.from(panel, { x: 40, autoAlpha: 0, duration: 0.7 }, typeof at === "number" ? at + 0.35 : `${at}+=0.35`);
  return tl;
}

/**
 * Adds one label per step (s1, s2, … by default) to the scene timeline. Every step is made of plain
 * property tweens with known end values, so it plays backwards, and seeking to any label (or the end,
 * for print/export) gives the same picture with or without callbacks.
 */
export function codeSteps(tl: gsap.core.Timeline, q: Q, steps: CodeStep[], opts: CodeStepsOptions = {}): CodeStepsResult {
  const root = q(opts.root ?? ".cs-root")[0] as HTMLElement | undefined;
  if (!root) throw new Error(`codeSteps: no ${opts.root ?? ".cs-root"} in this scene`);
  const dim = opts.dim ?? 0.3;
  const blurPx = opts.blur ?? 1.2;
  const dwell = opts.dwell ?? 0.5;
  const useBar = opts.focusBar ?? true;

  const ROW = Number(root.dataset.row);
  const PAD = Number(root.dataset.pad);
  const numbers = root.dataset.numbers !== "0";
  const view = root.querySelector<HTMLElement>(".cs-view")!;
  const body = root.querySelector<HTMLElement>(".cs-body")!;
  const VIEW_H = parseFloat(view.style.height) || view.offsetHeight;
  const focusBar = root.querySelector<HTMLElement>(".cs-focusbar")!;
  const runBar = root.querySelector<HTMLElement>(".cs-runbar")!;
  const runMark = root.querySelector<HTMLElement>(".cs-runmark")!;
  const scroll = root.querySelector<HTMLElement>(".cs-scroll")!;
  const thumb = root.querySelector<HTMLElement>(".cs-thumb")!;
  const fade = root.querySelector<HTMLElement>(".cs-fade")!;

  // a re-run (hot reload) must not stack generated nodes
  root.querySelectorAll(".cs-gen").forEach((n) => n.remove());

  const rows = Array.from(root.querySelectorAll<HTMLElement>(".cs-row")).map((el) => ({
    el,
    mark: (el.dataset.mark ?? "") as "" | "add" | "del",
    a: el.dataset.a ? Number(el.dataset.a) : null,
    b: el.dataset.b ? Number(el.dataset.b) : null,
    len: Number(el.dataset.len ?? 0),
    txt: el.querySelector<HTMLElement>(".cs-txt")!,
    code: el.querySelector<HTMLElement>(".cs-code")!,
    gut: el.querySelector<HTMLElement>(".cs-gut")!,
    sign: el.querySelector<HTMLElement>(".cs-sign")!,
    tint: el.querySelector<HTMLElement>(".cs-tint")!,
  }));
  const N = rows.length;

  /* ---------------------------------------------------------- line references */
  const resolve = (ref: LineRef | null | undefined): number[] => {
    if (ref === null || ref === undefined) return [];
    const parts = Array.isArray(ref) ? ref : typeof ref === "number" ? [ref] : ref.split(",");
    const out: number[] = [];
    for (const p0 of parts) {
      if (typeof p0 === "number") { push(p0, ""); continue; }
      const m = p0.trim().match(/^(?:([ab]):)?(\d+)(?:\s*-\s*(\d+))?$/);
      if (!m) throw new Error(`codeSteps: bad line reference "${p0}"`);
      const lo = Number(m[2]), hi = m[3] ? Number(m[3]) : lo;
      for (let n = lo; n <= hi; n++) push(n, m[1] ?? "");
    }
    return out;
    function push(n: number, kind: string) {
      const i = kind === "a" ? rows.findIndex((r) => r.a === n) : kind === "b" ? rows.findIndex((r) => r.b === n) : n - 1;
      if (i < 0 || i >= N) throw new Error(`codeSteps: line ${kind ? kind + ":" : ""}${n} does not exist`);
      out.push(i);
    }
  };

  /* ---------------------------------------------------------- dry run: which rows are added/removed by which step */
  const diffOf = steps.map((s) => {
    if (!s.diff) return null;
    if (s.diff === true) return { add: [] as number[], remove: [] as number[], collapse: true, marks: true };
    return { add: resolve(s.diff.add), remove: resolve(s.diff.remove), collapse: s.diff.collapse ?? true, marks: false };
  });
  const pendingAdd = new Set<number>();
  diffOf.forEach((d) => d?.add.forEach((i) => pendingAdd.add(i)));
  const anyMarksStep = diffOf.some((d) => d?.marks);
  if (anyMarksStep) rows.forEach((r, i) => r.mark === "add" && pendingAdd.add(i));
  // marked rows are claimed by the FIRST `diff: true` step that comes after explicit claims
  const claimed = new Set<number>();
  diffOf.forEach((d) => { if (d && !d.marks) { d.add.forEach((i) => claimed.add(i)); d.remove.forEach((i) => claimed.add(i)); } });
  let marksUsed = false;
  diffOf.forEach((d) => {
    if (!d || !d.marks || marksUsed) return;
    marksUsed = true;
    rows.forEach((r, i) => {
      if (claimed.has(i)) return;
      if (r.mark === "add") d.add.push(i);
      if (r.mark === "del") d.remove.push(i);
    });
  });

  // visibility per stage (stage 0 = before any diff) → gutter numbers per stage
  const vis0: number[] = rows.map((_, i) => (pendingAdd.has(i) ? 0 : 1));
  const stages: number[][] = [vis0.slice()];
  {
    const v = vis0.slice();
    diffOf.forEach((d) => {
      if (!d) return;
      d.add.forEach((i) => (v[i] = 1));
      if (d.collapse) d.remove.forEach((i) => (v[i] = 0));
      stages.push(v.slice());
    });
  }
  const numbersAt = (v: number[]) => {
    let n = 0;
    return v.map((x) => (x ? ++n : n + 1)); // a hidden row shows the number it will get
  };
  const removedNoCollapse = new Set<number>();
  diffOf.forEach((d) => d && !d.collapse && d.remove.forEach((i) => removedNoCollapse.add(i)));
  if (numbers) {
    if (stages.length > 1) {
      const nums = stages.map(numbersAt);
      rows.forEach((r, i) => {
        r.gut.innerHTML = nums.map((ns, s) => `<span class="cs-n" data-s="${s}" style="opacity:${s === 0 ? 1 : 0}">${ns[i]}</span>`).join("");
      });
    } else {
      const ns = numbersAt(vis0);
      rows.forEach((r, i) => (r.gut.textContent = String(ns[i])));
    }
  }

  /* ---------------------------------------------------------- initial state (inside the scene's gsap.context) */
  // which rows are added/removed by explicit lists get the add/del look too
  diffOf.forEach((d) => {
    d?.add.forEach((i) => { rows[i].el.classList.add("cs-add"); rows[i].sign.textContent = "+"; });
    d?.remove.forEach((i) => { rows[i].el.classList.add("cs-del"); rows[i].sign.textContent = "−"; });
  });
  gsap.set(rows.map((r) => r.el), { opacity: 1, filter: "blur(0px)" });
  const pend = [...pendingAdd].map((i) => rows[i].el);
  if (pend.length) gsap.set(pend, { height: 0, opacity: 0 });

  const typed = new Map<number, HTMLElement>(); // row → caret
  steps.forEach((s) => resolve(s.type).forEach((i) => {
    if (typed.has(i)) return;
    const caret = document.createElement("span");
    caret.className = "cs-caret cs-gen";
    rows[i].code.appendChild(caret);
    typed.set(i, caret);
    gsap.set(rows[i].txt, { width: "0ch" });
  }));

  // value notes, one element per (step, line)
  const notes: HTMLElement[][] = steps.map((s) => {
    if (!s.values) return [];
    return Object.entries(s.values).map(([ref, text]) => {
      const i = resolve(/^\d+$/.test(ref) ? Number(ref) : ref)[0];
      const el = document.createElement("span");
      el.className = "cs-ann cs-gen";
      el.textContent = text;
      el.dataset.row = String(i);
      rows[i].code.appendChild(el);
      return el;
    });
  });

  /* ---------------------------------------------------------- layout helpers (pure, from tracked state) */
  const vis = vis0.slice();
  let focus: Set<number> | null = null;
  let scrollY = 0;
  let runOn = false;
  let notesOn: HTMLElement[] = [];
  const offset = (i: number) => { let y = 0; for (let j = 0; j < i; j++) y += vis[j] * ROW; return y; };
  const contentH = () => vis.reduce((s, v) => s + v, 0) * ROW + PAD * 2;
  const maxScroll = () => Math.max(0, contentH() - VIEW_H);
  const clampScroll = (y: number) => Math.min(maxScroll(), Math.max(0, Math.round(y)));
  const scrollbar = () => {
    const ch = contentH();
    const track = VIEW_H - 24;
    const h = Math.max(36, (track * VIEW_H) / ch);
    const ms = maxScroll();
    return { on: ch > VIEW_H + 1, h, y: ms ? (scrollY / ms) * (track - h) : 0, more: scrollY < ms - 1 };
  };
  const tweenScroll = (at: number, dur = 0.9) => {
    const sb = scrollbar();
    tl.to(body, { y: -scrollY, duration: dur, ease: EASE }, at)
      .to(thumb, { y: sb.y, height: sb.h, duration: dur, ease: EASE }, at)
      .to(scroll, { autoAlpha: sb.on ? 1 : 0, duration: 0.3 }, at)
      .to(fade, { autoAlpha: sb.more ? 1 : 0, duration: 0.3 }, at);
  };
  /** scroll so rows lo..hi are visible; returns true if it scrolls */
  // the bottom fade covers ~64px when there is more below, so "visible" keeps clear of it
  const ensure = (lo: number, hi: number, center = false) => {
    const top = PAD + offset(lo), bot = PAD + offset(hi) + ROW;
    const fits = bot - top <= VIEW_H - 2 * ROW;
    const inView = top >= scrollY + ROW / 2 && bot <= scrollY + VIEW_H - (scrollY < maxScroll() - 1 ? 72 : 4);
    if (inView && !center) return false;
    const target = fits ? (top + bot) / 2 - VIEW_H / 2 : top - ROW;
    const y = clampScroll(target);
    if (Math.abs(y - scrollY) < (inView ? ROW : 1)) return false;
    scrollY = y;
    return true;
  };
  const visibleRows = () => rows.map((_, i) => i).filter((i) => vis[i]);
  const barOf = (set: number[]) => {
    const v = set.filter((i) => vis[i]);
    if (!v.length) return null;
    const lo = Math.min(...v), hi = Math.max(...v);
    return { y: PAD + offset(lo), h: offset(hi) - offset(lo) + ROW };
  };

  // static initial state of the chrome
  {
    const sb = scrollbar();
    gsap.set(thumb, { y: 0, height: sb.h });
    gsap.set(scroll, { autoAlpha: sb.on ? 1 : 0 });
    gsap.set(fade, { autoAlpha: sb.more ? 1 : 0 });
    gsap.set(body, { y: 0 });
  }

  /* ---------------------------------------------------------- panel */
  const panel = opts.panel === false ? null : (q(opts.panel ?? ".cs-panel")[0] as HTMLElement | undefined);
  const pItems = new Map<number, HTMLElement>();
  panel?.querySelectorAll<HTMLElement>(".cs-pitem").forEach((el) => pItems.set(Number(el.dataset.k), el));
  const pDots = panel ? Array.from(panel.querySelectorAll<HTMLElement>(".cs-pdot i")) : [];
  let pCur = pItems.has(0) ? 0 : -1;
  pItems.forEach((el, k) => gsap.set(el, { autoAlpha: k === pCur ? 1 : 0 }));

  /* ---------------------------------------------------------- labels */
  if (tl.labels.s0 === undefined) tl.addLabel("s0", tl.duration());
  const used = Object.keys(tl.labels).filter((k) => /^s\d+$/.test(k)).map((k) => Number(k.slice(1)));
  const first = opts.from ?? Math.max(...used) + 1;
  const labels: string[] = [];
  const starts: number[] = [];

  steps.forEach((step, si) => {
    const k = first + si;
    const t0 = tl.labels[`s${k - 1}`] ?? tl.duration();
    starts.push(t0);
    let t = t0;
    let end = t0 + 0.3;

    // panel text for this step
    if (panel) {
      const next = pItems.has(si + 1) ? si + 1 : pCur;
      if (next !== pCur) {
        if (pCur >= 0) tl.to(pItems.get(pCur)!, { autoAlpha: 0, y: -14, duration: 0.3, ease: "power2.in" }, t0);
        tl.fromTo(pItems.get(next)!, { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.5, immediateRender: false }, t0 + 0.2);
        pCur = next;
      }
      if (pDots[si]) tl.to(pDots[si], { opacity: 1, duration: 0.4 }, t0);
      end = Math.max(end, t0 + 0.7);
    }

    // leaving a run: marker and line bar fade, notes stay until the next run
    if (runOn && !step.run) {
      tl.to([runMark, runBar], { autoAlpha: 0, duration: 0.3 }, t);
      runOn = false;
    }

    /* ---- diff */
    const d = diffOf[si];
    if (d) {
      const dels = d.remove.filter((i) => vis[i]);
      const adds = d.add.filter((i) => !vis[i]);
      const stageIdx = diffOf.slice(0, si + 1).filter(Boolean).length;
      // removed lines: red tint and sign
      if (dels.length) {
        tl.to(dels.map((i) => rows[i].tint), { opacity: 1, duration: 0.35 }, t)
          .to(dels.map((i) => rows[i].sign), { opacity: 1, duration: 0.35 }, t);
        if (d.collapse) {
          tl.to(dels.map((i) => rows[i].el), { height: 0, opacity: 0, duration: 0.55, ease: EASE }, t + 0.75);
          dels.forEach((i) => (vis[i] = 0));
        } else {
          tl.to(dels.map((i) => rows[i].txt), { opacity: 0.55, duration: 0.35 }, t + 0.35);
        }
      }
      const tAdd = dels.length ? t + (d.collapse ? 0.95 : 0.5) : t;
      if (adds.length) {
        const inFocus = (i: number) => !focus || focus.has(i);
        const sharp = adds.filter(inFocus).map((i) => rows[i].el);
        const soft = adds.filter((i) => !inFocus(i)).map((i) => rows[i].el);
        if (sharp.length) tl.to(sharp, { height: ROW, opacity: 1, duration: 0.55, ease: EASE, stagger: 0.06 }, tAdd);
        if (soft.length) tl.to(soft, { height: ROW, opacity: dim, filter: `blur(${blurPx}px)`, duration: 0.55, ease: EASE, stagger: 0.06 }, tAdd);
        tl.to(adds.map((i) => rows[i].tint), { opacity: 1, duration: 0.4, stagger: 0.06 }, tAdd + 0.2)
          .to(adds.map((i) => rows[i].sign), { opacity: 1, duration: 0.4, stagger: 0.06 }, tAdd + 0.2);
        adds.forEach((i) => (vis[i] = 1));
      }
      // gutter numbers switch to the new stage
      if (numbers && stages.length > 1) {
        tl.to(rows.map((r) => r.gut.querySelector(`[data-s="${stageIdx - 1}"]`)), { opacity: 0, duration: 0.3 }, tAdd)
          .to(rows.map((r) => r.gut.querySelector(`[data-s="${stageIdx}"]`)), { opacity: 1, duration: 0.3 }, tAdd + 0.15);
      }
      const tEnd = tAdd + (adds.length ? 0.6 + adds.length * 0.06 : 0.3);
      // bars and scroll follow the new layout
      if (focus && useBar) {
        const b = barOf([...focus]);
        if (b) tl.to(focusBar, { y: b.y, height: b.h, duration: tEnd - t, ease: EASE }, t);
      }
      const before = scrollY;
      scrollY = clampScroll(scrollY);
      if (adds.length) ensure(Math.min(...adds), Math.max(...adds));
      if (scrollY !== before || dels.length || adds.length) tweenScroll(t + 0.3, tEnd - t - 0.3);
      t = tEnd;
      end = Math.max(end, t);
    }

    /* ---- explicit scroll */
    if (step.scrollTo !== undefined) {
      const i = resolve(step.scrollTo)[0];
      const y = clampScroll(PAD + offset(i) - PAD);
      if (y !== scrollY) {
        scrollY = y;
        tweenScroll(t, 1.1);
        t += 1.1;
        end = Math.max(end, t);
      }
    }

    /* ---- focus */
    if (step.focus !== undefined) {
      const set = step.focus === null ? null : new Set(resolve(step.focus));
      const vr = visibleRows();
      const on = vr.filter((i) => !set || set.has(i)).map((i) => rows[i].el);
      const off = vr.filter((i) => set && !set.has(i)).map((i) => rows[i].el);
      let dur = 0.6;
      if (set && step.scrollTo === undefined) {
        const v = [...set].filter((i) => vis[i]);
        if (v.length && ensure(Math.min(...v), Math.max(...v), true)) { tweenScroll(t, 0.9); dur = 0.9; }
      }
      if (on.length) tl.to(on, { opacity: 1, filter: "blur(0px)", duration: dur, ease: EASE }, t);
      if (off.length) tl.to(off, { opacity: dim, filter: `blur(${blurPx}px)`, duration: dur, ease: EASE }, t);
      if (useBar) {
        const b = set ? barOf([...set]) : null;
        if (b && !focus) tl.set(focusBar, { y: b.y, height: b.h }, t).to(focusBar, { autoAlpha: 1, duration: dur }, t);
        else if (b) tl.to(focusBar, { y: b.y, height: b.h, autoAlpha: 1, duration: dur, ease: EASE }, t);
        else tl.to(focusBar, { autoAlpha: 0, duration: 0.4 }, t);
      }
      focus = set;
      t += dur;
      end = Math.max(end, t);
    }

    /* ---- typing */
    const typeRows = resolve(step.type);
    if (typeRows.length) {
      const speed = step.typeSpeed ?? 0.045;
      for (const i of typeRows) {
        if (!vis[i]) continue;
        if (ensure(i, i)) { tweenScroll(t, 0.6); t += 0.6; }
        const caret = typed.get(i)!;
        const n = Math.max(1, rows[i].len);
        tl.to(caret, { autoAlpha: 1, duration: 0.15 }, t)
          .fromTo(rows[i].txt, { width: "0ch" }, { width: `${n}ch`, duration: n * speed, ease: `steps(${n})`, immediateRender: false }, t + 0.2);
        t += 0.2 + n * speed;
        tl.to(caret, { autoAlpha: 0, duration: 0.2 }, t + 0.35);
        t += 0.15;
      }
      end = Math.max(end, t + 0.4);
    }

    /* ---- run */
    const runRows = resolve(step.run).filter((i) => vis[i]);
    if (runRows.length) {
      const stepNotes = notes[si];
      if (notesOn.length) tl.to(notesOn, { autoAlpha: 0, duration: 0.3 }, t);
      const y0 = (i: number) => PAD + offset(i);
      if (ensure(runRows[0], runRows[0])) { tweenScroll(t, 0.6); t += 0.6; }
      if (!runOn) {
        tl.set([runMark, runBar], { y: (j: number) => (j === 0 ? y0(runRows[0]) + ROW / 2 : y0(runRows[0])) }, t)
          .to([runMark, runBar], { autoAlpha: 1, duration: 0.25 }, t);
        t += 0.25;
      }
      runRows.forEach((i, j) => {
        if (j > 0 || runOn) {
          if (ensure(i, i)) tweenScroll(t, 0.4);
          tl.to(runMark, { y: y0(i) + ROW / 2, duration: 0.24, ease: EASE }, t)
            .to(runBar, { y: y0(i), duration: 0.24, ease: EASE }, t);
          t += 0.24;
        }
        const here = stepNotes.filter((el) => Number(el.dataset.row) === i);
        if (here.length) tl.fromTo(here, { autoAlpha: 0, x: -10 }, { autoAlpha: 1, x: 0, duration: 0.3, immediateRender: false }, t + 0.05);
        t += dwell;
      });
      notesOn = stepNotes;
      runOn = true;
      end = Math.max(end, t);
    }

    end = Math.max(end, t);
    const label = `s${k}`;
    tl.addLabel(label, end);
    if (end > tl.duration()) tl.set({}, {}, end);
    labels.push(label);
  });

  return { labels, start: (k: number) => starts[k - 1] ?? 0 };
}

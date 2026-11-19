import type { ReactNode } from "react";
import { Odometer, odometerIn } from "./Odometer";
import { VIZ, vizClass } from "./theme";
import { $$, countText, resolveAt, type At, type TL } from "./util";
import { fmtNum, fmtRatio, type NumFmt } from "./format";

/**
 * Before/after split: two full layers, the "after" layer is clipped from the left by a divider that sweeps
 * like a dragged slider (overshoot, settle at `rest`). End state: both halves visible, each with its label.
 */
export function BeforeAfter({ id, before, after, beforeLabel, afterLabel, width, height }: {
  id: string; before: ReactNode; after: ReactNode; beforeLabel: ReactNode; afterLabel: ReactNode; width: number; height: number;
}) {
  return (
    <div data-viz={id} className={vizClass("relative overflow-hidden viz-card")} style={{ width, height }}>
      <div className="ba-before absolute inset-0">{before}</div>
      <div className="ba-after absolute inset-0" style={{ clipPath: "inset(0 0 0 100%)" }}>{after}</div>
      <span className="ba-lab-b absolute left-[28px] bottom-[24px] rounded-full px-5 py-2 text-[22px] font-semibold whitespace-nowrap"
        style={{ background: "var(--viz-plane)", color: "var(--viz-ink)", border: "1.5px solid var(--viz-base)" }}>{beforeLabel}</span>
      <span className="ba-lab-a absolute right-[28px] bottom-[24px] rounded-full px-5 py-2 text-[22px] font-semibold whitespace-nowrap"
        style={{ background: "var(--viz-hi)", color: "var(--viz-on-hi)" }}>{afterLabel}</span>
      <div className="ba-div absolute top-0 bottom-0 left-0" style={{ width: 0, transform: `translateX(${width}px)` }}>
        <div className="absolute top-0 bottom-0 -left-[2px] w-[4px]" style={{ background: "var(--viz-ink)" }} />
        <div className="absolute top-1/2 -left-[30px] -mt-[30px] w-[60px] h-[60px] rounded-full flex items-center justify-center gap-[6px]"
          style={{ background: "var(--viz-surface)", border: "3px solid var(--viz-ink)", boxShadow: "var(--viz-shadow)" }} aria-hidden>
          <svg width="30" height="20" viewBox="0 0 30 20"><path d="M10 3 L3 10 L10 17 M20 3 L27 10 L20 17" fill="none" stroke="var(--viz-ink)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
      </div>
    </div>
  );
}

/** Divider sweeps in from the right edge, overshoots to `reach`, settles at `rest` (fractions of the width). */
export function splitSweep(tl: TL, root: Element, at: At, { reach = 0.18, rest = 0.5, duration = 2.0 } = {}) {
  const t = resolveAt(tl, at);
  const w = (root as HTMLElement).offsetWidth;
  const after = $$(root, ".ba-after")[0] as HTMLElement, div = $$(root, ".ba-div")[0] as HTMLElement;
  const o = { p: 1 };
  const apply = () => { after.style.clipPath = `inset(0 0 0 ${(o.p * 100).toFixed(2)}%)`; div.style.transform = `translateX(${(o.p * w).toFixed(1)}px)`; };
  tl.fromTo(div, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2 }, t);
  tl.fromTo(o, { p: 1 }, { keyframes: [{ p: reach, duration: duration * 0.6, ease: "power2.inOut" }, { p: rest, duration: duration * 0.4, ease: "power2.out" }], onUpdate: apply }, t);
  tl.fromTo($$(root, ".ba-lab-a"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, t + duration * 0.3);
  apply();
  return tl;
}

/**
 * "4× faster": two bars on one scale (zero-based, same axis), the better one highlighted, the ratio computed
 * from the data (never typed). `lowerIsBetter` picks which bar is the winner and the order of the division.
 */
export function RatioBars({ id, a, b, format = {}, width, word, lowerIsBetter = true }: {
  id: string; a: { label: ReactNode; value: number }; b: { label: ReactNode; value: number }; format?: NumFmt; width: number; word: ReactNode; lowerIsBetter?: boolean;
}) {
  const max = Math.max(a.value, b.value);
  const ratio = lowerIsBetter ? fmtRatio(Math.max(a.value, b.value), Math.min(a.value, b.value)) : fmtRatio(Math.max(a.value, b.value), Math.min(a.value, b.value));
  const winB = lowerIsBetter ? b.value < a.value : b.value > a.value;
  const labelW = 170, valW = 160;
  const bw = width - labelW - valW;
  const row = (r: { label: ReactNode; value: number }, hi: boolean, cls: string) => (
    <div className={`rb-row ${cls} relative h-[64px]`}>
      <span className="viz-label absolute left-0 top-1/2 -translate-y-1/2 whitespace-nowrap" style={{ fontSize: 24, fontWeight: hi ? 800 : 600 }}>{r.label}</span>
      <div className="rb-bar viz-hbar absolute top-0 bottom-0" style={{ left: labelW, width: (r.value / max) * bw, background: hi ? "var(--viz-hi)" : "var(--viz-context)", transformOrigin: "0% 50%" }} />
      <span className="rb-val viz-value absolute top-1/2 -translate-y-1/2" style={{ left: labelW + (r.value / max) * bw + 16, fontSize: 30 }} data-v={r.value}>{fmtNum(r.value, format)}</span>
    </div>
  );
  return (
    <div data-viz={id} className={vizClass("relative flex flex-col gap-6")} style={{ width }}>
      <div className="rb-ratio flex items-baseline gap-5">
        <span className="font-bold tracking-[-0.05em] leading-none" style={{ fontSize: 168, color: "var(--viz-ink)" }}><Odometer text={ratio} /></span>
        <span className="text-[44px] font-semibold" style={{ color: "var(--viz-ink-2)" }}>{word}</span>
      </div>
      {row(a, !winB, "rb-a")}
      {row(b, winB, "rb-b")}
    </div>
  );
}

/** Bars grow one after the other on the shared scale, values count, then the ratio rolls in. */
export function ratioIn(tl: TL, root: Element, at: At, format: NumFmt = {}) {
  const t = resolveAt(tl, at);
  tl.set($$(root, ".rb-ratio"), { autoAlpha: 0 }, 0);
  $$(root, ".rb-row").forEach((row, i) => {
    const ti = t + i * 0.7;
    tl.fromTo($$(row, ".viz-label"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, ti)
      .fromTo($$(row, ".rb-bar"), { scaleX: 0 }, { scaleX: 1, duration: 0.9, ease: VIZ.ease }, ti);
    const val = $$(row, ".rb-val")[0] as HTMLElement;
    tl.fromTo(val, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, ti + 0.5);
    countText(tl, val, 0, Number(val.dataset.v), ti + 0.3, (v) => fmtNum(v, format), 0.6);
  });
  const tr = t + 1.6;
  tl.fromTo($$(root, ".rb-ratio"), { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: 0.5, immediateRender: false }, tr);
  odometerIn(tl, $$(root, ".rb-ratio")[0], tr);
  return tl;
}

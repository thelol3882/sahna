import type { ReactNode } from "react";
import { Odometer, odometerIn } from "./Odometer";
import { VIZ, vizClass } from "./theme";
import { $$, countText, resolveAt, type At, type TL } from "./util";
import { fmtNum, type NumFmt } from "./format";

/**
 * Waffle / unit chart: `total` dots (default 100 = 10×10), `share` of them light up (rounded to whole dots;
 * the label prints the exact share). Lit dots are filled, unlit ones are rings — shape AND colour carry it.
 */
export function Waffle({ id, share, total = 100, cols = 10, size = 520, label, format = { style: "percent" } }: {
  id: string; share: number; total?: number; cols?: number; size?: number; label: ReactNode; format?: NumFmt;
}) {
  const rows = Math.ceil(total / cols);
  const cell = size / cols;
  const r = cell * 0.36;
  const lit = Math.round((share / 100) * total);
  return (
    <div data-viz={id} className={vizClass("relative flex items-center gap-14")}>
      <svg width={size} height={rows * cell} viewBox={`0 0 ${size} ${rows * cell}`} aria-hidden>
        {Array.from({ length: total }, (_, i) => {
          // fill order: bottom-left upwards, row by row (reads like a level rising)
          const row = rows - 1 - Math.floor(i / cols), col = i % cols;
          const cx = col * cell + cell / 2, cy = row * cell + cell / 2;
          return (
            <g key={i} className={`wf-dot ${i < lit ? "is-lit" : ""}`} transform={`translate(${cx},${cy})`}>
              <circle className="wf-ring" r={r} fill="none" stroke="var(--viz-base)" strokeWidth={2.5} />
              {i < lit && <circle className="wf-fill viz-glow" r={r + 1.5} fill="var(--viz-hi)" />}
            </g>
          );
        })}
      </svg>
      <div className="flex flex-col gap-3 max-w-[380px]">
        <span className="wf-num font-bold tracking-[-0.04em] leading-none" style={{ fontSize: 128, color: "var(--viz-ink)" }}><Odometer text={fmtNum(share, format)} /></span>
        <span className="wf-label text-[30px] leading-[1.3] font-semibold" style={{ color: "var(--viz-ink-2)" }}>{label}</span>
        <span className="wf-count viz-sub" data-lit={lit} data-total={total}>{lit} / {total}</span>
      </div>
    </div>
  );
}

export function waffleIn(tl: TL, root: Element, at: At) {
  const t = resolveAt(tl, at);
  tl.fromTo($$(root, ".wf-ring"), { scale: 0 }, { scale: 1, duration: 0.4, ease: "back.out(2)", stagger: { each: 0.006, from: "start" } }, t);
  tl.set($$(root, ".wf-fill"), { scale: 0 }, 0);
  tl.set($$(root, ".wf-num, .wf-label, .wf-count"), { autoAlpha: 0 }, 0);
  return tl;
}

/** The share lights up dot by dot; the number rolls, the count ticks. */
export function waffleFill(tl: TL, root: Element, at: At, duration = 1.4) {
  const t = resolveAt(tl, at);
  const fills = $$(root, ".wf-fill");
  tl.fromTo(fills, { scale: 0 }, { scale: 1, duration: 0.35, ease: "back.out(2.2)", stagger: { amount: duration - 0.35 }, immediateRender: false }, t);
  tl.fromTo($$(root, ".wf-num, .wf-label, .wf-count"), { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.1, immediateRender: false }, t);
  odometerIn(tl, $$(root, ".wf-num")[0], t, { duration: Math.max(VIZ.countDur, duration) });
  const c = $$(root, ".wf-count")[0] as HTMLElement;
  const lit = Number(c.dataset.lit), total = Number(c.dataset.total);
  countText(tl, c, 0, lit, t, (v) => `${Math.round(v)} / ${total}`, duration, "none");
  return tl;
}

export type FunnelStage = { key: string; label: ReactNode; value: number };

/**
 * Funnel: one bar per stage, centred, width ∝ value (linear: a funnel that narrows faster than the data lies).
 * Between stages: the step conversion (next / this). `highlight` = index of the stage whose drop gets the callout.
 */
export function Funnel({ id, stages, width, rowH = 92, gap = 54, format = {}, highlight }: {
  id: string; stages: FunnelStage[]; width: number; rowH?: number; gap?: number; format?: NumFmt; highlight?: number;
}) {
  const labelW = 250;
  const bw = width - labelW;
  const max = stages[0].value;
  return (
    <div data-viz={id} className={vizClass("relative")} style={{ width, height: stages.length * rowH + (stages.length - 1) * gap }}>
      {stages.map((s, i) => {
        const w = (s.value / max) * bw;
        const top = i * (rowH + gap);
        const q = `var(--viz-q${Math.min(5, i + 2)})`;
        const conv = i > 0 ? (s.value / stages[i - 1].value) * 100 : null;
        // the value goes inside the bar only if it fits with padding (≈ 16 px per glyph at 26 px bold)
        const inside = w >= fmtNum(s.value, format).length * 16 + 40;
        return (
          <div key={s.key} className="fn-stage" data-i={i}>
            <span className="viz-label absolute left-0 whitespace-nowrap" style={{ top: top + rowH / 2 - 16, fontSize: 24 }}>{s.label}</span>
            <div className="fn-bar absolute rounded-[10px]" style={{ left: labelW + (bw - w) / 2, top, width: w, height: rowH, background: q }} />
            <span className={`fn-val viz-value absolute ${inside ? "-translate-x-1/2" : ""}`} style={{ left: inside ? labelW + bw / 2 : labelW + (bw + w) / 2 + 14, top: top + rowH / 2 - 17, color: inside && i >= 2 ? "var(--viz-on-hi)" : "var(--viz-ink)" }}
              data-v={s.value}>{fmtNum(s.value, format)}</span>
            {conv !== null && (
              <span className={`fn-conv absolute -translate-x-1/2 rounded-full px-4 py-[3px] text-[20px] font-semibold whitespace-nowrap ${highlight === i ? "is-hi" : ""}`}
                style={{ left: labelW + bw / 2, top: top - gap / 2 - 18, background: highlight === i ? "var(--viz-bad)" : "var(--viz-plane)", color: highlight === i ? "var(--viz-on-bad)" : "var(--viz-ink-2)", border: "1.5px solid var(--viz-base)" }}>
                ↓ {fmtNum(conv, { style: "percent", decimals: 0 })}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function funnelIn(tl: TL, root: Element, at: At, format: NumFmt = {}) {
  const t = resolveAt(tl, at);
  $$(root, ".fn-stage").forEach((st, i) => {
    const ti = t + i * 0.35;
    tl.fromTo($$(st, ".viz-label"), { autoAlpha: 0, x: -12 }, { autoAlpha: 1, x: 0, duration: 0.4 }, ti)
      .fromTo($$(st, ".fn-bar"), { scaleX: 0, transformOrigin: "50% 50%" }, { scaleX: 1, duration: 0.7, ease: VIZ.ease }, ti)
      .fromTo($$(st, ".fn-conv"), { autoAlpha: 0, scale: 0.8 }, { autoAlpha: 1, scale: 1, duration: 0.35 }, ti + 0.3)
      .fromTo($$(st, ".fn-val"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, ti + 0.2);
    const v = $$(st, ".fn-val")[0] as HTMLElement;
    countText(tl, v, 0, Number(v.dataset.v), ti + 0.1, (x) => fmtNum(x, format), 0.7);
  });
  return tl;
}

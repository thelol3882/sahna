import type { ReactNode } from "react";
import { linear, niceMax, niceTicks } from "./scale";
import { VIZ, vizClass } from "./theme";
import { $$, countText, resolveAt, type At, type TL } from "./util";
import { fmtNum, type NumFmt } from "./format";

export type BarDatum = { key: string; label: string; value: number };

/**
 * Columns from one zero baseline (always 0: a bar's length IS its value). Value labels sit on the caps and count up;
 * one bar can be highlighted (colour + bold value + marker, never colour alone). Direct labels, no legend.
 * Size in stage px. Children render on top (callouts in chart px).
 */
export function BarChart({ id, data, highlight, width, height, format = {}, max, ticks = 4, axisLabel, children, className = "", style }: {
  id: string; data: BarDatum[]; highlight?: string; width: number; height: number; format?: NumFmt; max?: number; ticks?: number;
  axisLabel?: ReactNode; children?: ReactNode; className?: string; style?: React.CSSProperties;
}) {
  if (data.some((d) => d.value < 0)) throw new Error(`BarChart ${id}: negative values need a diverging chart`);
  const { L, T, pw, ph, top, y, band, bw } = barGeom(data, width, height, max, ticks);
  const tickVals = niceTicks(0, top, ticks);
  return (
    <div data-viz={id} className={vizClass(`relative ${className}`)} style={{ width, height, ...style }} data-max={top}>
      {axisLabel && <div className="viz-tick absolute left-0 top-0 text-[18px]" style={{ color: "var(--viz-muted)" }}>{axisLabel}</div>}
      <div className="bc-plot absolute" style={{ left: L, top: T, width: pw, height: ph }}>
        {tickVals.map((v) => (
          <div key={v} className="bc-grid absolute left-0 right-0" style={{ top: y(v), height: 1, background: v === 0 ? "var(--viz-base)" : "var(--viz-grid)" }}>
            <span className="viz-tick absolute right-full mr-4 -translate-y-1/2 whitespace-nowrap" style={{ color: "var(--viz-muted)", fontSize: 18 }}>
              {fmtNum(v, { ...format, style: format.style === "currency" ? "compact" : format.style, decimals: 0 })}
            </span>
          </div>
        ))}
        {data.map((d, i) => {
          const h = ph - y(d.value);
          const hi = d.key === highlight;
          const cx = band * i + band / 2;
          return (
            <div key={d.key} className={`bc-col ${hi ? "is-hi" : ""}`} data-key={d.key}>
              <div className={`viz-bar bc-bar`} style={{ left: cx - bw / 2, width: bw, height: h, transform: "scaleY(1)" }}>
                <div className="bc-hi-fill viz-bar is-hi absolute inset-0" style={{ opacity: hi ? 0 : 0, display: hi ? undefined : "none" }} />
              </div>
              <span className={`bc-val viz-value absolute -translate-x-1/2 text-center`} style={{ left: cx, top: y(d.value) - 44, fontWeight: hi ? 800 : 700 }}
                data-v={d.value}>{fmtNum(d.value, format)}</span>
              <span className="bc-cat viz-label absolute -translate-x-1/2 text-center whitespace-nowrap" style={{ left: cx, top: ph + 14, fontWeight: hi ? 700 : 500 }}>
                {hi && <span className="bc-mark inline-block mr-2" aria-hidden style={{ color: "var(--viz-hi-ink)" }}>▲</span>}{d.label}
              </span>
            </div>
          );
        })}
      </div>
      {children}
    </div>
  );
}

/**
 * Geometry of a BarChart in chart px (same numbers the component uses), for placing callouts:
 * `cap(key)` = top centre of that bar.
 */
export function barGeom(data: BarDatum[], width: number, height: number, max?: number, ticks = 4) {
  const L = 84, R = 16, T = 56, B = 56; // plot padding: ticks left, values above, labels below
  const pw = width - L - R, ph = height - T - B;
  const top = niceMax(max ?? Math.max(...data.map((d) => d.value)), ticks);
  const y = linear([0, top], [ph, 0]);
  const band = pw / data.length;
  const bw = Math.min(112, band * 0.62);
  const cap = (key: string) => { const i = data.findIndex((d) => d.key === key); return { x: L + band * i + band / 2, y: T + y(data[i].value) }; };
  return { L, T, pw, ph, top, y, band, bw, cap };
}

/** Plot frame and ticks in, then bars grow from the baseline with their value labels riding the caps and counting. */
export function barsIn(tl: TL, root: Element, at: At, format: NumFmt = {}, { stagger = 0.08, duration = 0.9 } = {}) {
  const t = resolveAt(tl, at);
  tl.fromTo($$(root, ".bc-grid"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4, stagger: 0.04 }, t);
  tl.fromTo($$(root, ".bc-cat"), { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.4, stagger }, t + 0.1);
  $$(root, ".bc-col").forEach((col, i) => {
    const bar = $$(col, ".bc-bar")[0] as HTMLElement;
    const val = $$(col, ".bc-val")[0] as HTMLElement;
    const ti = t + 0.25 + i * stagger;
    tl.fromTo(bar, { scaleY: 0, transformOrigin: "50% 100%" }, { scaleY: 1, duration, ease: VIZ.ease }, ti);
    tl.fromTo(val, { y: bar.offsetHeight }, { y: 0, duration, ease: VIZ.ease }, ti)
      .fromTo(val, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2 }, ti);
    const v = Number(val.dataset.v);
    countText(tl, val, 0, v, ti, (x) => fmtNum(x, format), duration, VIZ.ease);
  });
  return tl;
}

/** Turn one bar into the highlight (overlay fill fades in), dim the rest a little, show the ▲ marker. */
export function barsHighlight(tl: TL, root: Element, at: At) {
  const t = resolveAt(tl, at);
  tl.fromTo($$(root, ".bc-col.is-hi .bc-hi-fill"), { opacity: 0 }, { opacity: 1, duration: 0.5 }, t)
    .fromTo($$(root, ".bc-col:not(.is-hi) .bc-bar"), { opacity: 1 }, { opacity: 0.55, duration: 0.5 }, t)
    .fromTo($$(root, ".bc-col.is-hi .bc-mark"), { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.4 }, t + 0.1);
  return tl;
}


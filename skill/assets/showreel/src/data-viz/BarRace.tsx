import { linear, niceMax } from "./scale";
import { VIZ, slot, vizClass } from "./theme";
import { $$, resolveAt, type At, type TL } from "./util";
import { fmtNum, type NumFmt } from "./format";

export type RaceEntity = { key: string; label: string };
export type RaceFrame = { label: string; values: Record<string, number> };

/**
 * Bar race: horizontal bars, one frame per step; rows re-order by rank, lengths and values tween.
 * The x scale is FIXED across frames (max of all frames), so a longer bar always means a bigger number.
 * Colour follows the entity (slot by entity order), names are direct labels; `highlight` adds the bold ring.
 */
export function BarRace({ id, entities, frames, width, height, format = {}, highlight, rowGap = 14, color, nameW = 230, valW = 150, nameSize = 24 }: {
  id: string; entities: RaceEntity[]; frames: RaceFrame[]; width: number; height: number; format?: NumFmt; highlight?: string; rowGap?: number;
  /** one colour for every bar (a ranking of one measure); default = entity slot colours */
  color?: string; nameW?: number; valW?: number; nameSize?: number;
}) {
  const top = 0;
  const n = entities.length;
  const rowH = (height - top - rowGap * (n - 1)) / n;
  const max = niceMax(Math.max(...frames.flatMap((f) => Object.values(f.values))));
  const x = linear([0, max], [0, width - nameW - valW]);
  const rank = (f: RaceFrame) => [...entities].sort((a, b) => (f.values[b.key] ?? 0) - (f.values[a.key] ?? 0)).map((e) => e.key);
  const r0 = rank(frames[0]);
  return (
    <div data-viz={id} className={vizClass("relative")} style={{ width, height }}
      data-frames={JSON.stringify(frames.map((f) => ({ order: rank(f), values: f.values })))} data-max={max} data-plotw={width - nameW - valW} data-rowh={rowH + rowGap}>
      {entities.map((e, i) => {
        const v = frames[0].values[e.key] ?? 0;
        const hi = e.key === highlight;
        return (
          <div key={e.key} className="br-row absolute left-0 right-0" data-key={e.key} style={{ top: top + r0.indexOf(e.key) * (rowH + rowGap), height: rowH }}>
            <span className="viz-label absolute left-0 top-1/2 -translate-y-1/2" style={{ width: nameW - 20, textAlign: "right", fontWeight: hi ? 800 : 600, fontSize: nameSize, lineHeight: 1.12, textWrap: "balance" }}>{e.label}</span>
            <div className="br-bar viz-hbar absolute top-0 bottom-0" style={{ left: nameW, width: x(max), background: color ?? slot(i + 1), transform: `scaleX(${v / max})`, transformOrigin: "0% 50%",
              outline: hi ? "3px solid var(--viz-ink)" : undefined, outlineOffset: hi ? 3 : undefined }} />
            <span className="br-val viz-value absolute top-1/2" style={{ left: nameW + 14, transform: `translate(${x(v)}px, -50%)`, fontSize: 26 }}>{fmtNum(v, format)}</span>
          </div>
        );
      })}
    </div>
  );
}

type Parsed = { order: string[]; values: Record<string, number> }[];
const parse = (root: Element) => {
  const el = root as HTMLElement;
  return { frames: JSON.parse(el.dataset.frames!) as Parsed, max: Number(el.dataset.max), pw: Number(el.dataset.plotw), rowH: Number(el.dataset.rowh) };
};

/** Frame 0 in: bars grow from the axis in rank order, values count. */
export function barRaceIn(tl: TL, root: Element, at: At, format: NumFmt = {}) {
  const t = resolveAt(tl, at);
  const { frames, max, pw } = parse(root);
  const f = frames[0];
  $$(root, ".br-row").forEach((row) => {
    const k = (row as HTMLElement).dataset.key!;
    const v = f.values[k] ?? 0;
    const ti = t + f.order.indexOf(k) * 0.07;
    tl.fromTo($$(row, ".viz-label"), { autoAlpha: 0, x: -12 }, { autoAlpha: 1, x: 0, duration: 0.4 }, ti);
    tl.fromTo($$(row, ".br-bar"), { scaleX: 0 }, { scaleX: v / max, duration: 0.9, ease: VIZ.ease }, ti);
    const val = $$(row, ".br-val")[0] as HTMLElement;
    const o = { v: 0 };
    val.dataset.final = fmtNum(v, format);
    tl.fromTo(o, { v: 0 }, { v, duration: 0.9, ease: VIZ.ease, onUpdate: () => {
      val.textContent = fmtNum(o.v, format);
      val.style.transform = `translate(${(o.v / max) * pw}px, -50%)`;
    } }, ti);
  });
  return tl;
}

/** Go from frame k-1 to frame k: rows move to their new rank, bars and values tween (fixed scale). */
export function barRaceTo(tl: TL, root: Element, k: number, at: At, format: NumFmt = {}, duration = 1.2) {
  const t = resolveAt(tl, at);
  const { frames, max, pw, rowH } = parse(root);
  const a = frames[k - 1], b = frames[k];
  $$(root, ".br-row").forEach((row) => {
    const key = (row as HTMLElement).dataset.key!;
    const dy = (b.order.indexOf(key) - frames[0].order.indexOf(key)) * rowH;
    const dyA = (a.order.indexOf(key) - frames[0].order.indexOf(key)) * rowH;
    tl.fromTo(row, { y: dyA }, { y: dy, duration, ease: "power2.inOut" }, t);
    const va = a.values[key] ?? 0, vb = b.values[key] ?? 0;
    tl.fromTo($$(row, ".br-bar"), { scaleX: va / max }, { scaleX: vb / max, duration, ease: "power2.inOut", immediateRender: false }, t);
    const val = $$(row, ".br-val")[0] as HTMLElement;
    val.dataset.final = fmtNum(vb, format); // the last frame built is the end state
    const o = { v: va };
    tl.fromTo(o, { v: va }, { v: vb, duration, ease: "power2.inOut", immediateRender: false, onUpdate: () => {
      val.textContent = fmtNum(o.v, format);
      val.style.transform = `translate(${(o.v / max) * pw}px, -50%)`;
    } }, t);
  });
  return tl;
}

/** Big frame label (e.g. the quarter) that swaps per step: render one span per frame with class br-frame. */
export function FrameLabels({ frames, className = "", style }: { frames: RaceFrame[]; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={className} style={{ position: className.includes("absolute") ? undefined : "relative", ...style }}>
      {frames.map((f, i) => <span key={i} className="br-frame absolute right-0 top-0 whitespace-nowrap" data-i={i}>{f.label}</span>)}
    </div>
  );
}

export function frameLabelTo(tl: TL, root: Element, k: number, at: At) {
  const t = resolveAt(tl, at);
  const els = $$(root, ".br-frame");
  if (k === 0) { tl.set(els.slice(1), { autoAlpha: 0 }, 0); tl.fromTo(els[0], { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 0.5 }, t); return tl; }
  tl.to(els[k - 1], { autoAlpha: 0, y: -24, duration: 0.4, immediateRender: false }, t)
    .fromTo(els[k], { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.5, immediateRender: false }, t + 0.2);
  return tl;
}

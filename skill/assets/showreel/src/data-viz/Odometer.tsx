import { odometer } from "../fx";
import { VIZ } from "./theme";
import { $$, resolveAt, type At, type TL } from "./util";

/**
 * Rolling digits for a formatted number (any locale: "1 284 000", "38,4 %", "₸2,450,000"). Renders the FINAL
 * text; odometerIn() turns it into the deck's one odometer (odometer() in src/fx/kinetic.ts: one transform tween
 * per digit column, so forward, back, jump and export land on the same frame without events). Separators stay put.
 */
export function Odometer({ text, className = "", style }: { text: string; className?: string; style?: React.CSSProperties }) {
  return <span className={`viz-odo ${className}`} style={style} data-final={text} aria-label={text}>{text}</span>;
}

/** Roll every odometer inside `root` (or the element itself) from zeros to its value; spins follow the dial. */
export function odometerIn(tl: TL, root: Element, at: At, { duration = VIZ.countDur, stagger = 0.06 } = {}) {
  const t = resolveAt(tl, at);
  const els = root.classList.contains("viz-odo") ? [root] : $$(root, ".viz-odo");
  for (const el of els) {
    const text = (el as HTMLElement).dataset.final ?? el.textContent ?? "";
    const zeros = text.replace(/\d/g, "0");
    odometer(tl, el, 0, 1, t, { format: (v) => (v ? text : zeros), duration, stagger, laps: VIZ.spins, ease: VIZ.ease });
  }
  return tl;
}

import type { CSSProperties, ReactNode } from "react";
import { resolveAt, type At } from "./story";

/**
 * One caption per step under the diagram ("● LIVE  1 · Checkout"), swapped by the scene timeline. The LIVE dot
 * blinks only on screen (never in export). Place inside <DiagramView> so the --dg-* tokens apply.
 */
export function Captions({ items, live = true, style }: { items: ReactNode[]; live?: boolean; style?: CSSProperties }) {
  return (
    <div className="dg-caps" style={{ position: "absolute", left: 120, top: 944, width: 1680, height: 44, ...style }}>
      {items.map((t, i) => (
        <div key={i} className={`dg-cap dg-cap-${i}`} style={{ position: "absolute", left: 0, top: 0, display: "flex", alignItems: "center", gap: 16, fontSize: 24, color: "var(--dg-ink)", whiteSpace: "nowrap", opacity: 0, visibility: "hidden" }}>
          {live && <span className="dg-live"><i />live</span>}
          <span>{t}</span>
        </div>
      ))}
    </div>
  );
}

/** Show caption i at `at` (the previous one leaves). */
export function caption(tl: gsap.core.Timeline, q: (s: string) => Element[], i: number, at: At) {
  const t = resolveAt(tl, at);
  if (i > 0) tl.to(q(`.dg-cap-${i - 1}`), { autoAlpha: 0, y: -12, duration: 0.3 }, t);
  tl.fromTo(q(`.dg-cap-${i}`), { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.4, immediateRender: false }, t + 0.15);
  return t + 0.55;
}

import { useEffect, useRef } from "react";

/**
 * Presenting tools: black/white screen, laser dot, pen. All live in the stage (stage coordinates), are
 * driven by the engine's keys, and are never rendered in #print or export mode.
 */

export type Blank = "" | "black" | "white";

export function BlankScreen({ mode }: { mode: Blank }) {
  if (!mode) return null;
  return <div className="blank no-export" style={{ background: mode === "black" ? "#000" : "#fff" }} aria-hidden />;
}

/** Client (window) point → stage point (1920×1080). */
export function toStage(stage: HTMLElement, x: number, y: number) {
  const r = stage.getBoundingClientRect();
  const s = r.width / 1920;
  return { x: (x - r.left) / s, y: (y - r.top) / s };
}

/** Soft red dot that follows the real mouse while the laser key is held. */
export function Laser({ on, stage }: { on: boolean; stage: React.RefObject<HTMLDivElement | null> }) {
  const dot = useRef<HTMLDivElement>(null);
  const last = useRef({ x: -100, y: -100 });
  useEffect(() => {
    const place = () => { if (dot.current) dot.current.style.transform = `translate(${last.current.x}px, ${last.current.y}px)`; };
    const move = (e: PointerEvent) => {
      if (!stage.current) return;
      last.current = toStage(stage.current, e.clientX, e.clientY);
      place();
    };
    place();
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, [stage]);
  return <div ref={dot} className="laser no-export" style={{ zIndex: 70, visibility: on ? "visible" : "hidden" }} aria-hidden />;
}

export type Stroke = { x: number; y: number }[];

/** Smooth path through the points (midpoint quadratic curves). */
export function strokePath(p: Stroke) {
  if (p.length === 0) return "";
  if (p.length < 3) return `M${p[0].x} ${p[0].y} L${p[p.length - 1].x + 0.1} ${p[p.length - 1].y}`;
  let d = `M${p[0].x} ${p[0].y}`;
  for (let i = 1; i < p.length - 1; i++) {
    const mx = (p[i].x + p[i + 1].x) / 2, my = (p[i].y + p[i + 1].y) / 2;
    d += ` Q${p[i].x} ${p[i].y} ${mx} ${my}`;
  }
  const z = p[p.length - 1];
  return `${d} L${z.x} ${z.y}`;
}

/** Freehand strokes over the stage. Takes the pointer only while drawing is on. */
export function DrawLayer({ on, strokes, onStroke, stage }: {
  on: boolean; strokes: Stroke[]; onStroke: (s: Stroke) => void; stage: React.RefObject<HTMLDivElement | null>;
}) {
  const live = useRef<SVGPathElement>(null);
  const pts = useRef<Stroke | null>(null);
  const down = (e: React.PointerEvent) => {
    if (!on || !stage.current || e.button > 0) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pts.current = [toStage(stage.current, e.clientX, e.clientY)];
  };
  const move = (e: React.PointerEvent) => {
    if (!pts.current || !stage.current) return;
    // coalesced events give pens and fast mice a smooth line
    const evs = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    for (const ev of evs) pts.current.push(toStage(stage.current, ev.clientX, ev.clientY));
    live.current?.setAttribute("d", strokePath(pts.current));
  };
  const up = () => {
    if (pts.current && pts.current.length > 0) onStroke(pts.current);
    pts.current = null;
    live.current?.setAttribute("d", "");
  };
  if (!on && strokes.length === 0) return null;
  return (
    <svg className={`draw-layer no-export absolute inset-0 ${on ? "on" : ""}`} width="1920" height="1080" viewBox="0 0 1920 1080"
      style={{ zIndex: 65, pointerEvents: on ? "auto" : "none", touchAction: "none" }}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <g fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="7" style={{ stroke: "var(--color-mark)", filter: "drop-shadow(0 0 3px rgb(0 0 0 / 0.25))" }}>
        {strokes.map((s, i) => <path key={i} d={strokePath(s)} />)}
        <path ref={live} />
      </g>
      {on && (
        <text x="1800" y="70" textAnchor="end" className="mono" fontSize="20" style={{ fill: "var(--color-mark)" }}>
          DRAW · Backspace undo · C clear · Esc leave
        </text>
      )}
    </svg>
  );
}

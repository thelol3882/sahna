import type { Box, Fit, LFlow, LGraph, Region } from "./types";

/** Where a layout lands on the stage: scale to fit the region (never above `max`), centred. */
export function fit(l: { width: number; height: number }, r: Region, max = 1): Fit {
  const s = Math.min(max, r.w / l.width, r.h / l.height);
  return { s, x: r.x + (r.w - l.width * s) / 2, y: r.y + (r.h - l.height * s) / 2 };
}
export const toStage = (b: Box, f: Fit): Box => ({ x: f.x + b.x * f.s, y: f.y + b.y * f.s, w: b.w * f.s, h: b.h * f.s });
export const toLayout = (b: Box, f: Fit): Box => ({ x: (b.x - f.x) / f.s, y: (b.y - f.y) / f.s, w: b.w / f.s, h: b.h / f.s });

/** Orthogonal polyline → SVG path with rounded corners. */
export function roundPath(pts: number[][], r = 14) {
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1], [x, y] = pts[i], [nx, ny] = pts[i + 1];
    const a = Math.min(r, Math.hypot(x - px, y - py) / 2), b = Math.min(r, Math.hypot(nx - x, ny - y) / 2);
    const ux = Math.sign(x - px), uy = Math.sign(y - py), vx = Math.sign(nx - x), vy = Math.sign(ny - y);
    d += ` L${x - ux * a} ${y - uy * a} Q${x} ${y} ${x + vx * b} ${y + vy * b}`;
  }
  const [lx, ly] = pts[pts.length - 1];
  return `${d} L${lx} ${ly}`;
}

export const polyLength = (pts: number[][]) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);

/** Point at fraction t (0..1) along a polyline. */
export function pointAt(pts: number[][], t: number): [number, number] {
  const total = polyLength(pts);
  let left = total * t;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const seg = Math.hypot(bx - ax, by - ay);
    if (left <= seg || i === pts.length - 1) {
      const f = seg ? Math.min(1, left / seg) : 0;
      return [ax + (bx - ax) * f, ay + (by - ay) * f];
    }
    left -= seg;
  }
  return [pts[0][0], pts[0][1]];
}

/** Arrowhead triangle at the end of a polyline (pointing along the last segment). */
export function arrowHead(pts: number[][], atStart = false, size = 11) {
  const [a, b] = atStart ? [pts[1], pts[0]] : [pts[pts.length - 2], pts[pts.length - 1]];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
  const bx = b[0] - ux * size * 1.1, by = b[1] - uy * size * 1.1;
  const px = -uy * size * 0.62, py = ux * size * 0.62;
  return `M${b[0]} ${b[1]} L${bx + px} ${by + py} L${bx - px} ${by - py} Z`;
}

/** Hop duration from the edge length (seconds). */
export const hopDur = (pts: number[][], speed = 1) => Math.min(0.95, Math.max(0.38, polyLength(pts) / 820)) / speed;

/* ------------------------------------------------------------------ sequence view */

export type SeqGeo = {
  /** participants in order of first appearance, with the header box (layout coords) and the scale of the moved node */
  lanes: { id: string; cx: number; box: Box; scale: number }[];
  /** one row per hop, in time order */
  msgs: { i: number; y: number; x1: number; x2: number; label?: string; reply?: boolean; async?: boolean }[];
  top: number; bottom: number;
};

/**
 * The same journey as a sequence diagram, in the diagram's layout coordinates: the region (stage coords) is mapped
 * through the diagram's fit, so the node cards themselves can travel to the lane headers.
 */
export function sequenceGeometry(g: LGraph, flow: LFlow, region: Region, f: Fit): SeqGeo {
  const r = { x: (region.x - f.x) / f.s, y: (region.y - f.y) / f.s, w: region.w / f.s, h: region.h / f.s };
  const ids: string[] = [flow.start];
  for (const h of flow.hops) for (const id of [h.from, h.to]) if (!ids.includes(id)) ids.push(id);
  const slot = r.w / ids.length;
  const nodeBox = (id: string) => g.nodes.find((n) => n.id === id) ?? g.groups.find((x) => x.id === id)!;
  const headH = Math.max(...ids.map((id) => nodeBox(id).h));
  const lanes = ids.map((id, i) => {
    const b = nodeBox(id);
    const scale = Math.min(1, (slot - 28) / b.w, 96 / b.h);
    const w = b.w * scale, h = b.h * scale, cx = r.x + slot * (i + 0.5);
    return { id, cx, scale, box: { x: cx - w / 2, y: r.y + (headH * Math.min(1, scale) - h) / 2, w, h } };
  });
  const top = r.y + Math.max(...lanes.map((l) => l.box.y + l.box.h - r.y)) + 34;
  const bottom = r.y + r.h;
  const row = Math.min(66, (bottom - top - 20) / flow.hops.length);
  const lane = (id: string) => lanes.find((l) => l.id === id)!.cx;
  const msgs = flow.hops.map((h, i) => ({ i, y: top + row * (i + 0.75), x1: lane(h.from), x2: lane(h.to), label: h.label, reply: h.reply, async: h.async }));
  return { lanes, msgs, top: top - 18, bottom: msgs.length ? msgs[msgs.length - 1].y + row * 0.6 : bottom };
}

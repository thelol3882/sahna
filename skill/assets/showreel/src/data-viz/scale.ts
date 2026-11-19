/** Linear scale d0..d1 → r0..r1 (no clamping). */
export function linear([d0, d1]: [number, number], [r0, r1]: [number, number]) {
  const k = (r1 - r0) / (d1 - d0 || 1);
  const f = (v: number) => r0 + (v - d0) * k;
  f.invert = (r: number) => d0 + (r - r0) / k;
  return f;
}

/** Round ticks covering [lo, hi]: 1-2-5 steps, about `count` of them. */
export function niceTicks(lo: number, hi: number, count = 5): number[] {
  const span = hi - lo || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) ?? 10 * mag;
  const out: number[] = [];
  // last tick is the first one at or above hi, so the axis always covers the data
  for (let v = Math.floor(lo / step) * step; ; v += step) { out.push(Math.round(v / step) * step); if (v >= hi - step * 1e-9) break; }
  return out;
}

/** Upper domain end for bars: the next nice tick ≥ max. Bars always start at 0. */
export const niceMax = (max: number, count = 5) => { const t = niceTicks(0, max, count); return t[t.length - 1]; };

/** Deterministic pseudo-random (particles, jitter) so every seek and export renders the same frame. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

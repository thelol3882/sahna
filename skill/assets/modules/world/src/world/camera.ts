/**
 * Camera grammar: every move is a short list of keyframes (eye, yaw, pitch at a time 0…1), interpolated with
 * a non-uniform Hermite spline and played by ONE GSAP tween over a progress value with an ease.
 * The duration starts from the move's base length and grows until the peak turn rate is under the comfort
 * limit (deg/s). No roll, ever.
 */
import { gsap } from "../gsap";
import { add, angDiff, angleBetween, clamp, forward, len, lerp, rotate, scale, sub, type Pose, type Vec3 } from "./math";
import type { Rect } from "./layout";

/** stop: zero velocity at this key (a hold) */
export type Key = { t: number; eye: Vec3; yaw: number; pitch: number; stop?: boolean };

export type Comfort = {
  /** peak turn rate, deg/s */
  maxTurn: number;
  /** pull-back and pitch sway multiplier */
  sway: number;
  /** a move longer than this becomes a fade (comfort mode) or is capped (normal) */
  maxDuration: number;
  /** comfort mode: moves that need more than maxDuration fade instead */
  fadeIfLong: boolean;
};
export const NORMAL: Comfort = { maxTurn: 90, sway: 1, maxDuration: 2.0, fadeIfLong: false };
export const COMFORT: Comfort = { maxTurn: 45, sway: 0.45, maxDuration: 2.2, fadeIfLong: true };

/* ------------------------------------------------------------------ spline */

function hermite(p0: number, p1: number, m0: number, m1: number, u: number) {
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * m1;
}

/** Pose at progress t (0…1) along the keys. Yaw is unwrapped so it always turns the short way. */
export function sample(keys: Key[], t: number): Pose {
  const n = keys.length;
  if (t <= keys[0].t) return poseOf(keys[0]);
  if (t >= keys[n - 1].t) return poseOf(keys[n - 1]);
  let i = 0;
  while (i < n - 2 && t > keys[i + 1].t) i++;
  const a = keys[i], b = keys[i + 1];
  const h = b.t - a.t, u = h > 0 ? (t - a.t) / h : 1;
  // channel values: x, y, z, yaw, pitch
  const val = (k: Key, c: number) => (c < 3 ? k.eye[c] : c === 3 ? k.yaw : k.pitch);
  const tangent = (j: number, c: number) => {
    if (keys[j].stop) return 0;
    const p = keys[Math.max(0, j - 1)], q = keys[Math.min(n - 1, j + 1)];
    const dt = q.t - p.t;
    return dt > 0 ? ((val(q, c) - val(p, c)) / dt) * h : 0;
  };
  const out = [0, 0, 0, 0, 0];
  for (let c = 0; c < 5; c++) out[c] = hermite(val(a, c), val(b, c), tangent(i, c), tangent(i + 1, c), u);
  return { eye: [out[0], out[1], out[2]], yaw: out[3], pitch: out[4] };
}
const poseOf = (k: Key): Pose => ({ eye: [...k.eye] as Vec3, yaw: k.yaw, pitch: k.pitch });

/** make consecutive yaws differ by less than 180° */
function unwrap(keys: Key[]) {
  for (let i = 1; i < keys.length; i++) keys[i].yaw = keys[i - 1].yaw + angDiff(keys[i - 1].yaw, keys[i].yaw);
  return keys;
}
const key = (t: number, p: Pose): Key => ({ t, eye: [...p.eye] as Vec3, yaw: p.yaw, pitch: p.pitch });

/* ------------------------------------------------------------------ moves */

export type MovePlan = { keys: Key[]; base: number; ease: string; entranceAt: number; name: string };

/** Straight move with a pull-back in the middle (wider view on long moves) and an optional pitch sway. */
export function dolly(cur: Pose, to: Pose, o: { sway: number; flat?: boolean; pitchSway?: number; name?: string; quick?: boolean }): MovePlan {
  const d = sub(to.eye, cur.eye);
  const dist = len(d);
  const f = forward(lerp(cur.yaw, cur.yaw + angDiff(cur.yaw, to.yaw), 0.5), (cur.pitch + to.pitch) / 2);
  const back = (o.flat ? clamp(dist * 0.32, 300, 2600) : clamp(dist * 0.16, 0, 1500)) * o.sway;
  const midEye = add(add(cur.eye, scale(d, 0.5)), scale(f, -back));
  let midYaw = lerp(cur.yaw, cur.yaw + angDiff(cur.yaw, to.yaw), 0.5);
  let midPitch = (cur.pitch + to.pitch) / 2 + (o.pitchSway ?? 0) * o.sway;
  if (o.flat && dist > 1) {
    // 2.5D: lean 2–3° toward the direction of travel (slight perspective), level again on arrival
    midYaw += clamp(-d[0] / dist, -1, 1) * 2.5 * o.sway;
    midPitch += clamp(d[1] / dist, -1, 1) * 2 * o.sway;
  }
  const keys = unwrap([key(0, cur), { t: 0.5, eye: midEye, yaw: midYaw, pitch: midPitch }, key(1, to)]);
  const base = o.quick ? clamp(0.6 + dist / 20000, 0.7, 0.9) : clamp(1.0 + dist / 14000, 1.1, 1.6);
  return { keys, base, ease: "power2.inOut", entranceAt: 0.62, name: o.name ?? "dolly" };
}

/** Orbit around a centre: the eye travels on the circle (radius swells a little mid-way), yaw follows. */
export function orbit(cur: Pose, to: Pose, center: Vec3, o: { sway: number; quick?: boolean }): MovePlan {
  const polar = (e: Vec3) => ({ th: (Math.atan2(e[0] - center[0], e[2] - center[2]) * 180) / Math.PI, r: Math.hypot(e[0] - center[0], e[2] - center[2]), y: e[1] });
  const a = polar(cur.eye), b = polar(to.eye);
  const dth = angDiff(a.th, b.th), dyaw = angDiff(cur.yaw, to.yaw);
  const keys: Key[] = [];
  const N = 8;
  for (let i = 0; i <= N; i++) {
    const s = i / N, bump = Math.sin(Math.PI * s);
    const th = a.th + dth * s, r = lerp(a.r, b.r, s) + 520 * o.sway * bump;
    const eye: Vec3 = add(center, rotate(th, 0, [0, 0, r]));
    eye[1] = lerp(a.y, b.y, s);
    keys.push({ t: s, eye, yaw: cur.yaw + dyaw * s, pitch: lerp(cur.pitch, to.pitch, s) });
  }
  return { keys, base: o.quick ? 0.85 : clamp(1.1 + Math.abs(dth) / 120, 1.2, 1.6), ease: "power2.inOut", entranceAt: 0.6, name: "orbit" };
}

/**
 * Through a window of panel A into the room behind it: frame the window, pass its plane at the centre,
 * then (for a room on a lower level) dip the view and drop to the room's panel.
 */
export function through(cur: Pose, to: Pose, a: { pos: Vec3; yaw: number; pitch: number }, win: Rect, drop: number, P: number, o: { sway: number }): MovePlan {
  const [x, y, w, h] = win;
  const wc = add(a.pos, rotate(a.yaw, a.pitch, [x + w / 2 - 960, y + h / 2 - 540, 0]));
  const n = rotate(a.yaw, a.pitch, [0, 0, 1]);
  const frame = Math.max((w * P) / 1500, (h * P) / 900); // window fills ~80 % of the screen
  const dip = drop > 0 ? 9 : drop < 0 ? -9 : 0;
  const keys = unwrap([
    key(0, cur),
    { t: 0.42, eye: add(wc, scale(n, frame)), yaw: a.yaw, pitch: a.pitch },
    { t: 0.64, eye: add(add(wc, scale(n, -360)), [0, drop * 0.18, 0]), yaw: a.yaw, pitch: a.pitch + dip * o.sway },
    key(1, to),
  ]);
  return { keys, base: 1.6, ease: "power1.inOut", entranceAt: 0.55, name: "window" };
}

/** Out to a pose (overview), hold, then into the target. Two moves in one: use once per talk. */
export function survey(cur: Pose, over: Pose, to: Pose): MovePlan {
  const keys = unwrap([key(0, cur), { ...key(0.42, over), stop: true }, { ...key(0.56, over), stop: true }, key(1, to)]);
  return { keys, base: 2.9, ease: "power1.inOut", entranceAt: 0.8, name: "survey" };
}

/** Reverse a plan (← goes back along the same path, quicker). */
export function reverse(p: MovePlan, quick: number): MovePlan {
  const keys = unwrap(p.keys.map((k) => ({ ...k, t: 1 - k.t, eye: [...k.eye] as Vec3 })).reverse());
  return { ...p, keys, base: Math.min(p.base, quick), name: `${p.name}-back` };
}

/** Peak turn rate of a plan at duration 1 s (deg per unit time), sampled through its ease. */
export function peakTurn(p: MovePlan, steps = 120) {
  const ease = gsap.parseEase(p.ease);
  let prev = sample(p.keys, ease(0)), peak = 0;
  for (let i = 1; i <= steps; i++) {
    const cur = sample(p.keys, ease(i / steps));
    peak = Math.max(peak, angleBetween(prev, cur) * steps);
    prev = cur;
  }
  return peak;
}

/** Duration that respects the turn limit; null = too long for comfort mode (fade instead). */
export function duration(p: MovePlan, c: Comfort, mult = 1): number | null {
  const need = peakTurn(p) / c.maxTurn;
  const d = Math.max(p.base * mult, need);
  if (d > Math.max(c.maxDuration, p.base * mult)) return c.fadeIfLong ? null : Math.max(c.maxDuration, p.base * mult);
  return d;
}

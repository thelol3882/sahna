/**
 * Camera math shared by the CSS panels and the three.js depth layer.
 *
 * World space = CSS space of the stage: x right, y DOWN, z toward the viewer, units = stage px,
 * origin = stage centre (every panel and the perspective use a centre origin).
 * Matrices are column-major Float64Array(16) (same layout as CSS matrix3d() and WebGL).
 *
 * Camera: eye (x, y, z) + yaw (deg, about +y) + pitch (deg, about +x; positive = looks DOWN). No roll.
 *   R = Ry(yaw) · Rx(pitch); forward = R · (0, 0, -1).
 * CSS view of a panel with world matrix T:  Persp(P) · Tz(P) · Rᵀ · T(-eye) · T
 *   — with eye = panel.pos + R·(0,0,P) and the panel's rotation, this is the identity: frontal at scale 1.
 * three.js: camera.matrixWorldInverse = S · Rᵀ · T(-eye) · S with S = diag(1,-1,1) (y up),
 *   PerspectiveCamera fov (vertical) = 2·atan(540 / P), aspect 16/9: the same projection as CSS perspective(P).
 */
export type Vec3 = [number, number, number];
export type Mat4 = Float64Array;
export type Pose = { eye: Vec3; yaw: number; pitch: number };

const D2R = Math.PI / 180;

export const ident = (): Mat4 => { const m = new Float64Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; };

export function mul(a: Mat4, b: Mat4): Mat4 {
  const o = new Float64Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return o;
}

export function translate(x: number, y: number, z: number): Mat4 { const m = ident(); m[12] = x; m[13] = y; m[14] = z; return m; }

export function rotY(deg: number): Mat4 {
  const c = Math.cos(deg * D2R), s = Math.sin(deg * D2R), m = ident();
  m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m;
}
export function rotX(deg: number): Mat4 {
  const c = Math.cos(deg * D2R), s = Math.sin(deg * D2R), m = ident();
  m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m;
}
export const rot = (yaw: number, pitch: number) => mul(rotY(yaw), rotX(pitch));
export function transpose3(m: Mat4): Mat4 {
  const o = ident();
  for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) o[c * 4 + r] = m[r * 4 + c];
  return o;
}
export function perspective(P: number): Mat4 { const m = ident(); m[11] = -1 / P; return m; }

export function apply(m: Mat4, v: Vec3): [number, number, number, number] {
  const [x, y, z] = v;
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
    m[3] * x + m[7] * y + m[11] * z + m[15],
  ];
}
export const rotate = (yaw: number, pitch: number, v: Vec3): Vec3 => { const r = apply(rot(yaw, pitch), v); return [r[0], r[1], r[2]]; };

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const smooth = (a: number, b: number, t: number) => { const x = clamp((t - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
/** shortest signed difference b − a in degrees, in (−180, 180] */
export const angDiff = (a: number, b: number) => { let d = (b - a) % 360; if (d > 180) d -= 360; if (d <= -180) d += 360; return d; };

export const forward = (yaw: number, pitch: number): Vec3 => rotate(yaw, pitch, [0, 0, -1]);

/** World → camera space with the eye at the origin (no perspective). */
export function viewNoP(p: Pose): Mat4 {
  return mul(transpose3(rot(p.yaw, p.pitch)), translate(-p.eye[0], -p.eye[1], -p.eye[2]));
}
/** World → CSS view space: the screen plane is z = 0 and the eye sits at z = P. */
export function viewCss(p: Pose, P: number): Mat4 { return mul(translate(0, 0, P), viewNoP(p)); }

/** A panel's world matrix (centre origin). */
export const panelMatrix = (pos: Vec3, yaw: number, pitch: number) => mul(translate(pos[0], pos[1], pos[2]), rot(yaw, pitch));

/** The camera pose that sees a panel frontal at scale 1. */
export function restPose(pos: Vec3, yaw: number, pitch: number, P: number): Pose {
  return { eye: add(pos, rotate(yaw, pitch, [0, 0, P])), yaw, pitch };
}

export function css(m: Mat4): string {
  let s = "matrix3d(";
  for (let i = 0; i < 16; i++) s += (i ? "," : "") + (Math.abs(m[i]) < 1e-10 ? 0 : +m[i].toFixed(8));
  return s + ")";
}

/** Angle between two view directions (deg). */
export function angleBetween(a: Pose, b: Pose) {
  const f1 = forward(a.yaw, a.pitch), f2 = forward(b.yaw, b.pitch);
  const d = clamp(f1[0] * f2[0] + f1[1] * f2[1] + f1[2] * f2[2], -1, 1);
  return Math.acos(d) / D2R;
}

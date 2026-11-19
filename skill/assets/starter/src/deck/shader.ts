import { gsap } from "../gsap";
import { SCENE_PROPS, type ShaderKind, type TransitionHooks, type TransitionKind } from "./transitions";

/**
 * WebGL transitions (showcase only). No DOM snapshot: one full-stage canvas ABOVE the scenes renders a procedural
 * cover (progress 0 → 1), the scenes swap under it, then the cover leaves (1 → 2). Raw WebGL 1, ~5 kB of code.
 * Programs compile once (initShaders at deck start); the canvas draws only while a transition plays.
 * Colours come from the theme tokens at the moment the transition starts. If WebGL or a program fails,
 * shaderReady() is false and the director plays SHADER_FALLBACK[kind] instead.
 */
export const SHADER_KINDS: ShaderKind[] = ["liquid", "waves", "dissolve", "sweep"];
/** nearest DOM overlay for each shader kind (dial degradation and WebGL failure) */
export const SHADER_FALLBACK: Record<ShaderKind, TransitionKind> = { liquid: "wipe", waves: "curtain", dissolve: "pixels", sweep: "wipe" };
export const isShader = (k: string): k is ShaderKind => (SHADER_KINDS as string[]).includes(k);

/** canvas resolution relative to the on-screen stage, tried in this order by the load-time benchmark */
const RES_STEPS = [0.75, 0.5, 0.35];
/** a frame of the slowest program must render within this (ms, measured at load) or the next step is tried */
const BUDGET_MS = 6;

const VERT = `attribute vec2 a_pos; varying vec2 v_uv;
void main(){ v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const HEAD = `precision highp float;
uniform vec2 u_res; uniform float u_p; uniform float u_t; uniform float u_seed;
uniform vec3 u_hero; uniform vec3 u_pri; uniform vec3 u_acc;
varying vec2 v_uv;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return v; }  // 0..0.875
const float AR = 1.7777778;
`;

// Liquid: two noise-edged layers cross the stage diagonally, primary first and the hero colour a beat behind
// (correlated noise, so the primary band keeps an even width). The leading edges cover, the trailing edges
// reveal. A thin light line on the primary edge, an accent line on the hero edge, faint light ahead of it.
const LIQUID = HEAD + `
void main(){
  vec2 uv = v_uv; vec2 q = vec2(uv.x * AR, uv.y);
  float s = (uv.x + (1.0 - uv.y) * 0.42) / 1.42;
  float n1 = fbm(q * 2.1 + vec2(u_t * 0.35, -u_t * 0.22) + u_seed) - 0.44;
  float n2 = fbm(q * 2.7 + vec2(-u_t * 0.3, u_t * 0.25) + u_seed + 11.0) - 0.44;
  float d1 = s + n1 * 0.2;
  float d2 = s + (n1 * 0.75 + n2 * 0.25) * 0.2;
  const float GAP = 0.075;
  float lead = mix(-0.26, 1.26, clamp(u_p, 0.0, 1.0));
  float trail = mix(-0.26, 1.26, clamp(u_p - 1.0, 0.0, 1.0));
  float e = 1.2 / u_res.y;
  float a1 = (1.0 - smoothstep(lead - e, lead + e, d1)) * smoothstep(trail - e, trail + e, d1);
  float l2 = lead - GAP, t2 = trail + GAP;
  float a2 = a1 * (1.0 - smoothstep(l2 - e, l2 + e, d2)) * smoothstep(t2 - e, t2 + e, d2);
  float ed1 = u_p < 1.0 ? lead - d1 : d1 - trail;
  float ed2 = u_p < 1.0 ? l2 - d2 : d2 - t2;
  vec3 c1 = u_pri * (0.9 + 0.2 * noise(q * 3.5 + u_t * 0.2));
  vec3 c2 = u_hero * (0.9 + 0.2 * noise(q * 3.0 - u_t * 0.15 + 4.0));
  vec3 col = mix(c1, c2, a2 / max(a1, 1e-4));
  col += vec3(1.0) * exp(-abs(ed1) * 320.0) * 0.6 + u_acc * exp(-abs(ed2) * 320.0) * 0.9 * a2;
  float ahead = (1.0 - a1) * exp(-abs(ed1) * 45.0) * (u_p < 1.0 ? 0.16 : 0.06);   // light spilling onto the scene, additive
  gl_FragColor = vec4(col * a1 + u_pri * ahead, a1);
}`;

// Waves: three brand-colour bands (accent, primary, hero) rise with layered sine + noise crests and cover;
// then their lower edges rise in reverse order, so the new scene is revealed under thinning colour.
const WAVES = HEAD + `
// crests: three sines + one value-noise octave (cheap: 6 crests per pixel)
float crest(float x, float i){ return 0.045 * sin(x * 3.1 + u_t * 2.2 + i * 1.7) + 0.025 * sin(x * 7.3 - u_t * 3.1 + i)
  + 0.012 * sin(x * 13.0 + u_t * 4.0 + i * 2.3) + 0.08 * (noise(vec2(x * 1.6 + i * 5.0, u_t * 0.5 + i * 3.0)) - 0.5); }
void main(){
  float x = v_uv.x * AR, y = v_uv.y;
  float e = 1.2 / u_res.y;
  vec3 cols[3]; cols[0] = u_acc; cols[1] = u_pri; cols[2] = u_hero;
  vec4 acc = vec4(0.0);
  for (int k = 0; k < 3; k++) {
    float i = float(k);
    float pc = clamp((u_p - i * 0.13) / 0.74, 0.0, 1.0);
    float pr = clamp((u_p - 1.0 - (2.0 - i) * 0.13) / 0.74, 0.0, 1.0);
    float top = mix(-0.4, 1.35, pc) + crest(x, i);
    float bot = mix(-0.4, 1.35, pr) + crest(x + 2.0, i + 7.0);
    float a = (1.0 - smoothstep(top - e, top + e, y)) * smoothstep(bot - e, bot + e, y);
    float lip = exp(-abs(top - y) * 120.0) * (1.0 - pr) + exp(-abs(y - bot) * 120.0) * pr;
    vec3 c = cols[k] * (0.92 + 0.12 * (y - bot)) + vec3(1.0) * lip * 0.22;
    acc = vec4(c * a, a) + acc * (1.0 - a);   // band k over the bands below it
  }
  gl_FragColor = acc;
}`;

// Dissolve: a grid of rounded cells grows in the order of a noise field (clusters, not random salt),
// fresh cells glow, a few are accent; the reveal shrinks them along a second field.
const DISSOLVE = HEAD + `
float box(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
void main(){
  const float N = 24.0;                       // rows
  vec2 g = vec2(v_uv.x * AR, v_uv.y) * N;
  vec2 cell = floor(g); vec2 f = fract(g) - 0.5;
  float th1 = clamp((fbm(cell * 0.085 + u_seed) - 0.18) / 0.6, 0.0, 1.0);
  float th2 = clamp((fbm(cell * 0.085 + u_seed + 31.7) - 0.18) / 0.6, 0.0, 1.0);
  float lp = clamp((u_p - th1 * 0.68) / 0.32, 0.0, 1.0);
  float lr = clamp((u_p - 1.0 - th2 * 0.68) / 0.32, 0.0, 1.0);
  float size = u_p <= 1.0 ? lp : 1.0 - lr;
  float fresh = u_p <= 1.0 ? 1.0 - lp : lr;
  float h = 0.52 * size;
  float sd = box(f, vec2(h), 0.5 * h * (1.0 - size) + 0.04);
  float e = N * 1.2 / u_res.y;
  float a = (1.0 - smoothstep(-e, e, sd)) * step(0.001, size);
  vec3 col = mix(u_pri, u_hero, 0.3 * noise(cell * 0.2 + 9.0));
  if (hash(cell + u_seed) > 0.975) col = u_acc;
  col = mix(col, vec3(1.0), fresh * 0.35);
  gl_FragColor = vec4(col * a, a);
}`;

// Sweep: a straight, slightly tilted cover with a chromatic light edge (R, G, B edges offset) and bloom ahead of it.
const SWEEP = HEAD + `
void main(){
  vec2 uv = v_uv;
  float s = (uv.x + (uv.y - 0.5) * 0.18) ;
  float lead = mix(-0.2, 1.22, clamp(u_p, 0.0, 1.0));
  float trail = mix(-0.2, 1.22, clamp(u_p - 1.0, 0.0, 1.0));
  float e = 1.0 / u_res.x;
  float cov = (1.0 - smoothstep(lead - e, lead + e, s)) * smoothstep(trail - e, trail + e, s);
  float edge = u_p < 1.0 ? lead : trail;
  vec3 off = vec3(-0.006, 0.0, 0.006) * (u_p < 1.0 ? 1.0 : -1.0);
  vec3 light = vec3(exp(-abs(s - edge + off.r) * 160.0), exp(-abs(s - edge + off.g) * 160.0), exp(-abs(s - edge + off.b) * 160.0));
  float bloom = exp(-abs(s - edge) * 22.0);
  vec3 col = u_hero * (0.9 + 0.2 * smoothstep(0.3, 0.0, abs(s - edge)));
  col += (light * 0.9 + u_acc * bloom * 0.35);
  float ahead = (1.0 - cov);
  gl_FragColor = vec4(col * cov + (light * 0.55 + u_acc * bloom * 0.18) * ahead, cov);
}`;

const FRAG: Record<ShaderKind, string> = { liquid: LIQUID, waves: WAVES, dissolve: DISSOLVE, sweep: SWEEP };

type Prog = { p: WebGLProgram; u: Record<string, WebGLUniformLocation | null> };
const G: { gl: WebGLRenderingContext | null; canvas: HTMLCanvasElement | null; progs: Partial<Record<ShaderKind, Prog>>; lost: boolean;
  res: number; slow: boolean; bench: Record<string, number> } =
  { gl: null, canvas: null, progs: {}, lost: false, res: RES_STEPS[0], slow: false, bench: {} };
/** `?gl=force` keeps the shaders even when the benchmark finds the GPU too slow (filming in headless Chromium) */
const FORCE = typeof location !== "undefined" && new URLSearchParams(location.search).get("gl") === "force";
/** `?gl=off` plays the overlay fallbacks (test the no-WebGL path) */
const OFF = typeof location !== "undefined" && new URLSearchParams(location.search).get("gl") === "off";

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { console.warn("shader:", gl.getShaderInfoLog(sh)); gl.deleteShader(sh); return null; }
  return sh;
}

/** Create the context and compile every program once. Safe to call again (no-op). Returns false without WebGL. */
export function initShaders(canvas: HTMLCanvasElement, scale = 1): boolean {
  if (OFF) return false;
  if (G.canvas === canvas && G.gl) return !G.lost;
  G.canvas = canvas;
  let gl: WebGLRenderingContext | null = null;
  try {
    gl = canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: "high-performance" });
  } catch { gl = null; }
  if (!gl) return false;
  G.gl = gl;
  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); G.lost = true; });
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW); // one big triangle
  if (!vs) return false;
  for (const k of SHADER_KINDS) {
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG[k]);
    if (!fs) continue;
    const p = gl.createProgram()!;
    gl.attachShader(p, vs); gl.attachShader(p, fs);
    gl.bindAttribLocation(p, 0, "a_pos");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.warn("shader link:", gl.getProgramInfoLog(p)); continue; }
    const u: Prog["u"] = {};
    for (const n of ["u_res", "u_p", "u_t", "u_seed", "u_hero", "u_pri", "u_acc"]) u[n] = gl.getUniformLocation(p, n);
    G.progs[k] = { p, u };
  }
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  bench(scale);
  return Object.keys(G.progs).length > 0 && !G.slow;
}

/** Pixel size of the canvas for a resolution step at the current stage scale. */
const sizeFor = (res: number, scale: number) => {
  const k = Math.min(1, Math.max(0.5, scale * (window.devicePixelRatio || 1))) * res;
  return [Math.round(1920 * k), Math.round(1080 * k)];
};

/** Load-time budget check: warm every program (drivers compile lazily), then time one mid-transition frame per
    program (a 1-pixel readPixels waits for the GPU); take the first resolution step where the slowest fits BUDGET_MS. None fits →
    shaders off (the director plays the overlay fallbacks), unless ?gl=force. */
function bench(scale: number) {
  const gl = G.gl!, c = G.canvas!;
  const kinds = SHADER_KINDS.filter((k) => G.progs[k]);
  const one = (k: ShaderKind) => {
    const pr = G.progs[k]!;
    gl.useProgram(pr.p);
    gl.uniform2f(pr.u.u_res, c.width, c.height);
    gl.uniform1f(pr.u.u_p, 0.6); gl.uniform1f(pr.u.u_t, 0.5); gl.uniform1f(pr.u.u_seed, 1);
    for (const n of ["u_hero", "u_pri", "u_acc"]) gl.uniform3f(pr.u[n], 0.2, 0.3, 0.8);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  const px = new Uint8Array(4);
  const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); // gl.finish() does not block in Chrome
  c.width = 64; c.height = 36; gl.viewport(0, 0, 64, 36);
  kinds.forEach(one); sync();
  for (const res of RES_STEPS) {
    [c.width, c.height] = sizeFor(res, scale);
    gl.viewport(0, 0, c.width, c.height);
    let worst = 0;
    for (const k of kinds) {
      const t = performance.now();
      one(k); sync();
      G.bench[`${k}@${res}`] = Math.round((performance.now() - t) * 10) / 10;
      worst = Math.max(worst, performance.now() - t);
    }
    G.res = res;
    if (worst <= BUDGET_MS) { G.slow = false; break; }
    G.slow = !FORCE;
  }
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  c.width = 16; c.height = 9;
}

export const shaderReady = (k: ShaderKind) => !!G.gl && !G.lost && !G.slow && !!G.progs[k];
/** for scripts and the dev console: chosen resolution, per-program frame cost at each step, and whether it is on */
export const shaderInfo = () => ({ ready: !!G.gl && !G.lost && !G.slow, res: G.res, force: FORCE, bench: { ...G.bench } });

/** any CSS colour (hex, rgb, oklch, var() resolved by the caller) → linear-ish [0..1] RGB via a 1×1 2D canvas */
const probe = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d", { willReadFrequently: true }) : null;
function rgb(css: string): [number, number, number] {
  if (!probe) return [0, 0, 0];
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = "#000";
  probe.fillStyle = css;
  probe.fillRect(0, 0, 1, 1);
  const d = probe.getImageData(0, 0, 1, 1).data;
  return [d[0] / 255, d[1] / 255, d[2] / 255];
}
function tokens(el: Element) {
  const cs = getComputedStyle(el);
  const v = (n: string) => rgb(cs.getPropertyValue(n).trim());
  return { hero: v("--color-hero"), pri: v("--color-primary"), acc: v("--color-accent") };
}

let seed = 0;
/** Cover → swap → reveal. `scale` = current stage scale (canvas resolution follows the real pixels). */
export function playShader(canvas: HTMLCanvasElement, kind: ShaderKind, a: HTMLElement, b: HTMLElement, hooks: TransitionHooks, scale: number) {
  const gl = G.gl!, prog = G.progs[kind]!;
  [canvas.width, canvas.height] = sizeFor(G.res, scale);
  gl.viewport(0, 0, canvas.width, canvas.height);
  const c = tokens(canvas);
  const sd = (seed = (seed + 1) % 7) * 3.17;
  const t0 = performance.now();
  const st = { p: 0 };
  const draw = () => {
    if (G.lost) return;
    gl.useProgram(prog.p);
    gl.uniform2f(prog.u.u_res, canvas.width, canvas.height);
    gl.uniform1f(prog.u.u_p, st.p);
    gl.uniform1f(prog.u.u_t, (performance.now() - t0) / 1000);
    gl.uniform1f(prog.u.u_seed, sd);
    gl.uniform3fv(prog.u.u_hero, c.hero);
    gl.uniform3fv(prog.u.u_pri, c.pri);
    gl.uniform3fv(prog.u.u_acc, c.acc);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  const end = () => {
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gsap.set(canvas, { autoAlpha: 0 });
  };
  const tl = gsap.timeline({
    onComplete: () => {
      end();
      gsap.set(a, { autoAlpha: 0, clearProps: SCENE_PROPS });
      gsap.set(b, { clearProps: SCENE_PROPS });
      gsap.set(b, { autoAlpha: 1 });
      hooks.done();
    },
    onInterrupt: end,
  });
  draw();
  // wipes accelerate in and decelerate out, so the cover passes through the swap at speed (one continuous move);
  // the dissolve breathes in and out
  const pass = kind !== "dissolve";
  const cover = pass ? 0.66 : 0.8;
  tl.set(canvas, { autoAlpha: 1 }, 0)
    .to(st, { p: 1, duration: cover, ease: pass ? "power2.in" : "power2.inOut", onUpdate: draw }, 0)
    .call(() => { gsap.set(a, { autoAlpha: 0 }); gsap.set(b, { autoAlpha: 1 }); hooks.swap(); }, [], cover)
    .to(st, { p: 2, duration: pass ? 0.8 : 0.85, ease: pass ? "power2.out" : "power2.inOut", onUpdate: draw }, cover + 0.02)
    .call(hooks.start, [], cover + 0.12);
  return tl;
}

/** for __deck.show / kill: hide the canvas */
export function resetShader(canvas: HTMLCanvasElement | null) {
  if (!canvas) return;
  if (G.gl && !G.lost) { G.gl.clearColor(0, 0, 0, 0); G.gl.clear(G.gl.COLOR_BUFFER_BIT); }
  gsap.set(canvas, { autoAlpha: 0 });
}

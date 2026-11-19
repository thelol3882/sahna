/**
 * Spatial world: scenes are DOM panels placed in one 3D space (CSS 3D, crisp selectable text); a camera rig
 * (eye + yaw + pitch, no roll) flies between panels with GSAP. It replaces only the scene-change transition
 * (strategy C in 3D): every scene keeps its own paused step timeline, labels and export.
 *
 *   main.tsx:   installWorld(WORLD)            (before mounting; WORLD from src/scenes/world.ts)
 *
 * Dial: academic → off (the engine's normal transitions); balanced → 2.5D (panels on one plane, pan/zoom with a
 * slight lean); showcase → full 3D + WebGL depth layer. `?world=off|flat|full` overrides (testing),
 * `?comfort` forces comfort mode.
 *
 * At rest the active panel has NO transform (pixel-identical to the flat scene) and every other panel is hidden;
 * the 3D transforms, the depth layer and the render loop exist only while the camera moves or the overview is open.
 */
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { gsap, reducedMotion } from "../gsap";
import { scenes } from "../scenes";
import { style, allow } from "../fx/dial";
import { setSceneHost, type HostApi, type HostHooks, type SceneHost } from "../deck/host";
import { MAIN, pad } from "../deck/util";
import { digit, isNext, isPrev } from "../deck/keys";
import { angleBetween, apply, clamp, css, lerp, mul, panelMatrix, perspective, restPose, smooth, viewCss, type Mat4, type Pose, type Vec3, rotate, add, rot, transpose3 } from "./math";
import { COMFORT, NORMAL, dolly, duration, orbit, peakTurn, reverse, sample, survey, through, type Comfort, type MovePlan } from "./camera";
import { autoFlat, type MoveKind, type Placement, type Rect, type WorldDef } from "./layout";
import { DepthLayer, webglAvailable } from "./depth";
import "./world.css";

const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len3 = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);

export type WorldMode = "off" | "flat" | "full";

type Rec = {
  id: string;
  index: number;
  pos: Vec3; yaw: number; pitch: number;
  M: Mat4;
  rest: Pose;
  group?: string;
  room?: Placement["room"];
  wrap?: HTMLElement;
};

type Flight = { name: string; duration: number; planned: number; peakTurn: number; frames: number[] };

const CORNERS: Vec3[] = [[-960, -540, 0], [960, -540, 0], [960, 540, 0], [-960, 540, 0]];
const RADIUS = 28;

function pickMode(): WorldMode {
  const q = new URLSearchParams(location.search).get("world");
  if (q === "off" || q === "flat" || q === "full") return q;
  return style === "academic" ? "off" : style === "balanced" ? "flat" : "full";
}

export class World implements SceneHost {
  readonly P = 1500;
  readonly near = 300;
  readonly mode: WorldMode;
  readonly comfort: Comfort;
  readonly panels = new Map<string, Rec>();
  cam: Pose = { eye: [0, 0, 1500], yaw: 0, pitch: 0 };
  settled: string | null = null;
  private prev: string | null = null;
  private hero = new Set<string>();
  private land = { from: "", to: "", t: 1 };
  private mask: { id: string; rect: Rect; open: (t: number) => number } | null = null;
  private mix = { ov: 0, lift: 0 };
  private flight: gsap.core.Timeline | null = null;
  private flightName = "";
  overviewOn = false;
  private overviewPose: Pose = { eye: [0, 0, 1500], yaw: 0, pitch: 0 };
  private root?: HTMLElement;
  private canvas?: HTMLCanvasElement;
  private hud?: HTMLElement;
  private backdrop?: HTMLElement;
  private depth: DepthLayer | null = null;
  private live = false;
  private tick = 0;
  private api?: HostApi;
  private lastFrame = 0;
  private lastCam: Pose | null = null;
  readonly stats: Flight[] = [];
  private cur?: Flight;

  constructor(readonly def: WorldDef) {
    this.mode = pickMode();
    const forced = new URLSearchParams(location.search).has("comfort");
    this.comfort = forced || def.comfort ? COMFORT : NORMAL;
    const order = scenes.map((s) => s.id);
    const flat = this.mode === "flat" ? { ...autoFlat(order.filter((id) => def.panels[id]), def), ...(def.flat ?? {}) } : null;
    scenes.forEach((s, i) => {
      const p = def.panels[s.id];
      if (!p || s.appendix) return;
      let pos = p.pos, yaw = p.yaw ?? 0, pitch = p.pitch ?? 0;
      if (flat) { const f = flat[s.id] ?? [0, 0]; pos = [f[0], f[1], 0]; yaw = 0; pitch = 0; }
      this.panels.set(s.id, { id: s.id, index: i, pos, yaw, pitch, M: panelMatrix(pos, yaw, pitch), rest: restPose(pos, yaw, pitch, this.P), group: flat ? undefined : p.group, room: flat ? undefined : p.room });
    });
    this.overviewPose = this.fitOverview();
    (window as unknown as { __world: World }).__world = this;
  }

  /* ---------------------------------------------------------------- SceneHost */

  enabled = () => this.mode !== "off" && this.panels.size > 0;

  attach = (api: HostApi) => { this.api = api; };

  Wrap = ({ children }: { children: ReactNode }) => {
    const ref = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => { this.mount(ref.current!); return () => this.unmount(); }, []);
    const labels = MAIN.map((i) => scenes[i]).filter((s) => this.panels.has(s.id));
    return (
      <div ref={ref} className={`world world-${this.mode}`}>
        <div className="world-backdrop" />
        {this.mode === "full" && <canvas className="world-canvas" width={1920} height={1080} />}
        <div className="world-panels">{children}</div>
        <div className="world-hud no-print" aria-hidden>
          <svg className="hud-leaders" width={1920} height={1080}>
            {labels.map((s) => <line key={s.id} data-leader={s.id} />)}
          </svg>
          {labels.map((s) => (
            <button key={s.id} className="hud-label" data-hud={s.id} onClick={() => this.pick(s.id)}>
              <span className="hud-n">{pad(MAIN.indexOf(this.panels.get(s.id)!.index) + 1)}</span>
              <span className="hud-t">{s.title}</span>
            </button>
          ))}
          <div className="hud-hint">O · Esc back · 1–9 fly to a scene</div>
        </div>
      </div>
    );
  };

  Panel = ({ id, children }: { id: string; children: ReactNode }) => {
    const rec = this.panels.get(id);
    return (
      <div className={`wpanel ${rec ? "placed" : "unplaced"}`} data-wpanel={id} ref={(el) => { if (rec) rec.wrap = el ?? undefined; }}>
        {children}
      </div>
    );
  };

  intro = (id: string, hooks: HostHooks) => {
    const rec = this.panels.get(id);
    if (!rec) return null;
    const o = this.def.intro ?? {};
    const dist = o.distance ?? 9000, rise = o.rise ?? 1400;
    const n = rotate(rec.yaw, rec.pitch, [0, 0, 1]);
    const eye = add(add(rec.rest.eye, [n[0] * dist, n[1] * dist, n[2] * dist]), [0, -rise, 0]);
    const start: Pose = { eye, yaw: rec.yaw, pitch: rec.pitch + (Math.atan2(rise, dist + this.P) * 180) / Math.PI };
    this.cam = start;
    const plan: MovePlan = { keys: [{ t: 0, ...start }, { t: 1, ...rec.rest }], base: o.duration ?? 2.6, ease: "power2.inOut", entranceAt: 0.5, name: "intro" };
    return this.fly(plan, plan.base, id, id, hooks);
  };

  go = (fromId: string, toId: string, kind: "next" | "back" | "jump", hooks: HostHooks) => {
    const A = this.panels.get(fromId), B = this.panels.get(toId);
    if (!A || !B || !B.wrap) return null; // backup slides: the engine fades
    const plan = this.plan(A, B, kind);
    if (!plan) return null;
    if (["dolly", "drop", "rise", "dolly-back", "drop-back", "rise-back"].includes(plan.name)) this.clear(plan, toId);
    const d = duration(plan, this.comfort, this.comfort === COMFORT ? 1.15 : 1);
    if (d === null) return null; // comfort: too much turning → fade
    return this.fly(plan, d, fromId, toId, hooks);
  };

  skip = (move: gsap.core.Timeline) => {
    if (!this.flight || move !== this.flight) return false;
    move.progress(1); // fires the entrance start and onComplete (rest + done)
    return true;
  };

    /** engine: after its own fade (the previous panel stays under the new one for the crossfade) and after show() */
  settle = (id: string) => this.rest(id, true);

  private rest(id: string, keepPrev: boolean) {
    this.flight?.kill();
    this.flight = null;
    this.flightName = "";
    this.mask = null;
    this.hero.clear();
    this.mix.ov = 0;
    this.mix.lift = 0;
    this.overviewOn = false;
    const rec = this.panels.get(id);
    if (!rec) { this.stopLive(); return; } // a backup slide fades in flat over the world
    if (this.settled !== id) { this.prev = this.settled; this.settled = id; }
    this.cam = { eye: [...rec.rest.eye] as Vec3, yaw: rec.yaw, pitch: rec.pitch };
    for (const r of this.panels.values()) {
      const w = r.wrap;
      if (!w) continue;
      w.classList.remove("is-current");
      const s = w.style;
      s.removeProperty("-webkit-mask-image"); s.removeProperty("mask-image");
      s.willChange = "auto";
      if (r.id === id || (keepPrev && r.id === this.prev)) {
        // pixel-crisp: no 3D transform at rest
        s.visibility = "visible"; s.transform = "none"; s.opacity = "1"; s.borderRadius = "0px"; s.setProperty("--edge", "0");
        s.zIndex = r.id === id ? "6" : "5";
      } else s.visibility = "hidden";
    }
    this.stopLive();
    if (this.hud) this.hud.style.opacity = "0";
    this.updateBackdrop();
  }

  key = (e: KeyboardEvent, L: string | null) => {
    const flying = !!this.flight?.isActive();
    if (L === "o") {
      if (flying || this.api?.busy()) return true;
      this.overview(!this.overviewOn);
      return true;
    }
    if (!this.overviewOn) return false;
    const nav = isNext(e) || isPrev(e) || e.key === "Escape" || e.key === "Backspace" || e.key === "Home" || e.key === "End";
    const d = digit(e);
    if (flying) return nav || d !== null;
    if (nav) { this.overview(false); return true; }
    if (d !== null && d > 0) {
      const i = MAIN[d - 1];
      if (i !== undefined) this.pick(scenes[i].id);
      return true;
    }
    return false;
  };

  overview = (on: boolean, instant = false) => {
    const curId = this.currentId();
    if (on) {
      const quick = instant || reducedMotion();
      this.overviewOn = true;
      this.flight?.kill();
      this.hero = new Set(curId ? [curId] : []);
      this.beginLive();
      this.panels.get(curId ?? "")?.wrap?.classList.add("is-current");
      if (quick) {
        this.cam = { ...this.overviewPose, eye: [...this.overviewPose.eye] as Vec3 };
        this.mix.ov = 1;
        this.land = { from: curId ?? "", to: "", t: 1 };
        this.apply();
        this.renderDepth();
        if (reducedMotion() && !instant && this.root) gsap.fromTo(this.root.querySelector(".world-panels"), { opacity: 0 }, { opacity: 1, duration: 0.3 });
        return;
      }
      const plan = dolly(this.cam, this.overviewPose, { sway: 0, name: "overview" });
      plan.base = 1.5;
      // the overview is always a flight (never a fade), so it simply gets as long as the turn limit needs
      const d = Math.max(plan.base, peakTurn(plan) / this.comfort.maxTurn);
      this.fly(plan, d, curId ?? "", "", { done: () => {} }, { overview: 1 });
      return;
    }
    if (!curId) return;
    if (instant || reducedMotion()) { this.rest(curId, false); return; }
    const rec = this.panels.get(curId)!;
    const plan = dolly(this.cam, rec.rest, { sway: 0, name: "overview-back" });
    plan.base = 1.3;
    this.panels.get(curId)?.wrap?.classList.remove("is-current");
    this.fly(plan, Math.max(plan.base, peakTurn(plan) / this.comfort.maxTurn), "", curId, { done: () => {} }, { overview: 0 });
  };

  state = () => ({
    mode: this.mode, comfort: this.comfort === COMFORT, settled: this.settled, overview: this.overviewOn,
    flight: this.flightName, cam: this.cam, flights: this.stats.map(({ frames, ...f }) => ({ ...f, frames: frames.length })),
  });

  /* ---------------------------------------------------------------- planning */

  private moveInto(target: Rec, source: Rec, explicit: boolean): MoveKind | "window-out" {
    const m = explicit ? this.def.moves[target.id] : undefined;
    if (m && m !== "auto") return m;
    if (target.room?.of === source.id) return "window";
    if (source.room?.of === target.id) return "window-out";
    if (target.group && target.group === source.group) return "orbit";
    const dy = target.pos[1] - source.pos[1];
    if (Math.abs(dy) > 1200) return dy > 0 ? "drop" : "rise";
    return "dolly";
  }

  private plan(A: Rec, B: Rec, kind: "next" | "back" | "jump"): MovePlan | null {
    const sway = this.comfort.sway;
    const cur = this.cam;
    if (this.overviewOn || this.mix.ov > 0) return dolly(cur, B.rest, { sway: 0.3 });
    if (this.mode === "flat") {
      const mv = kind === "next" ? this.def.moves[B.id] : undefined;
      if (mv === "fade") return null;
      if (mv === "survey") return survey(cur, this.overviewPose, B.rest);
      return dolly(cur, B.rest, { sway, flat: true, quick: kind === "back" });
    }
    if (kind === "back") {
      // the same path as the forward move from B to A, played backwards and quicker
      const fwd = this.build(this.moveInto(A, B, true), B.rest, A.rest, B, A);
      if (!fwd) return null;
      const r = reverse(fwd, fwd.name === "survey" ? 1.2 : 0.9);
      r.keys[0] = { ...r.keys[0], eye: [...cur.eye] as Vec3, yaw: cur.yaw, pitch: cur.pitch };
      return r;
    }
    return this.build(this.moveInto(B, A, kind === "next"), cur, B.rest, A, B);
  }

  private build(mv: MoveKind | "window-out", cur: Pose, to: Pose, A: Rec, B: Rec): MovePlan | null {
    const sway = this.comfort.sway;
    switch (mv) {
      case "fade": return null;
      case "survey": return survey(cur, this.overviewPose, to);
      case "orbit": {
        const c = this.def.groups[B.group ?? A.group ?? ""]?.center;
        return c ? orbit(cur, to, c, { sway }) : dolly(cur, to, { sway });
      }
      case "window": {
        const r = B.room;
        if (!r) return dolly(cur, to, { sway });
        return through(cur, to, A, r.window, r.drop, this.P, { sway });
      }
      case "window-out": {
        const r = A.room!;
        // A is the room, B its parent: the forward path B → A reversed
        const fwd = through(B.rest, A.rest, B, r.window, r.drop, this.P, { sway });
        const back = reverse(fwd, 1.3);
        back.keys[0] = { ...back.keys[0], eye: [...cur.eye] as Vec3, yaw: cur.yaw, pitch: cur.pitch };
        return back;
      }
      case "drop": return dolly(cur, to, { sway, pitchSway: 5, name: "drop" });
      case "rise": return dolly(cur, to, { sway, pitchSway: -5, name: "rise" });
      default: return dolly(cur, to, { sway });
    }
  }

  /**
   * Never fly through a panel: if the path crosses a panel's plane inside its rectangle (+ margin),
   * push the middle key sideways along that panel's x axis until it clears (the target panel is exempt).
   */
  private clear(plan: MovePlan, toId: string) {
    if (plan.keys.length !== 3) return;
    for (let iter = 0; iter < 4; iter++) {
      let hit: { r: Rec; x: number } | null = null;
      let prev = sample(plan.keys, 0).eye;
      for (let i = 1; i <= 40 && !hit; i++) {
        const cur = sample(plan.keys, i / 40).eye;
        for (const r of this.panels.values()) {
          if (r.id === toId) continue;
          const loc = (e: Vec3) => { const q = apply(transpose3(rot(r.yaw, r.pitch)), [e[0] - r.pos[0], e[1] - r.pos[1], e[2] - r.pos[2]]); return q; };
          const a = loc(prev), b = loc(cur);
          if ((a[2] > 0) === (b[2] > 0)) continue;
          const k = a[2] / (a[2] - b[2]);
          const x = a[0] + (b[0] - a[0]) * k, y = a[1] + (b[1] - a[1]) * k;
          if (Math.abs(x) < 960 + 600 && Math.abs(y) < 540 + 600) { hit = { r, x }; break; }
        }
        prev = cur;
      }
      if (!hit) return;
      const side = hit.x >= 0 ? 1 : -1;
      const push = (960 + 760 - Math.abs(hit.x)) * side * 2; // the mid key moves ~2× the spline's lateral shift
      const axis = rotate(hit.r.yaw, hit.r.pitch, [1, 0, 0]);
      const m = plan.keys[1];
      m.eye = add(m.eye, [axis[0] * push, axis[1] * push, axis[2] * push]);
    }
  }

  /** whole world in view: from the front, above, looking down ~22° (flat: straight on) */
  private fitOverview(): Pose {
    const pts: Vec3[] = [];
    for (const r of this.panels.values()) for (const c of CORNERS) { const p = apply(r.M, c); pts.push([p[0], p[1], p[2]]); }
    if (!pts.length) return this.cam;
    const min = [0, 1, 2].map((k) => Math.min(...pts.map((p) => p[k])));
    const max = [0, 1, 2].map((k) => Math.max(...pts.map((p) => p[k])));
    const c: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
    const pitch = this.mode === "flat" ? 0 : 34;
    // the box centre is not the screen centre once the margins differ: search distance and a vertical shift
    let best: Pose | null = null;
    for (const shift of [0, -200, 200, -400, 400, -700, 700]) {
      const cc: Vec3 = [c[0], c[1] + shift, c[2]];
      const fitsAt = (dist: number) => {
        const pose: Pose = { eye: add(cc, rotate(0, pitch, [0, 0, dist])), yaw: 0, pitch };
        const V = viewCss(pose, this.P);
        return pts.every((p) => {
          const v = apply(V, p); const d = this.P - v[2];
          const sx = (v[0] * this.P) / d, sy = (v[1] * this.P) / d;
          return d > 50 && Math.abs(sx) < 960 - 140 && sy > -540 + 170 && sy < 540 - 120;
        });
      };
      let lo = 1000, hi = 400000;
      for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (fitsAt(m)) hi = m; else lo = m; }
      const pose = { eye: add(cc, rotate(0, pitch, [0, 0, hi])), yaw: 0, pitch };
      if (!best || hi < len3(sub3(best.eye, cc))) best = pose;
    }
    return best!;
  }

  /* ---------------------------------------------------------------- flying */

  private fly(plan: MovePlan, d: number, from: string, to: string, hooks: HostHooks, o: { overview?: number } = {}) {
    this.flight?.kill();
    this.hero = new Set([from, to].filter(Boolean));
    if (o.overview === undefined) { this.overviewOn = false; this.mix.ov = 0; }
    this.land = { from, to, t: 0 };
    this.flightName = plan.name;
    this.mask = null;
    if (plan.name.startsWith("window")) {
      const room = [...this.panels.values()].find((r) => r.room && (r.id === to || r.id === from) && (r.room.of === from || r.room.of === to));
      if (room?.room) {
        const forwardIn = room.id === to;
        this.mask = { id: room.room.of, rect: room.room.window, open: forwardIn ? (t) => smooth(0.04, 0.34, t) : (t) => smooth(0.04, 0.34, 1 - t) };
      }
    }
    this.beginLive();
    const ease = gsap.parseEase(plan.ease);
    const prog = { t: 0 };
    this.cur = { name: plan.name, duration: d, planned: plan.base, peakTurn: 0, frames: [] };
    this.lastFrame = performance.now();
    this.lastCam = null;
    let lastT = 0;
    const tl = gsap.timeline({
      onComplete: () => {
        if (this.cur) this.stats.push(this.cur);
        this.flight = null;
        if (o.overview === 1) { this.flightName = ""; this.mix.ov = 1; this.applyAndRender(); }
        else if (to) this.rest(to, false);
        hooks.done();
      },
    });
    tl.to(prog, {
      t: 1, duration: d, ease: "none",
      onUpdate: () => {
        const e = ease(prog.t);
        this.land.t = e;
        this.cam = sample(plan.keys, e);
        const t = tl.time();
        this.measure(t - lastT);
        lastT = t;
        this.applyAndRender();
      },
    }, 0);
    if (o.overview !== undefined) tl.to(this.mix, { ov: o.overview, duration: d * 0.6, ease: "power1.inOut" }, o.overview ? d * 0.4 : 0);
    // survey: the whole world lights up while the camera holds at the overview (labels stay off)
    this.mix.lift = 0;
    if (plan.name === "survey") tl.to(this.mix, { lift: 1, duration: d * 0.14, ease: "power1.inOut" }, d * 0.28).to(this.mix, { lift: 0, duration: d * 0.16, ease: "power1.inOut" }, d * 0.58);
    if (hooks.start) tl.call(hooks.start, [], d * plan.entranceAt);
    this.flight = tl;
    return tl;
  }

  /** frame times (ms, wall clock) and the peak turn rate in deg per second of timeline time */
  private measure(tdt: number) {
    const now = performance.now();
    const dt = (now - this.lastFrame) / 1000;
    if (this.cur && this.lastCam && dt > 0) {
      this.cur.frames.push(dt * 1000);
      if (tdt > 1 / 400) this.cur.peakTurn = Math.max(this.cur.peakTurn, angleBetween(this.lastCam, this.cam) / tdt);
    }
    this.lastFrame = now;
    this.lastCam = { ...this.cam, eye: [...this.cam.eye] as Vec3 };
  }

  private pick(id: string) {
    const rec = this.panels.get(id);
    if (!rec || this.flight?.isActive()) return;
    if (rec.index === this.api?.index()) { this.overview(false); return; }
    this.api?.jumpTo(rec.index);
  }

  private currentId() {
    const i = this.api?.index();
    return i === undefined ? this.settled : scenes[i]?.id ?? this.settled;
  }

  /* ---------------------------------------------------------------- rendering */

  private applyAndRender() { this.apply(); this.renderDepth(); }

  /** Place every panel for the current camera: transform, depth order, fog, near fade, corner radius, mask. */
  apply() {
    const P = this.P;
    const V = viewCss(this.cam, P);
    const PV = mul(perspective(P), V);
    const ov = this.mix.ov;
    const vis: { r: Rec; d: number }[] = [];
    for (const r of this.panels.values()) {
      const w = r.wrap;
      if (!w) continue;
      const MV = mul(V, r.M);
      let dmin = Infinity, left = 0, right = 0, up = 0, down = 0;
      for (const c of CORNERS) {
        const v = apply(MV, c), d = P - v[2];
        dmin = Math.min(dmin, d);
        if (d > 1) {
          const sx = (v[0] * P) / d, sy = (v[1] * P) / d;
          if (sx < -1060) left++; if (sx > 1060) right++; if (sy < -640) up++; if (sy > 640) down++;
        }
      }
      const center = apply(MV, [0, 0, 0]);
      const dc = P - center[2];
      const off = left === 4 || right === 4 || up === 4 || down === 4;
      let op: number;
      if (this.hero.has(r.id)) op = 1;
      else {
        const fog = this.mode === "flat" ? 0.3 : lerp(0.62, 0.14, smooth(P * 1.5, P * 12, dc));
        op = lerp(fog, 0.9, Math.max(ov, this.mix.lift));
      }
      // panels the camera passes close to fade out early (the target lands at d = P, so it is never affected)
      op *= this.hero.has(r.id) && r.id === this.land.to ? smooth(this.near * 0.6, this.near * 1.6, dmin) : smooth(this.near * 0.6, this.near * 3.2, dmin);
      const s = w.style;
      if (off || dmin < this.near * 0.6 || op < 0.01) { s.visibility = "hidden"; continue; }
      s.visibility = "visible";
      s.transform = css(mul(PV, r.M));
      s.opacity = op.toFixed(3);
      let k = 1;
      if (r.id === this.land.to) k = 1 - smooth(0.82, 1, this.land.t);
      else if (r.id === this.land.from && !ov) k = smooth(0, 0.14, this.land.t);
      s.borderRadius = `${(RADIUS * k).toFixed(2)}px`;
      s.setProperty("--edge", k.toFixed(3));
      if (this.mask?.id === r.id) {
        const a = this.mask.open(this.land.t).toFixed(3);
        const [x, y, mw, mh] = this.mask.rect;
        const img = `linear-gradient(#000, #000), linear-gradient(rgba(0,0,0,${a}), rgba(0,0,0,${a}))`;
        s.setProperty("-webkit-mask-image", img); s.setProperty("mask-image", img);
        for (const pre of ["-webkit-", ""]) {
          s.setProperty(`${pre}mask-size`, `100% 100%, ${mw}px ${mh}px`);
          s.setProperty(`${pre}mask-position`, `0 0, ${x}px ${y}px`);
          s.setProperty(`${pre}mask-repeat`, "no-repeat");
        }
        s.setProperty("-webkit-mask-composite", "xor"); s.setProperty("mask-composite", "exclude");
      } else if (s.getPropertyValue("mask-image")) { s.removeProperty("-webkit-mask-image"); s.removeProperty("mask-image"); }
      vis.push({ r, d: dc });
    }
    vis.sort((a, b) => b.d - a.d).forEach((v, i) => { v.r.wrap!.style.zIndex = String(i + 1); });
    this.updateHud(V, ov);
    this.updateBackdrop();
  }

  private updateHud(V: Mat4, ov: number) {
    const hud = this.hud;
    if (!hud) return;
    const a = smooth(0.55, 1, ov);
    hud.style.opacity = a.toFixed(3);
    hud.style.pointerEvents = a > 0.9 ? "auto" : "none";
    if (a <= 0) return;
    const cur = this.currentId();
    // Labels: each scene's label sits centred above its panel; if that spot is taken (rings and clusters put
    // panels on similar screen positions) it tries below the panel, then sideways, then a free row above, and a
    // leader line ties a displaced label to its panel. Titles wrap to two lines before they are ellipsised.
    const proj = (r: Rec, p: Vec3) => {
      const v = apply(mul(V, r.M), p);
      const d = this.P - v[2];
      return { x: 960 + (v[0] * this.P) / d, y: 540 + (v[1] * this.P) / d, d };
    };
    type Box = { x: number; y: number; w: number; h: number };
    const items: { id: string; el: HTMLElement; line: SVGLineElement | null; top: { x: number; y: number }; bot: { x: number; y: number }; w: number; h: number }[] = [];
    for (const el of Array.from(hud.querySelectorAll<HTMLElement>("[data-hud]"))) {
      const id = el.dataset.hud!;
      const r = this.panels.get(id);
      const line = hud.querySelector<SVGLineElement>(`[data-leader="${id}"]`);
      if (!r) continue;
      const top = proj(r, [0, -540, 0]), bot = proj(r, [0, 540, 0]);
      if (top.d < 50 || bot.d < 50) { el.style.visibility = "hidden"; line?.setAttribute("visibility", "hidden"); continue; }
      el.style.visibility = "visible";
      el.classList.toggle("hud-current", id === cur);
      // as wide as the panel on screen allows (340–440 px); two lines before the ellipsis
      const left = proj(r, [-960, -540, 0]), right = proj(r, [960, -540, 0]);
      el.style.maxWidth = `${Math.round(clamp(right.x - left.x, 340, 440))}px`;
      items.push({ id, el, line, top, bot, w: el.offsetWidth, h: el.offsetHeight });
    }
    // nearest panels first (largest on screen), so they keep the label right on top of them
    items.sort((p, q) => (q.bot.y - q.top.y) - (p.bot.y - p.top.y));
    const placed: Box[] = [];
    const GAP = 10;
    const free = (b: Box) => b.x >= 16 && b.x + b.w <= 1904 && b.y >= 92 && b.y + b.h <= 1000 &&
      !placed.some((p) => b.x < p.x + p.w + GAP && p.x < b.x + b.w + GAP && b.y < p.y + p.h + GAP && p.y < b.y + b.h + GAP);
    for (const it of items) {
      const above = { x: it.top.x - it.w / 2, y: it.top.y - 12 - it.h };
      const below = { x: it.bot.x - it.w / 2, y: it.bot.y + 12 };
      const cands: { x: number; y: number }[] = [above, below];
      for (let k = 1; k <= 4; k++) for (const sgn of [1, -1]) {
        cands.push({ x: above.x + sgn * k * (it.w / 2 + GAP), y: above.y }, { x: below.x + sgn * k * (it.w / 2 + GAP), y: below.y });
      }
      for (let k = 1; k <= 8; k++) for (const dx of [0, it.w / 2 + GAP, -(it.w / 2 + GAP)]) cands.push({ x: above.x + dx, y: above.y - k * (it.h + GAP) });
      const pick = cands.find((c) => free({ ...c, w: it.w, h: it.h })) ?? cands[0];
      placed.push({ ...pick, w: it.w, h: it.h });
      it.el.style.transform = `translate(${pick.x.toFixed(1)}px, ${pick.y.toFixed(1)}px)`;
      // leader line when the label is not right at its panel's edge
      const isBelow = pick.y > it.bot.y;
      const anchor = isBelow ? it.bot : it.top;
      const end = { x: clamp(anchor.x, pick.x + 12, pick.x + it.w - 12), y: isBelow ? pick.y : pick.y + it.h };
      const far = Math.hypot(end.x - anchor.x, end.y - anchor.y) > 24;
      if (it.line) {
        it.line.setAttribute("visibility", far ? "visible" : "hidden");
        it.line.setAttribute("x1", anchor.x.toFixed(1)); it.line.setAttribute("y1", anchor.y.toFixed(1));
        it.line.setAttribute("x2", end.x.toFixed(1)); it.line.setAttribute("y2", end.y.toFixed(1));
        it.line.classList.toggle("hud-current", it.id === cur);
      }
    }
  }

  private updateBackdrop() {
    const b = this.backdrop;
    if (!b || this.mode !== "flat") return;
    // 2.5D: the dot grid moves with the camera at the depth of the panel plane (parallax-free, like a table top)
    const z = this.P / Math.max(200, this.cam.eye[2]);
    const size = 48 * z;
    b.style.backgroundSize = `${size.toFixed(2)}px ${size.toFixed(2)}px`;
    b.style.backgroundPosition = `${(960 - this.cam.eye[0] * z).toFixed(1)}px ${(540 - this.cam.eye[1] * z).toFixed(1)}px`;
  }

  private renderDepth() {
    if (!this.depth || !this.live) return;
    this.depth.render(this.cam, performance.now() / 1000);
  }

  private beginLive() {
    // every placed scene root is visible inside its panel; the panels' own visibility is decided per frame
    for (const r of this.panels.values()) {
      const root = r.wrap?.firstElementChild as HTMLElement | null;
      if (root) gsap.set(root, { autoAlpha: 1 });
      if (r.wrap) r.wrap.style.willChange = "transform, opacity";
    }
    if (this.canvas && this.depth) this.canvas.style.visibility = "visible";
    if (!this.live) { this.live = true; gsap.ticker.add(this.onTick); }
  }

  private stopLive() {
    if (this.canvas) this.canvas.style.visibility = "hidden";
    if (this.live) { this.live = false; gsap.ticker.remove(this.onTick); }
  }

  /** overview at rest: the depth layer keeps turning slowly at ~30 fps; flights render from their own onUpdate */
  private onTick = () => {
    if (!this.overviewOn || this.flight?.isActive()) return;
    if (++this.tick % 2) return;
    this.renderDepth();
  };

  private mount(root: HTMLElement) {
    this.root = root;
    this.hud = root.querySelector<HTMLElement>(".world-hud") ?? undefined;
    this.backdrop = root.querySelector<HTMLElement>(".world-backdrop") ?? undefined;
    this.canvas = root.querySelector<HTMLCanvasElement>(".world-canvas") ?? undefined;
    const noGl = new URLSearchParams(location.search).get("gl") === "0"; // ?gl=0: test the no-WebGL fallback
    if (this.canvas && !noGl && allow("shader") && webglAvailable()) {
      const cs = getComputedStyle(root);
      const v = (n: string, f: string) => toHex(cs.getPropertyValue(n).trim() || f);
      const pts: Vec3[] = [...this.panels.values()].map((r) => r.pos);
      const min: Vec3 = [0, 1, 2].map((k) => Math.min(...pts.map((p) => p[k]))) as Vec3;
      const max: Vec3 = [0, 1, 2].map((k) => Math.max(...pts.map((p) => p[k]))) as Vec3;
      try {
        this.depth = new DepthLayer(this.canvas, this.P, { min, max }, {
          bg: v("--color-world-bg", "#06080c"), star: v("--color-world-star", "#dfe8ff"),
          accent: v("--color-world-accent", "#7fb4ff"), grid: v("--color-world-grid", "#1c2433"),
        });
        this.resize();
        window.addEventListener("resize", this.resize);
      } catch { this.depth = null; }
    }
    if (!this.depth) root.classList.add("world-nogl");
  }

  private resize = () => {
    if (!this.root || !this.depth) return;
    const k = this.root.getBoundingClientRect().width / 1920;
    this.depth.resize(clamp(k, 0.25, 4) * (window.devicePixelRatio || 1));
    if (this.live) this.renderDepth();
  };

  private unmount() {
    window.removeEventListener("resize", this.resize);
    this.stopLive();
    this.depth?.dispose();
    this.depth = null;
  }
}

/** Any CSS colour (color-mix, oklab, var-resolved) → #rrggbb for three.js, through a 1×1 canvas. */
function toHex(c: string): string {
  const cx = document.createElement("canvas").getContext("2d");
  if (!cx) return c;
  cx.fillStyle = "#000"; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1);
  const [r, g, b] = cx.getImageData(0, 0, 1, 1).data;
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

/** Install the world as the deck's scene host. Call in main.tsx before mounting. Returns the runtime (or null when off). */
export function installWorld(def: WorldDef): World | null {
  const w = new World(def);
  if (!w.enabled()) return null;
  setSceneHost(w);
  return w;
}

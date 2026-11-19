import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { gsap, useGSAP, Observer, reducedMotion } from "../gsap";
import { scenes } from "../scenes";
import { DECK } from "./config";
import type { Cmd, DeckState, Hold, MediaState, Msg } from "./types";
import { useChannel, type Source } from "./channel";
import { REMOTE, SHOW_NAMES, setRemoteManifest } from "./remote-client";

setRemoteManifest(() => ({
  speakers: DECK.speakers.map((s, i) => ({ part: i + 1, id: s.id, name: s.name })),
  scenes: scenes.map((s) => ({
    id: s.id, title: s.title, notes: s.notes, appendix: !!s.appendix,
    part: s.speaker ? DECK.speakers.findIndex((x) => x.id === s.speaker) + 1 : 0,
  })),
}));
import { TransitionLayer, SCENE_PROPS } from "./transitions";
import { runTransition, resetTransitions, lastRun, type Layers } from "./director";
import { planInto, PLANS } from "./grammar";
import { initShaders, shaderInfo } from "./shader";
import { allow, style as deckStyle } from "../fx/dial";
import { Divider, Footer, HelpPanel, NotesPanel, SpeakerChips } from "./chrome";
import { BlankScreen, DrawLayer, Laser, type Blank, type Stroke } from "./tools";
import { Palette } from "./palette";
import { PresenterView } from "./presenter";
import { APPX, MAIN, labelTime, stepsOf } from "./util";
import { digit, isHelp, isNext, isPrev, isSearch, letter } from "./keys";
import { sceneHost } from "./host";

/**
 * Flags for scene modules (media, hand, confetti): do side effects only when
 * `forward` is true (the deck plays forward at normal speed) and never while `seeking`, `exporting` or `print`.
 */
export const deckRuntime = { print: false, exporting: false, seeking: false, forward: false };

/* ------------------------------------------------------------------ registry and scene hooks */

type Registry = {
  register: (id: string, tl: gsap.core.Timeline, el: HTMLElement) => void;
  /** interactive scenes: tell the deck which step the scene is on */
  setStep?: (step: number) => void;
  /** interactive scenes: stop deck navigation by keys and wheel */
  lock?: (on: boolean) => void;
  /** interactive scenes: stop the deck's own playhead tween */
  stop?: () => void;
  /** media scenes: take Next/Back while playing (return true = handled) */
  setHold?: (h: Hold | null) => void;
  /** media scenes: report state for the presenter window and the phones */
  setMedia?: (m: MediaState | null) => void;
  /** remote mode: true on a deck that only follows the lead (its own keys do nothing) */
  isFollower?: () => boolean;
  /** remote mode, lead deck: send a command to every other open deck */
  emit?: (cmd: Cmd, extra?: { index?: number; t?: number }) => void;
};
const RegistryCtx = createContext<Registry>({ register: () => {} });
const SceneIdCtx = createContext<string>("");
const ActiveIdCtx = createContext<string>("");
const StepCtx = createContext<number>(-1);

/** Controls for scenes that drive media or their own timeline. Safe no-ops in print. */
export function useDeckControl() {
  const { setStep, lock, stop, setHold, setMedia, isFollower, emit } = useContext(RegistryCtx);
  return {
    setStep: setStep ?? (() => {}), lock: lock ?? (() => {}), stop: stop ?? (() => {}),
    setHold: setHold ?? (() => {}), setMedia: setMedia ?? (() => {}),
    isFollower: isFollower ?? (() => false), emit: emit ?? (() => {}),
  };
}

/** Current step of this scene while it is on screen, -1 otherwise (and in print). */
export function useSceneStep() {
  const id = useContext(SceneIdCtx);
  const active = useContext(ActiveIdCtx);
  const step = useContext(StepCtx);
  return active === id ? step : -1;
}

/** True while this scene is on screen (always in print). Pause heavy loops when false. */
export function useSceneActive() {
  const id = useContext(SceneIdCtx);
  const active = useContext(ActiveIdCtx);
  return active === "*" || active === id;
}

/** A scene builds ONE paused timeline. Labels s0, s1, … mark the end of the entrance and of every step. */
export function useScene(build: (tl: gsap.core.Timeline, q: (sel: string) => Element[]) => void) {
  const ref = useRef<HTMLDivElement>(null);
  const { register } = useContext(RegistryCtx);
  const id = useContext(SceneIdCtx);
  useGSAP(() => {
    const el = ref.current!;
    const tl = gsap.timeline({ paused: true });
    const q = gsap.utils.selector(el) as unknown as (sel: string) => Element[];
    build(tl, q);
    if (tl.labels.s0 === undefined) tl.addLabel("s0");
    // a label can sit after the last tween: stretch the timeline so tweenTo reaches every label
    const last = Math.max(...Object.values(tl.labels));
    if (last > tl.duration()) tl.set({}, {}, last);
    register(id, tl, el);
  }, { scope: ref });
  return ref;
}

export function SceneRoot({ children, hero = false, className = "", ref }: { children: ReactNode; hero?: boolean; className?: string; ref?: React.Ref<HTMLDivElement> }) {
  const id = useContext(SceneIdCtx);
  return <div ref={ref} data-scene={id} className={`scene ${hero ? "hero" : ""} ${className}`}>{children}</div>;
}

/** Jump a timeline: pause, then seek WITH events, so onUpdate counters and typed text land on real values. */
function jumpTl(tl: gsap.core.Timeline, t: number) {
  deckRuntime.seeking = true;
  deckRuntime.forward = false;
  tl.pause();
  tl.seek(t, false);
  deckRuntime.seeking = false;
}

function useScale(enabled: boolean) {
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    if (!enabled) return;
    const fit = () => setScale(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [enabled]);
  return scale;
}

/* ------------------------------------------------------------------ routes: #presenter, #print, #<scene-id> */

export function App() {
  const mode = location.hash.replace("#", "");
  if (mode === "presenter") return <PresenterView />;
  if (mode === "print") return <Print />;
  return <Deck startId={mode} />;
}

/** Every scene at its end state, one per page; backup slides after an "Appendix" divider. */
function Print() {
  deckRuntime.print = true;
  const register = useCallback((_id: string, tl: gsap.core.Timeline, el: HTMLElement) => {
    gsap.set(el, { autoAlpha: 1 });
    jumpTl(tl, tl.duration());
  }, []);
  useEffect(() => { document.documentElement.classList.add("print-mode", "export-mode"); }, []);
  return (
    <RegistryCtx.Provider value={{ register }}>
      <ActiveIdCtx.Provider value="*">
        <div className="viewport">
          {[...MAIN, ...APPX].map((i) => {
            const s = scenes[i];
            return (
              <div key={s.id} style={{ display: "contents" }}>
                {i === APPX[0] && <div className="stage"><Divider count={APPX.length} /></div>}
                <div className="stage">
                  <SceneIdCtx.Provider value={s.id}><s.Component /></SceneIdCtx.Provider>
                  {!s.full && <Footer scene={s} index={i} step={0} steps={0} />}
                </div>
              </div>
            );
          })}
        </div>
      </ActiveIdCtx.Provider>
    </RegistryCtx.Provider>
  );
}

/** Every scene; inside the scene host's Wrap/Panel when one is installed (world). */
function SceneList() {
  const h = sceneHost();
  const list = scenes.map((s) => (
    <SceneIdCtx.Provider value={s.id} key={s.id}>
      {h ? <h.Panel id={s.id}><s.Component /></h.Panel> : <s.Component />}
    </SceneIdCtx.Provider>
  ));
  return h ? <h.Wrap>{list}</h.Wrap> : <>{list}</>;
}

/* ------------------------------------------------------------------ the deck */

type Pos = { index: number; step: number };

function Deck({ startId }: { startId: string }) {
  const found = scenes.findIndex((s) => s.id === startId);
  const startIndex = found >= 0 ? found : MAIN[0];

  const tls = useRef<Record<string, { tl: gsap.core.Timeline; el: HTMLElement }>>({});
  const driver = useRef<gsap.core.Tween | null>(null);
  const pending = useRef<gsap.core.Tween | null>(null);
  const trans = useRef<gsap.core.Timeline | null>(null);
  const busy = useRef(false); // a scene transition is playing
  const navLock = useRef(false);
  const hold = useRef<Hold | null>(null);
  const media = useRef<MediaState | null>(null);
  const isLead = useRef(false);
  const role = useRef<"none" | "lead" | "follower">("none"); // set by the remote server
  // follower: the lead's state that arrived during a transition or before start, applied when free
  const pendingSync = useRef<DeckState | null>(null);
  const resumeSync = useRef(false);
  const waiting = useRef(false);
  const ready = useRef(new Set<string>());
  const started = useRef(false);
  const stage = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const plate = useRef<HTMLDivElement>(null);
  const glCanvas = useRef<HTMLCanvasElement>(null);
  const sharedLayer = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(1);

  const pos = useRef<Pos>({ index: startIndex, step: 0 });
  const [index, setIndex] = useState(startIndex);
  const [step, setStep] = useState(0);
  const setPos = (i: number, st: number) => { pos.current = { index: i, step: st }; setIndex(i); setStep(st); };

  const startRef = useRef<Pos | null>(scenes[startIndex].appendix ? { index: MAIN[0], step: 0 } : null);
  const returnRef = useRef<Pos | null>(startRef.current);
  const [returnTo, setReturnState] = useState<Pos | null>(startRef.current);
  const setReturn = (p: Pos | null) => { returnRef.current = p; setReturnState(p); };

  const timers = useRef({ startedAt: null as number | null, speakerStartedAt: null as number | null });
  const [, setTick] = useState(0);
  const setTimers = (t: Partial<typeof timers.current>) => { timers.current = { ...timers.current, ...t }; setTick((v) => v + 1); };

  // no key shows the notes in recording links (?remote); rehearse with ?notes
  const [notes, setNotes] = useState(() => new URLSearchParams(location.search).has("notes"));
  const [help, setHelp] = useState(false);
  const [palette, setPalette] = useState(false);
  const [blank, setBlank] = useState<Blank>("");
  const [laser, setLaser] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [exporting, setExporting] = useState(false);
  const [divider, setDivider] = useState(false);
  const [, setReady] = useState(false);
  const scale = useScale(true);
  scaleRef.current = scale;
  const layers = (): Layers | null => stage.current && layer.current && plate.current && sharedLayer.current
    ? { stage: stage.current, overlay: layer.current, canvas: glCanvas.current!, plate: plate.current, shared: sharedLayer.current, scale: scaleRef.current }
    : null;
  const ui = useRef({ help, palette, blank, drawing, laser, notes, strokes: strokes.length, exporting });
  ui.current = { help, palette, blank, drawing, laser, notes, strokes: strokes.length, exporting };

  // a ?remote deck follows the lead once the server says so; with no server it is a normal deck
  const isFollower = () => role.current === "follower";

  /* ---------------------------------------------------------------- registration */

  const register = useCallback((id: string, tl: gsap.core.Timeline, el: HTMLElement) => {
    tls.current[id] = { tl, el };
    ready.current.add(id);
    const meta = scenes.find((s) => s.id === id);
    if (import.meta.env.DEV && meta && meta.steps !== stepsOf(tl)) console.warn(`scene "${id}": meta.steps=${meta.steps} but the timeline has ${stepsOf(tl)} step labels`);
    // start only when ALL scenes registered
    if (!started.current && ready.current.size === scenes.length) {
      started.current = true;
      setReady(true);
      const entry = tls.current[scenes[pos.current.index].id];
      gsap.set(entry.el, { autoAlpha: 1 });
      const h = sceneHost();
      h?.attach({ jumpTo: (i) => nav.current.jumpTo(i), index: () => pos.current.index, busy: () => busy.current });
      // scene host (world): opening shot into the first scene, the entrance starts on arrival
      const intro = h && !reducedMotion() && pos.current.index === MAIN[0]
        ? h.intro(scenes[pos.current.index].id, { start: () => drive(entry.tl, "s0"), done: () => { busy.current = false; trans.current = null; flushSync(); } })
        : null;
      if (intro) { busy.current = true; trans.current = intro; return; }
      h?.settle(scenes[pos.current.index].id);
      drive(entry.tl, "s0");
      flushSync();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------------------------------------------------------- driving */

  function drive(tl: gsap.core.Timeline, label: string, vars: gsap.TweenVars = {}) {
    driver.current?.kill();
    deckRuntime.forward = vars.duration === undefined && (tl.labels[label] ?? tl.duration()) >= tl.time();
    driver.current = tl.tweenTo(label, { ...vars, onComplete: () => { deckRuntime.forward = false; } });
  }

  /** The current part (entrance or step) is still playing. */
  function running(tl: gsap.core.Timeline) {
    return tl.time() < labelTime(tl, pos.current.step) - 0.05 || !!driver.current?.isActive();
  }

  function startTimers() {
    if (timers.current.startedAt !== null) return;
    const now = Date.now();
    setTimers({ startedAt: now, speakerStartedAt: now });
  }

  /** how: "next" = forward to the next main scene (own transition), "play" = fade + entrance, "seek" = fade + land on the step. */
  function goScene(i: number, targetStep: number, how: "next" | "play" | "seek") {
    if (i < 0 || i >= scenes.length) return;
    const from = scenes[pos.current.index];
    const to = scenes[i];
    const a = tls.current[from.id];
    const b = tls.current[to.id];
    if (!a || !b) return;
    driver.current?.kill(); driver.current = null; // a killed tween still reports isActive() during its old window
    pending.current?.kill();
    setStrokes([]); // drawings belong to a scene
    const commit = () => {
      if (from.speaker !== to.speaker && timers.current.startedAt !== null) setTimers({ speakerStartedAt: Date.now() });
      setPos(i, targetStep);
    };
    // scene host (world): the camera moves to the next scene instead of a transition
    const h = sceneHost();
    if (h && !reducedMotion() && a !== b) {
      const back = how === "seek" && MAIN.indexOf(i) >= 0 && MAIN.indexOf(i) === MAIN.indexOf(pos.current.index) - 1;
      jumpTl(b.tl, how === "seek" ? labelTime(b.tl, targetStep) : 0);
      a.tl.pause();
      const move = h.go(from.id, to.id, how === "next" ? "next" : back ? "back" : "jump", {
        start: how === "seek" ? undefined : () => drive(b.tl, `s${targetStep}`),
        done: () => { busy.current = false; trans.current = null; flushSync(); },
      });
      if (move) { busy.current = true; trans.current = move; commit(); return; }
    }
    const L = layers();
    if (how === "next" && L && !reducedMotion()) {
      busy.current = true;
      jumpTl(b.tl, 0); // with events: counters and typed text rewind to their start values
      // the plan (kind, through-zoom) comes from grammar.ts: request > style default, degraded by the dial
      trans.current = runTransition(L, planInto(i), a.el, b.el, {
        swap: () => { a.tl.pause(); commit(); },
        start: () => drive(b.tl, "s0"),
        done: () => { busy.current = false; trans.current = null; flushSync(); },
      }, (fn) => { jumpTl(b.tl, labelTime(b.tl, 0)); fn(); jumpTl(b.tl, 0); });
      return;
    }
    // soft fade: going back, jumps, backup slides, or no transition set
    for (const s of scenes) if (s.id !== from.id && s.id !== to.id) gsap.set(tls.current[s.id]?.el ?? [], { autoAlpha: 0 });
    gsap.killTweensOf([a.el, b.el]);
    if (a !== b) gsap.to(a.el, { autoAlpha: 0, duration: 0.35, ease: "power2.in", onComplete: () => { a.tl.pause(); } });
    gsap.fromTo(b.el, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.35, delay: 0.15, ease: "power2.out" });
    if (how === "seek") jumpTl(b.tl, labelTime(b.tl, targetStep));
    else {
      jumpTl(b.tl, 0); // with events: counters and typed text rewind to their start values
      pending.current = gsap.delayedCall(0.15, () => drive(b.tl, `s${targetStep}`));
    }
    h?.settle(to.id);
    commit();
  }

  /** → : next step, or the next main scene. A press during a running part is ignored unless skip. */
  function next(o: { skip?: boolean } = {}): boolean {
    // Shift+→ during a scene host move (world flight, opening shot) cuts to its end, then finishes the entrance
    if (busy.current && !(o.skip && trans.current && sceneHost()?.skip(trans.current))) return false;
    if (hold.current?.next?.()) return true;
    const i = pos.current.index;
    const entry = tls.current[scenes[i].id];
    if (!entry) return false;
    startTimers();
    if (running(entry.tl)) {
      if (!o.skip && !DECK.fastFinishOnPress) return false;
      drive(entry.tl, `s${pos.current.step}`, { duration: 0.35 });
      deckRuntime.forward = false;
      return true;
    }
    const max = stepsOf(entry.tl);
    if (pos.current.step < max) {
      const st = pos.current.step + 1;
      setPos(i, st);
      drive(entry.tl, `s${st}`);
      return true;
    }
    if (scenes[i].appendix) return false; // backup slides do not chain: Esc returns
    const m = MAIN.indexOf(i);
    if (m < 0 || m >= MAIN.length - 1) return false; // the last main scene never runs into the appendix
    goScene(MAIN[m + 1], 0, "next");
    return true;
  }

  /** ← : previous step, or the previous main scene at its last step. */
  function prev(): boolean {
    if (busy.current) return false;
    if (hold.current?.prev?.()) return true;
    const i = pos.current.index;
    const entry = tls.current[scenes[i].id];
    if (!entry) return false;
    if (pos.current.step > 0) {
      const st = pos.current.step - 1;
      setPos(i, st);
      drive(entry.tl, `s${st}`, { duration: 0.35, ease: "power2.inOut" });
      return true;
    }
    if (scenes[i].appendix) return returnFromBackup(); // ← at the start of a backup slide = Esc
    const m = MAIN.indexOf(i);
    if (m <= 0) return false;
    const p = MAIN[m - 1];
    goScene(p, stepsOf(tls.current[scenes[p].id]?.tl), "seek");
    return true;
  }

  /** Any scene by index. step undefined = play its entrance; a number = land on that step. */
  function jumpTo(i: number, step?: number): boolean {
    if (i < 0 || i >= scenes.length || busy.current) return false;
    const cur = pos.current;
    if (i === cur.index && (step === undefined || step === cur.step)) return false;
    if (scenes[i].appendix) {
      if (!returnRef.current && !scenes[cur.index].appendix) setReturn({ ...cur });
    } else setReturn(null);
    if (i === cur.index) {
      const tl = tls.current[scenes[i].id].tl;
      driver.current?.kill(); driver.current = null;
      setPos(i, Math.min(step!, stepsOf(tl)));
      jumpTl(tl, labelTime(tl, step!));
      return true;
    }
    goScene(i, step ?? 0, step === undefined ? "play" : "seek");
    return true;
  }

  /** 1–9 / Home / End: main scenes only. Forward plays the entrance, backward lands after it. */
  function jumpMain(m: number) {
    const i = MAIN[Math.max(0, Math.min(MAIN.length - 1, m))];
    const back = MAIN.indexOf(pos.current.index) > MAIN.indexOf(i) || scenes[pos.current.index].appendix;
    const t = back ? 0 : undefined;
    jumpTo(i, t);
  }

  /** Esc on a backup slide: the exact main scene and step we left. */
  function returnFromBackup(): boolean {
    const rt = returnRef.current;
    if (!rt || busy.current) return false;
    setReturn(null);
    goScene(rt.index, rt.step, "seek");
    return true;
  }

  const escBack = () => returnFromBackup();

  function replayIntro() {
    const first = MAIN[0];
    if (pos.current.index !== first) { setReturn(null); goScene(first, 0, "play"); return; }
    const c = tls.current[scenes[first].id];
    c.tl.pause(0);
    setPos(first, 0);
    const h = sceneHost();
    const intro = h && !reducedMotion() && !busy.current
      ? h.intro(scenes[first].id, { start: () => drive(c.tl, "s0"), done: () => { busy.current = false; trans.current = null; } })
      : null;
    if (intro) { busy.current = true; trans.current = intro; return; }
    drive(c.tl, "s0");
  }

  /** __deck.show: instant, no transition, seek with events. */
  function show(i: number, k: number | "end") {
    const target = scenes[i];
    if (!target) return;
    trans.current?.kill();
    trans.current = null;
    busy.current = false;
    driver.current?.kill(); driver.current = null;
    pending.current?.kill();
    resetTransitions({ overlay: layer.current ?? undefined, canvas: glCanvas.current ?? undefined, plate: plate.current ?? undefined, shared: sharedLayer.current ?? undefined });
    for (const s of scenes) {
      const e = tls.current[s.id];
      if (!e) continue;
      gsap.killTweensOf(e.el);
      gsap.set(e.el, { clearProps: SCENE_PROPS });
      gsap.set(e.el, { autoAlpha: s === target ? 1 : 0 });
    }
    const tl = tls.current[target.id].tl;
    const max = stepsOf(tl);
    const st = k === "end" ? max : Math.max(0, Math.min(k, max));
    jumpTl(tl, k === "end" ? tl.duration() : labelTime(tl, st));
    setStrokes([]); setBlank(""); setDivider(false); setPalette(false); setHelp(false); setDrawing(false);
    setReturn(null);
    setPos(i, st);
    sceneHost()?.settle(target.id);
  }

  /* ---------------------------------------------------------------- sync: presenter window, remote server */

  const broadcast = useChannel((m: Msg, from: Source) => {
    if (m.type === "role") { isLead.current = m.lead; role.current = m.lead ? "lead" : "follower"; }
    // a follower repeats the lead's PLACE (scene and step), not its key presses: a press that only
    // finishes an animation on the lead must not move a follower whose animation is already done
    // resume: this lead deck was opened again during a talk; it goes to where the talk is
    if (m.type === "sync" && (isFollower() || m.resume)) {
      pendingSync.current = m.state;
      resumeSync.current = !!m.resume;
      if (!busy.current && started.current) flushSync();
    }
    if (m.type !== "cmd") return;
    if (from === "deck") return; // another local deck window: it has its own link to the server
    const n = nav.current;
    // the lead mirrors only replay and media commands to the other decks (server LEAD_CMDS)
    const relay = () => { if (from === "presenter") emit(m.cmd, m.t === undefined ? {} : { t: m.t }); };
    switch (m.cmd) {
      case "hello": sendState(); broadcast({ type: "wait", ...pos.current, waiting: waiting.current }); break;
      case "next": n.next(); break;
      case "prev": n.prev(); break;
      case "jump": if (typeof m.index === "number") n.jumpTo(m.index, m.t); break;
      case "return": n.escBack(); break;
      case "replay": n.replayIntro(); relay(); break;
      case "media-toggle": hold.current?.toggle?.(); relay(); break;
      case "media-skip": hold.current?.skip?.(); relay(); break;
      case "media-seek": if (typeof m.t === "number") { hold.current?.seek?.(m.t); relay(); } break;
    }
  }, { remote: REMOTE });

  function flushSync() {
    const st = pendingSync.current;
    pendingSync.current = null;
    const resume = resumeSync.current;
    resumeSync.current = false;
    if (!st) return;
    // a reopened lead: straight to the place, no transition
    if (resume && !isFollower()) { if (st.index !== pos.current.index || st.step !== pos.current.step) goScene(st.index, st.step, "seek"); return; }
    if (isFollower()) nav.current.follow(st);
  }

  /** Follower: go to the lead's scene and step (also a late joiner's first sync). */
  function follow(st: DeckState) {
    const cur = pos.current;
    if (st.index !== cur.index) {
      if (scenes[st.index]?.appendix) setReturn(st.returnTo ?? null);
      else setReturn(null);
      const nextMain = MAIN[MAIN.indexOf(cur.index) + 1];
      if (st.index === nextMain && st.step === 0) goScene(st.index, 0, "next");
      else if (st.index > cur.index && st.step === 0) goScene(st.index, 0, "play");
      else goScene(st.index, st.step, "seek");
      return;
    }
    setReturn(st.returnTo ?? null);
    if (st.step === cur.step) return;
    const entry = tls.current[scenes[cur.index].id];
    if (!entry) return;
    setPos(cur.index, st.step);
    if (st.step > cur.step) drive(entry.tl, `s${st.step}`);
    else drive(entry.tl, `s${st.step}`, { duration: 0.35, ease: "power2.inOut" });
  }

  function emit(cmd: Cmd, extra: { index?: number; t?: number } = {}) {
    if (isLead.current) broadcast({ type: "cmd", cmd, ...extra });
  }

  function sendState() {
    const id = scenes[pos.current.index].id;
    broadcast({ type: "state", state: {
      index: pos.current.index, step: pos.current.step, steps: stepsOf(tls.current[id]?.tl),
      startedAt: timers.current.startedAt, speakerStartedAt: timers.current.speakerStartedAt,
      media: media.current, returnTo: returnRef.current,
    } });
  }

  const onWait = (w: boolean) => {
    waiting.current = w;
    broadcast({ type: "wait", index: pos.current.index, step: pos.current.step, waiting: w });
  };

  const control: Omit<Registry, "register"> = {
    setStep: (st) => setPos(pos.current.index, st),
    lock: (on) => { navLock.current = on; },
    stop: () => { driver.current?.kill(); driver.current = null; },
    setHold: (h) => { hold.current = h; },
    setMedia: (m) => { media.current = m; sendState(); },
    isFollower,
    emit,
  };

  const nav = useRef({ next, prev, jumpTo, jumpMain, escBack, replayIntro, show, follow });
  nav.current = { next, prev, jumpTo, jumpMain, escBack, replayIntro, show, follow };

  useEffect(() => {
    sendState();
    history.replaceState(null, "", `#${scenes[index].id}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, step, returnTo, timers.current.startedAt, timers.current.speakerStartedAt]);

  /* ---------------------------------------------------------------- export API (§10) */

  useEffect(() => {
    const film = { on: false, base: 0, t: 0 };
    const api = {
      ready: () => started.current,
      ids: scenes.map((s) => s.id),
      titles: scenes.map((s) => s.title),
      notes: scenes.map((s) => s.notes),
      get steps() { return scenes.map((s) => stepsOf(tls.current[s.id]?.tl)); },
      appendix: scenes.map((s) => !!s.appendix),
      twoPage: scenes.map((s) => !!s.twoPage),
      /** export order: main scenes, then backup slides */
      order: [...MAIN, ...APPX],
      setExport: (on: boolean) => {
        deckRuntime.exporting = on;
        document.documentElement.classList.toggle("export-mode", on);
        if (on) { setNotes(false); setHelp(false); setPalette(false); setBlank(""); setLaser(false); setDrawing(false); setStrokes([]); }
        setExporting(on);
      },
      show: (i: number, k: number | "end") => nav.current.show(i, k),
      /** the "Appendix" divider page for the export; show() hides it again */
      divider: (on: boolean) => setDivider(on),
      /** scene host (world): the "map of the talk" overview, instant; null = no host */
      overview: (on: boolean) => { const h = sceneHost(); if (!h) return false; h.overview(on, true); return true; },
      hasOverview: () => !!sceneHost(),
      world: () => sceneHost()?.state() ?? null,
      state: () => ({ ...pos.current, waiting: waiting.current, busy: busy.current, returnTo: returnRef.current, ...ui.current }),
      /** creative dial and the planned forward transitions (into scene id → kind / through / reason) */
      style: deckStyle,
      transitions: [...PLANS].map(([i, p]) => ({ into: scenes[i].id, index: i, kind: p.kind, through: p.through?.sel ?? null, explicit: p.explicit, why: p.why })),
      lastTransition: () => ({ ...lastRun }),
      /** WebGL covers: on/off after the load-time benchmark, resolution step, ms per program */
      gl: () => shaderInfo(),
      /** filming aid (scripts/film_transitions.py): clock(t) stops the GSAP clock and moves it to t seconds after the
          first call, in 1/60 s frames; clock(null) gives the clock back (animations then catch up at once) */
      clock: (t: number | null) => {
        if (t === null) { if (film.on) { film.on = false; gsap.ticker.add(gsap.updateRoot); } return; }
        if (!film.on) { film.on = true; film.base = gsap.ticker.time; film.t = 0; gsap.ticker.remove(gsap.updateRoot); }
        while (film.t < t - 1e-6) { film.t = Math.min(t, film.t + 1 / 60); gsap.updateRoot(film.base + film.t); }
      },
    };
    (window as unknown as { __deck: typeof api }).__deck = api;
  }, []);

  /* ---------------------------------------------------------------- keys, mouse, wheel */

  useEffect(() => {
    const toggleFull = () => {
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      // keyboard lock keeps Esc for the deck in fullscreen (hold Esc to leave fullscreen)
      else document.documentElement.requestFullscreen?.()
        .then(() => (navigator as Navigator & { keyboard?: { lock?: (k: string[]) => Promise<void> } }).keyboard?.lock?.(["Escape"]))
        .catch(() => {});
    };
    const onKey = (e: KeyboardEvent) => {
      const u = ui.current;
      if (u.exporting || u.palette) return;
      const L = letter(e);
      if ((e.metaKey || e.ctrlKey) && L === "k" && !isFollower()) { e.preventDefault(); setPalette(true); return; }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (navLock.current) return;
      if (L === "f") { toggleFull(); return; }
      if (isFollower()) { if (e.key !== "Tab") e.preventDefault(); return; }
      const n = nav.current;

      // presenting tools first: they own Esc, Backspace and C while active
      if (u.drawing) {
        if (e.key === "Escape") { setDrawing(false); return; }
        if (e.key === "Backspace") { e.preventDefault(); setStrokes((s) => s.slice(0, -1)); return; }
        if (L === "c") { setStrokes([]); return; }
        if (L === "d") { setDrawing(false); return; }
      }
      if (u.blank) {
        e.preventDefault();
        if (L === "b") setBlank(u.blank === "black" ? "" : "black");
        else if (L === "w") setBlank(u.blank === "white" ? "" : "white");
        else if (isNext(e) || isPrev(e) || e.key === "Escape" || e.key === "Backspace") setBlank("");
        return; // a nav key only lifts the screen, it does not move the deck
      }
      // scene host keys (world: O overview; while in the overview it owns the nav keys)
      if (!u.help && sceneHost()?.key(e, L)) { e.preventDefault(); return; }
      if (e.key === "Escape") {
        if (u.help) setHelp(false);
        else n.escBack();
        return;
      }
      if (e.code === DECK.laserKey) { if (!e.repeat) setLaser(true); return; }
      if (isNext(e)) { e.preventDefault(); n.next({ skip: e.shiftKey }); return; }
      if (isPrev(e) || e.key === "Backspace") { e.preventDefault(); n.prev(); return; }
      if (e.key === "Home") { n.jumpMain(0); return; }
      if (e.key === "End") { n.jumpMain(MAIN.length - 1); return; }
      if (isHelp(e)) { setHelp((v) => !v); return; }
      if (isSearch(e)) { e.preventDefault(); setPalette(true); return; }
      const d = digit(e);
      if (d !== null && d > 0 && !e.shiftKey) { n.jumpMain(d - 1); return; }
      switch (L) {
        case "b": setBlank("black"); break;
        case "w": setBlank("white"); break;
        case "d": setDrawing(true); break;
        case "c": setStrokes([]); break;
        case "r": n.replayIntro(); emit("replay"); break;
        case "n": if (!REMOTE) setNotes((v) => !v); break;
        case "p": window.open(`${location.pathname}${new URLSearchParams(location.search).has("rehearse") ? "?rehearse" : ""}#presenter`, "deck-presenter", "width=1280,height=800"); break;
        case "t": if (DECK.darkTheme) document.documentElement.classList.toggle("dark"); break;
        case "h": setHelp((v) => !v); break;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => { if (e.code === DECK.laserKey) setLaser(false); };
    const onBlur = () => setLaser(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    // the mouse pointer hides after 2 s without moving
    let idle: ReturnType<typeof setTimeout> | undefined;
    const wake = () => {
      document.documentElement.classList.remove("cursor-idle");
      clearTimeout(idle);
      idle = setTimeout(() => document.documentElement.classList.add("cursor-idle"), 2000);
    };
    window.addEventListener("mousemove", wake);
    wake();

    // #<scene-id> typed into the address bar
    const onHash = () => {
      const i = scenes.findIndex((s) => s.id === location.hash.slice(1));
      if (i >= 0 && i !== pos.current.index) nav.current.jumpTo(i);
    };
    window.addEventListener("hashchange", onHash);

    // wheel / swipe: opt-in, with its OWN lock (not the transition's busy flag)
    let obs: Observer | undefined;
    if (DECK.wheel) {
      let wheelLock = false;
      const lockStep = (fn: () => void) => {
        if (wheelLock || navLock.current || isFollower() || ui.current.drawing || ui.current.palette) return;
        wheelLock = true;
        fn();
        setTimeout(() => { wheelLock = false; }, 750);
      };
      const fwd = () => lockStep(() => { nav.current.next(); });
      const back = () => lockStep(() => { nav.current.prev(); });
      obs = Observer.create({ target: window, type: "wheel,touch", tolerance: 12, preventDefault: true, onDown: fwd, onLeft: fwd, onUp: back, onRight: back });
    }
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("mousemove", wake);
      window.removeEventListener("hashchange", onHash);
      clearTimeout(idle);
      obs?.kill();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { document.documentElement.classList.toggle("drawing", drawing); }, [drawing]);
  // WebGL covers: one context, every program compiled once at load (showcase only; failure = overlay fallback)
  useEffect(() => { if (glCanvas.current && allow("shader")) initShaders(glCanvas.current, scaleRef.current); }, []);
  useEffect(() => { document.documentElement.classList.toggle("lasering", laser); }, [laser]);

  /* ---------------------------------------------------------------- render */

  const current = scenes[index];
  const tl = tls.current[current.id]?.tl;
  const steps = stepsOf(tl);
  const tools = !exporting;
  return (
    <RegistryCtx.Provider value={{ register, ...control }}>
      <div className="viewport">
        <div ref={stage} className="stage" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
          <ActiveIdCtx.Provider value={current.id}>
            <StepCtx.Provider value={step}>
              <SceneList />
            </StepCtx.Provider>
          </ActiveIdCtx.Provider>
          <Footer scene={current} index={index} step={step} steps={steps} tl={tl} onWait={onWait}
            moving={() => !!driver.current?.isActive() || busy.current} returnTo={returnTo} hidden={!!current.full} />
          {SHOW_NAMES && !current.full && <SpeakerChips scene={current} />}
          <div ref={plate} className="absolute inset-0 pointer-events-none" style={{ visibility: "hidden" }} aria-hidden />
          <TransitionLayer ref={layer} />
          {allow("shader") && <canvas ref={glCanvas} className="absolute left-0 top-0 pointer-events-none" width={16} height={9}
            style={{ width: 1920, height: 1080, zIndex: 41, visibility: "hidden" }} aria-hidden />}
          <div ref={sharedLayer} className="absolute inset-0 pointer-events-none" style={{ zIndex: 45 }} aria-hidden />
          {divider && <Divider count={APPX.length} />}
          {tools && <DrawLayer on={drawing} strokes={strokes} onStroke={(s) => setStrokes((v) => [...v, s])} stage={stage} />}
          {tools && <Laser on={laser} stage={stage} />}
          {notes && !exporting && <NotesPanel scene={current} step={step} startedAt={timers.current.startedAt} speakerStartedAt={timers.current.speakerStartedAt} />}
          {help && <HelpPanel onClose={() => setHelp(false)} />}
          {palette && (
            <Palette current={index} onClose={() => setPalette(false)}
              onPick={(i) => { setPalette(false); nav.current.jumpTo(i); }} />
          )}
        </div>
      </div>
      {tools && <BlankScreen mode={blank} />}
    </RegistryCtx.Provider>
  );
}

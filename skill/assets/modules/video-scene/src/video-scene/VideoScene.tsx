import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { gsap } from "gsap";
import { SceneRoot, deckRuntime, useDeckControl, useScene, useSceneActive } from "./engine";
import type { Hold } from "./engine";
import { clock, coverRadius, insetOf, stageRectOf, videoToStage, STAGE, type Rect } from "./geometry";
import { isExportMode, prefersReducedMotion, useExportMode } from "./exportMode";
import "./video-scene.css";

/* ------------------------------------------------------------------ config */

export type Chapter = { t: number; title: string };

/** The mark builds on the backdrop, a hole opens into the video's first frame, the mark flies onto the logo in the video. */
export type MorphIntro = {
  kind: "morph";
  /** The mark as it looks on the dark backdrop (fills its box; an <svg> with a viewBox or an <img>). */
  mark: ReactNode;
  /** Optional: the mark as it looks INSIDE the video (other colours). Cross-fades in while the mark flies. */
  markLanded?: ReactNode;
  /** The logo's rect in VIDEO pixels, measured on the frame at `startAt` (tools/measure-rect.py). */
  target: Rect;
  /** Where the mark is built, in stage pixels. Default: a 260 px wide box in the middle, a little above centre. */
  from?: Rect;
  /**
   * What the hole opens into. "video" (default) = the paused video frame at `startAt`; use it when that frame has
   * no logo yet. Otherwise a CSS background of a still WITHOUT the logo (`url(${still})` or a colour), so the logo
   * is not doubled while the mark flies.
   */
  reveal?: "video" | string;
  /** Custom build of the mark (e.g. DrawSVG strokes). Add tweens to `tl` from `at`, return the end time. */
  buildMark?: (tl: gsap.core.Timeline, markEl: HTMLElement, at: number) => number;
  /** Extra elements positioned in stage px (a wordmark next to the logo). Fade in after landing, out first in the outro. */
  lockup?: ReactNode;
  /** Small caps line under the mark while it builds ("Demo · sound on"). */
  eyebrow?: string;
};
/** The video opens from a card of the previous scene (container transform). */
export type CardIntro = { kind: "card"; /** a selector of the card in the previous scene, or its rect in stage px */ from: string | Rect; radius?: number };
/** The backdrop with an optional title fades away into the video. */
export type FadeIntro = { kind: "fade"; eyebrow?: string; title?: string };

export type VideoSceneProps = {
  /** URL of the video RELATIVE TO THE HTML (e.g. "media/demo.mp4", put in public/media/). Never import it. */
  src: string;
  /** Poster image (import it: it is small and gets inlined, so export and the fallback work without media/). */
  poster?: string;
  chapters?: Chapter[];
  /** Pixel size of the video file (needed before it loads, for the morph target). Default 1920×1080. */
  videoSize?: { w: number; h: number };
  /** How the video fills the 1920×1080 stage. Default "cover". */
  fit?: "cover" | "contain";
  /** Duration in seconds, shown until the metadata arrives. */
  duration?: number;
  /** Video time where playback starts (the frame the intro lands on). Default 0. */
  startAt?: number;
  /** Default { kind: "fade" }. Reduced motion always uses a short fade. */
  intro?: MorphIntro | CardIntro | FadeIntro;
  /** The intro played backwards. `at` = video time where it starts (default: at the end). `text` shows after it. false = none. */
  outro?: false | { at?: number; text?: string };
  /** Music: fade in after the handoff, fade out in the outro. false = play muted. */
  audio?: false | { volume?: number; fadeIn?: number; fadeOut?: number };
  /** Next asks once and skips on the second press (default true). false = Next skips at once. */
  skipConfirm?: boolean;
  /** Player keys (KeyboardEvent.code, so any keyboard layout works). Default K pause, J/L previous/next chapter. */
  keys?: { toggle?: string; prevChapter?: string; nextChapter?: string };
  /** UI strings (the module has no language of its own). */
  labels?: Partial<typeof LABELS>;
};

const LABELS = {
  skipAsk: "Press Next again to skip the video",
  paused: "Paused",
  soundOff: "Sound is off: press Next or K for sound",
  clickToPlay: "Press Next or K to play",
  missingTitle: "The video file was not found",
  missingHint: "Keep the media folder next to the HTML file. Press Next to continue.",
  chapters: "Chapters",
  videoEyebrow: "Video",
  playsLive: "Plays in the live deck",
};

/* ------------------------------------------------------------------ icons (no icon package needed) */

const PlayIcon = () => <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5Z" /></svg>;
const PauseIcon = () => <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><rect x="5" y="4" width="5" height="16" rx="1.2" /><rect x="14" y="4" width="5" height="16" rx="1.2" /></svg>;

/* ------------------------------------------------------------------ component */

export function VideoScene(props: VideoSceneProps) {
  const {
    src, poster, videoSize = { w: 1920, h: 1080 }, fit = "cover", startAt = 0, skipConfirm = true,
  } = props;
  const chapters = useMemo(() => (props.chapters?.length ? [...props.chapters].sort((a, b) => a.t - b.t) : [{ t: 0, title: "" }]), [props.chapters]);
  const L = { ...LABELS, ...props.labels };
  const reduced = prefersReducedMotion();
  const intro = reduced ? ({ kind: "fade" } as FadeIntro) : props.intro ?? ({ kind: "fade" } as FadeIntro);
  const outroCfg = props.outro === false ? null : props.outro ?? {};
  const audio = props.audio === false ? null : { volume: 0.9, fadeIn: 1.6, fadeOut: 2.4, ...props.audio };

  const video = useRef<HTMLVideoElement>(null);
  const hud = useRef<HTMLDivElement>(null);
  const active = useSceneActive();
  const exporting = useExportMode();
  const { setHold, setMedia, isFollower, emit } = useDeckControl();

  // playback state that event handlers read (refs) and that the UI shows (state)
  const activeRef = useRef(false);
  activeRef.current = active;
  const started = useRef(false);          // the intro handed over to the video
  const outro = useRef<gsap.core.Timeline | null>(null);
  const outroDone = useRef(false);
  const askedSkip = useRef(0);
  const autoMuted = useRef(false);        // autoplay with sound was refused; muted until the next gesture
  const failedRef = useRef(false);
  const [t, setT] = useState(startAt);
  const [dur, setDur] = useState(props.duration ?? 0);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [muted, setMuted] = useState(false);
  const [blocked, setBlocked] = useState(false); // even muted autoplay was refused: show a big play button
  const [failed, setFailed] = useState(false);
  const [toast, setToast] = useState("");
  const [hoverT, setHoverT] = useState<number | null>(null);

  const chapterAt = (s: number) => {
    let i = 0;
    chapters.forEach((c, k) => { if (s >= c.t - 0.05) i = k; });
    return i;
  };
  const duration = () => {
    const d = video.current?.duration;
    return d && Number.isFinite(d) ? d : dur || props.duration || 1;
  };
  const outroAt = () => (outroCfg ? outroCfg.at ?? duration() : Infinity);

  /* ---------------- geometry of the intro (stage px) */
  const geo = useMemo(() => {
    if (intro.kind !== "morph") return null;
    const T = videoToStage(intro.target, videoSize, fit);
    const fw = intro.from?.w ?? 260;
    const F = intro.from ?? { x: STAGE.w / 2 - fw / 2, y: STAGE.h / 2 - 40 - (fw * T.h) / T.w / 2, w: fw, h: (fw * T.h) / T.w };
    const fcx = F.x + F.w / 2, fcy = F.y + F.h / 2;
    return {
      T, fcx, fcy, R: coverRadius(fcx, fcy),
      start: { x: fcx - (T.x + T.w / 2), y: fcy - (T.y + T.h / 2), scale: F.w / T.w },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- sound */
  const fadeTo = (v: number, d: number, then?: () => void) => {
    const el = video.current;
    if (!el) return;
    if (!audio) { el.muted = true; then?.(); return; }
    gsap.to(el, { volume: v, duration: d, ease: "power1.inOut", overwrite: true, onComplete: then });
  };
  const unmute = () => {
    const el = video.current;
    if (!el || !autoMuted.current) return;
    autoMuted.current = false;
    setMuted(false);
    el.muted = false;
    fadeTo(audio?.volume ?? 0, 0.6);
  };
  const play = (fade = 0.4) => {
    const el = video.current;
    if (!el) return;
    setBlocked(false);
    el.play().then(() => { if (!el.muted) fadeTo(audio?.volume ?? 0, fade); }).catch((err: DOMException) => {
      if (failedRef.current || err?.name === "AbortError") return;
      // autoplay with sound was refused (no user gesture on the page yet): play muted, the next key press unmutes
      if (!el.muted) {
        el.muted = true;
        autoMuted.current = true;
        setMuted(true);
        say(L.soundOff, 4000);
        el.play().catch(() => { setBlocked(true); say(L.clickToPlay, 6000); });
      } else {
        setBlocked(true);
        say(L.clickToPlay, 6000);
      }
    });
  };

  /* ---------------- HUD and toast */
  const hudHover = useRef(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const showHud = (ms = 2600) => {
    if (!hud.current || !started.current || failedRef.current || outro.current || isExportMode()) return;
    gsap.to(hud.current, { autoAlpha: 1, y: 0, duration: 0.3, overwrite: true });
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (hudHover.current) return showHud(ms);
      if (hud.current && video.current && !video.current.paused) gsap.to(hud.current, { autoAlpha: 0, y: 12, duration: 0.5 });
    }, ms);
  };
  const hideHud = () => { clearTimeout(hideTimer.current); if (hud.current) gsap.to(hud.current, { autoAlpha: 0, duration: 0.3, overwrite: true }); };
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const say = (msg: string, ms = 2600) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    if (msg) toastTimer.current = setTimeout(() => setToast(""), ms);
  };

  /* ---------------- media state for the presenter view and the phones */
  const lastSent = useRef(0);
  const report = (force = false) => {
    const el = video.current;
    if (!el || !activeRef.current) return;
    const now = Date.now();
    if (!force && now - lastSent.current < 900) return;
    lastSent.current = now;
    setMedia({
      playing: !el.paused && !el.ended, t: el.currentTime, dur: duration(),
      chapter: chapters[chapterAt(el.currentTime)].title, ended: outroDone.current,
    });
  };

  /* ---------------- the handoff from the intro */
  const start = () => {
    const el = video.current;
    // only when the deck plays this scene: never while it seeks (Back into the scene, __deck.show), exports or prints
    if (!el || started.current || !activeRef.current || isExportMode()) return;
    if (deckRuntime.seeking || deckRuntime.exporting || deckRuntime.print) return;
    started.current = true;
    if (failedRef.current) return;
    el.muted = !audio;
    el.volume = 0;
    play(audio?.fadeIn ?? 0);
  };

  /* ---------------- controls */
  const markEnded = () => {
    outroDone.current = true;
    setEnded(true);
    setPlaying(false);
    hideHud();
    report(true);
  };
  const toggle = () => {
    const el = video.current;
    if (!el || failedRef.current || outro.current) return;
    if (autoMuted.current && !el.paused) { unmute(); return; }
    if (outroDone.current || el.ended) { leaveOutro(); el.currentTime = startAt; }
    started.current = true;
    if (el.paused) { play(0.4); say(""); }
    else { fadeTo(0, 0.25, () => el.pause()); say(L.paused); }
    showHud();
  };
  const seek = (to: number) => {
    const el = video.current;
    if (!el || failedRef.current) return;
    if ((outro.current || outroDone.current) && to < outroAt() - 0.3) leaveOutro();
    el.currentTime = Math.max(0, Math.min(to, duration() - 0.2));
    setT(el.currentTime);
    started.current = true;
    if (el.paused) play(0.3);
    showHud();
    report(true);
  };
  const skip = () => {
    const el = video.current;
    if (!el || failedRef.current || outro.current || outroDone.current) return;
    if (outroCfg) {
      el.currentTime = Math.min(outroAt(), duration() - 0.15);
      playOutro();
    } else {
      fadeTo(0, 0.3, () => el.pause());
      el.currentTime = Math.max(0, duration() - 0.05);
      markEnded();
    }
  };
  const chapterStep = (dir: 1 | -1) => {
    const el = video.current;
    if (!el) return null;
    const i = chapterAt(el.currentTime);
    if (dir > 0) return i < chapters.length - 1 ? chapters[i + 1] : null;
    // back: to the start of this chapter if we are more than 2 s into it, otherwise the previous one
    return el.currentTime - chapters[i].t > 2 ? chapters[i] : chapters[Math.max(0, i - 1)];
  };

  /* ---------------- outro: the intro played backwards */
  const root = () => video.current?.closest(".vs-root") as HTMLElement | null;
  /** Outro layers back to how they look at label s0 (the outro is not part of the scene timeline). */
  const clearOutroVisuals = () => {
    const r = root();
    if (!r) return;
    const $ = (s: string) => Array.from(r.querySelectorAll(s));
    gsap.killTweensOf([...$(".vs-intro"), ...$(".vs-outtext"), ...$(".vs-frame"), ...$(".vs-bgfill")]);
    gsap.set($(".vs-outtext"), { autoAlpha: 0 });
    if (intro.kind === "card") {
      gsap.set($(".vs-frame"), { clipPath: insetOf({ x: 0, y: 0, ...STAGE }, 0) });
      gsap.set($(".vs-bgfill"), { opacity: 0 });
    } else {
      gsap.set($(".vs-intro"), { autoAlpha: 0 });
    }
  };
  const leaveOutro = () => {
    const r = root();
    outro.current?.kill();
    outro.current = null;
    outroDone.current = false;
    setEnded(false);
    if (!r) return;
    const $ = (s: string) => Array.from(r.querySelectorAll(s));
    gsap.to([...$(".vs-intro"), ...$(".vs-outtext")], { autoAlpha: 0, duration: 0.3 });
    if (intro.kind === "card") {
      gsap.to($(".vs-frame"), { clipPath: insetOf({ x: 0, y: 0, ...STAGE }, 0), duration: 0.5, ease: "power2.inOut" });
    }
  };
  const playOutro = () => {
    const el = video.current, r = root();
    if (!el || !r || outro.current) return;
    const $ = (s: string) => Array.from(r.querySelectorAll(s));
    hideHud();
    setToast("");
    const tl = gsap.timeline({ onComplete: () => { outro.current = null; markEnded(); } });
    outro.current = tl;
    tl.call(() => fadeTo(0, audio?.fadeOut ?? 0.5, () => el.pause()), [], 0);
    let end = 0.6;
    if (intro.kind === "morph" && geo) {
      tl.set($(".vs-eyebrow"), { autoAlpha: 0 }, 0)
        .set($(".vs-intro-bg"), { "--vs-hole": `${geo.R}px` }, 0)
        .set($(".vs-markbox"), { x: 0, y: 0, scale: 1 }, 0)
        .set($(".vs-mark-landed"), { opacity: 1 }, 0)
        .set($(".vs-lockup"), { x: 0, autoAlpha: 1 }, 0)
        .fromTo($(".vs-intro"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6, ease: "none" }, 0)
        .to($(".vs-lockup"), { x: -16, autoAlpha: 0, duration: 0.45, ease: "power2.in" }, 0.9);
      end = openMorph(tl, 1.2, -1) + 0.1;
    } else if (intro.kind === "card") {
      tl.to($(".vs-bgfill"), { opacity: 1, duration: 0.6 }, 0)
        .fromTo($(".vs-frame"), { clipPath: insetOf({ x: 0, y: 0, ...STAGE }, 0) },
          { clipPath: () => insetOf(cardRect(), cardRadius()), duration: 1.0, ease: "power3.inOut" }, 0.5);
      end = 1.6;
    } else {
      tl.set($(".vs-fade-eyebrow"), { autoAlpha: 0 }, 0).set($(".vs-title"), { autoAlpha: 0 }, 0)
        .fromTo($(".vs-intro"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 1.0, ease: "none" }, 0.2);
      end = 1.2;
    }
    if (outroCfg?.text && intro.kind === "card") {
      const c = cardRect();
      gsap.set($(".vs-outtext"), { left: c.x, right: "auto", width: c.w, top: Math.min(c.y + c.h + 32, STAGE.h - 80) });
    }
    if (outroCfg?.text) tl.fromTo($(".vs-outtext"), { y: 12, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.5 }, end);
  };

  /* ---------------- morph: the hole opens and the mark flies (dir -1 = backwards, for the outro) */
  function openMorph(tl: gsap.core.Timeline, at: number, dir: 1 | -1, q?: (s: string) => Element[]) {
    if (!geo) return at;
    const pick = (s: string) => (q ? q(s) : root()?.querySelectorAll(s) ?? []);
    const D = 1.1;
    const closed = { "--vs-hole": "0px" }, open = { "--vs-hole": `${geo.R}px` };
    const away = geo.start, home = { x: 0, y: 0, scale: 1 };
    const [h0, h1] = dir > 0 ? [closed, open] : [open, closed];
    const [m0, m1] = dir > 0 ? [away, home] : [home, away];
    tl.fromTo(pick(".vs-intro-bg"), h0, { ...h1, duration: D, ease: "power3.inOut", immediateRender: false }, at)
      .fromTo(pick(".vs-markbox"), m0, { ...m1, duration: D, ease: "power3.inOut", immediateRender: false }, at + 0.05)
      .fromTo(pick(".vs-mark-landed"), { opacity: dir > 0 ? 0 : 1 }, { opacity: dir > 0 ? 1 : 0, duration: 0.7, immediateRender: false }, at + 0.2);
    if (dir < 0) tl.fromTo(pick(".vs-ping"), { scale: 1, opacity: 0.9 }, { scale: 1.9, opacity: 0, duration: 0.9, ease: "power2.out", immediateRender: false }, at + D);
    return at + D + 0.05;
  }

  /* ---------------- card: the rect of the card in the previous scene */
  const cardRect = (): Rect => {
    if (intro.kind !== "card") return { x: 0, y: 0, ...STAGE };
    if (typeof intro.from !== "string") return intro.from;
    const own = root();
    const el = Array.from(document.querySelectorAll<HTMLElement>(intro.from)).find((e) => !own?.contains(e));
    return el ? stageRectOf(el) : { x: 480, y: 270, w: 960, h: 540 };
  };
  const cardRadius = () => {
    if (intro.kind !== "card") return 0;
    if (intro.radius !== undefined) return intro.radius;
    if (typeof intro.from === "string") {
      const el = document.querySelector<HTMLElement>(intro.from);
      if (el) return parseFloat(getComputedStyle(el).borderTopLeftRadius) || 24;
    }
    return 24;
  };

  /* ---------------- the scene timeline: entrance until s0, export page 2 after it */
  const sceneRef = useScene((tl, q) => {
    const one = (s: string) => q(s);
    let cardTween: gsap.core.Tween | null = null;
    // reset each time the scene is entered from the start
    tl.call(() => {
      const el = video.current;
      if (!el) return;
      outro.current?.kill();
      outro.current = null;
      outroDone.current = false;
      started.current = false;
      askedSkip.current = 0;
      autoMuted.current = false;
      gsap.killTweensOf(el);
      el.pause();
      el.muted = !audio;
      try { el.currentTime = startAt; } catch { /* not loaded yet: the start position is set below */ }
      gsap.set(one(".vs-outtext"), { autoAlpha: 0 });
      if (intro.kind === "card") gsap.set(one(".vs-bgfill"), { opacity: 0 });
      cardTween?.invalidate();
      setEnded(false); setMuted(false); setBlocked(false); setToast("");
      if (hud.current) gsap.set(hud.current, { autoAlpha: 0 });
    }, [], 0.01);

    let handoff = 0.6;
    if (intro.kind === "morph" && geo) {
      const markEl = one(".vs-mark")[0] as HTMLElement;
      gsap.set(one(".vs-markbox"), geo.start);
      gsap.set(one(".vs-intro-bg"), { "--vs-hole": "0px" });
      const defaultBuild = (at: number) => {
        // default: the mark pops in with a ring; pass buildMark for a real build (DrawSVG strokes and so on)
        tl.fromTo(markEl, { scale: 0.5, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.7, ease: "back.out(1.7)" }, at)
          .fromTo(one(".vs-ping"), { scale: 1, opacity: 0.9 }, { scale: 1.9, opacity: 0, duration: 0.9, ease: "power2.out", immediateRender: false }, at + 0.5);
        return at + 1.0;
      };
      const built = intro.buildMark ? intro.buildMark(tl, markEl, 0.25) : defaultBuild(0.25);
      if (intro.eyebrow) {
        tl.fromTo(one(".vs-eyebrow"), { y: 16, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.5 }, 0.5)
          .to(one(".vs-eyebrow"), { y: -10, autoAlpha: 0, duration: 0.35 }, built + 0.1);
      }
      const landed = openMorph(tl, built + 0.25, 1, one);
      if (intro.lockup) tl.fromTo(one(".vs-lockup"), { x: -16, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.5, ease: "power2.out" }, landed);
      handoff = landed + (intro.lockup ? 0.7 : 0.3);
    } else if (intro.kind === "card") {
      cardTween = gsap.fromTo(one(".vs-frame"), { clipPath: () => insetOf(cardRect(), cardRadius()) },
        { clipPath: insetOf({ x: 0, y: 0, ...STAGE }, 0), duration: 0.9, ease: "power3.inOut" });
      tl.add(cardTween, 0.05);
      handoff = 1.0;
    } else {
      const title = one(".vs-title"), eb = one(".vs-fade-eyebrow");
      if (eb.length) tl.fromTo(eb, { y: 14, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.5 }, 0.15);
      if (title.length) tl.fromTo(title, { y: 24, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.6 }, 0.25);
      handoff = title.length || eb.length ? 1.6 : 0.3;
    }
    // the video takes over on the same frame, then the music fades in
    tl.call(start, [], handoff);
    if (intro.kind !== "card") tl.fromTo(one(".vs-intro"), { autoAlpha: 1 }, { autoAlpha: 0, duration: intro.kind === "fade" ? 0.6 : 0.4, ease: "none", immediateRender: false }, handoff + 0.1);
    tl.addLabel("s0", handoff + 0.7);
    // export / print page 2 (only reached by __deck.show(i, "end") or tl.progress(1), never in a live talk)
    tl.fromTo(one(".vs-chapters"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.05, immediateRender: false }, "s0+=0.05");
  });

  /* ---------------- the deck's Next and Back while this scene is on screen */
  const api = useRef({} as Required<Hold>);
  api.current = {
    next: () => {
      const el = video.current;
      if (!el || failedRef.current || isExportMode()) return false;
      if (blocked) { started.current = true; play(audio?.fadeIn ?? 0); return true; }
      if (!started.current) return false;      // still in the intro (deck finishes it), or came back with Back
      if (outro.current) return true;          // the outro is playing: let it finish
      if (outroDone.current) return false;     // done: the deck goes on
      if (autoMuted.current) { unmute(); return true; }
      // followers follow the lead's state, not its key presses: send the media command itself
      if (!skipConfirm || Date.now() - askedSkip.current < 2600) { askedSkip.current = 0; skip(); emit("media-skip"); return true; }
      askedSkip.current = Date.now();
      say(L.skipAsk);
      showHud();
      return true;
    },
    prev: () => {
      const el = video.current;
      if (!el || failedRef.current || !started.current || outroDone.current) return false;
      const c = chapterStep(-1);
      if (!c) return false;
      seek(c.t);
      if (c.title) say(c.title);
      emit("media-seek", { t: c.t });
      return true;
    },
    toggle: () => toggle(),
    skip: () => skip(),
    seek: (to: number) => { seek(to); const c = chapters[chapterAt(to)]; if (c.title) say(c.title); },
  };
  useEffect(() => {
    if (!active || exporting) return;
    setHold({
      next: () => api.current.next(), prev: () => api.current.prev(),
      toggle: () => api.current.toggle(), skip: () => api.current.skip(), seek: (s: number) => api.current.seek(s),
    });
    return () => setHold(null);
  }, [active, exporting, setHold]);

  /* ---------------- leaving the scene: stop the sound, release the deck */
  const wasActive = useRef(false);
  useEffect(() => {
    const el = video.current;
    if (wasActive.current && !active && el) {
      if (!el.paused) fadeTo(0, 0.4, () => el.pause());
      if (outro.current) { outro.current.progress(1); }
      started.current = false;
      clearTimeout(hideTimer.current);
      if (hud.current) gsap.set(hud.current, { autoAlpha: 0 });
      setToast("");
      setMedia(null);
    }
    wasActive.current = active;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // export: never play, whatever the timeline calls
  useEffect(() => {
    const el = video.current;
    if (!exporting || !el) return;
    gsap.killTweensOf(el);
    el.pause();
    if (outro.current || outroDone.current) {
      outro.current?.kill();
      outro.current = null;
      outroDone.current = false;
      started.current = false;
      setEnded(false);
      clearOutroVisuals();
    }
    hideHud();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exporting]);

  /* ---------------- keys of the player itself (layout independent): K pause, J and L chapters */
  const keys = { toggle: "KeyK", prevChapter: "KeyJ", nextChapter: "KeyL", ...props.keys };
  useEffect(() => {
    if (!active || exporting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isFollower() || failedRef.current) return;
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tgt.tagName))) return; // typing in a search box
      const el = video.current;
      if (!el) return;
      const own = () => { e.preventDefault(); e.stopImmediatePropagation(); }; // the deck's own use of the key (laser on L) waits
      if (e.code === keys.toggle) {
        if (!started.current && !el.paused) return;
        own();
        if (e.repeat) return;
        toggle();
        emit("media-toggle");
      } else if ((e.code === keys.nextChapter || e.code === keys.prevChapter) && started.current) {
        own();
        if (e.repeat) return;
        const c = chapterStep(e.code === keys.nextChapter ? 1 : -1);
        if (!c) return;
        seek(c.t);
        if (c.title) say(c.title);
        emit("media-seek", { t: c.t });
      }
    };
    const onMove = () => showHud();
    // the first click anywhere is a user gesture: it may unmute a video that autoplay muted
    const onDown = () => unmute();
    // capture phase: runs before the deck's key handler, so a player key is not also a deck key
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("pointerdown", onDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, exporting]);

  /* ---------------- video events */
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    const onTime = () => {
      setT(el.currentTime);
      if (activeRef.current && started.current && !outro.current && !outroDone.current && outroCfg && el.currentTime >= outroAt() - 0.02 && outroCfg.at !== undefined) playOutro();
      report();
    };
    const onPlay = () => { setPlaying(true); report(true); };
    const onPause = () => {
      setPlaying(false);
      report(true);
      if (started.current && !outro.current && !outroDone.current && activeRef.current) {
        clearTimeout(hideTimer.current);
        if (hud.current) gsap.to(hud.current, { autoAlpha: 1, y: 0, duration: 0.3 });
      }
    };
    const onEnd = () => {
      setPlaying(false);
      if (!activeRef.current || outro.current || outroDone.current) return;
      if (outroCfg) playOutro(); else markEnded();
    };
    const onMeta = () => { setDur(el.duration); if (el.currentTime < startAt && !started.current) el.currentTime = startAt; };
    const onError = () => {
      failedRef.current = true;
      setFailed(true);
      hideHud();
      report(true);
    };
    const onLoaded = () => { if (failedRef.current) { failedRef.current = false; setFailed(false); } };
    if (el.error) onError();
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnd);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("error", onError);
    el.addEventListener("loadeddata", onLoaded);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnd);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("error", onError);
      el.removeEventListener("loadeddata", onLoaded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- scrubbing on the bar */
  const bar = useRef<HTMLDivElement>(null);
  const timeAt = (clientX: number) => {
    const r = bar.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * duration();
  };
  const jumpTo = (to: number) => {
    if (isFollower() || !started.current) return;
    seek(to);
    const c = chapters[chapterAt(to)];
    if (c.title) say(c.title);
    emit("media-seek", { t: to });
  };
  const onScrub = (e: React.PointerEvent) => {
    const el = video.current;
    if (!el || isFollower() || !started.current) return;
    e.preventDefault();
    e.stopPropagation();
    const move = (ev: PointerEvent) => { const to = timeAt(ev.clientX); el.currentTime = to; setT(to); setHoverT(to); };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      jumpTo(timeAt(ev.clientX));
    };
    move(e.nativeEvent);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  /* ---------------- render */
  const D = duration();
  const i = chapterAt(t);
  const pct = (s: number) => `${Math.max(0, Math.min(1, s / D)) * 100}%`;
  const expected = useMemo(() => {
    try { return decodeURI(new URL(src, typeof document !== "undefined" ? document.baseURI : "file:///").href); } catch { return src; }
  }, [src]);
  const cls = ["vs-root", `vs-kind-${intro.kind}`, exporting && "vs-export", failed && "vs-failed", !exporting && !failed && dur === 0 && "vs-waiting"].filter(Boolean).join(" ");

  return (
    <SceneRoot ref={sceneRef} className={`vs-scene vs-scene-${intro.kind}`}>
      <div className={cls}>
        <div className="vs-bgfill" />
        <div className="vs-frame" onClick={() => { if (!started.current || isFollower() || failedRef.current) return; toggle(); emit("media-toggle"); }}>
          <video ref={video} className="vs-video" src={src} poster={poster} preload={exporting ? "metadata" : "auto"} playsInline
            style={{ objectFit: fit }} />
          {poster && <img className="vs-poster" src={poster} alt="" aria-hidden style={{ objectFit: fit }} />}
          {failed && (
            <div className="vs-fallback">
              <div className="vs-fallback-card">
                {poster ? <img className="vs-fallback-thumb" src={poster} alt="" /> : <div className="vs-fallback-thumb" />}
                <div>
                  <h3>{L.missingTitle}</h3>
                  <p>{L.missingHint}</p>
                  <p><code>{expected}</code></p>
                </div>
              </div>
            </div>
          )}
          {blocked && !failed && (
            <button className="vs-bigplay" aria-label="Play" onClick={(e) => { e.stopPropagation(); if (isFollower()) return; started.current = true; play(audio?.fadeIn ?? 0); emit("media-toggle"); }}>
              <PlayIcon />
            </button>
          )}
        </div>

        {/* intro / outro layer */}
        {intro.kind !== "card" && (
          <div className="vs-intro">
            {intro.kind === "morph" && intro.reveal && intro.reveal !== "video" && <div className="vs-reveal" style={{ background: intro.reveal, backgroundSize: "cover" }} />}
            <div className="vs-intro-bg" style={intro.kind === "morph" && geo ? {
              WebkitMaskImage: `radial-gradient(circle at ${geo.fcx}px ${geo.fcy}px, transparent var(--vs-hole), #000 calc(var(--vs-hole) + 1px))`,
              maskImage: `radial-gradient(circle at ${geo.fcx}px ${geo.fcy}px, transparent var(--vs-hole), #000 calc(var(--vs-hole) + 1px))`,
            } as React.CSSProperties : undefined} />
            {intro.kind === "morph" && geo && (
              <>
                <div className="vs-markbox" style={{ left: geo.T.x, top: geo.T.y, width: geo.T.w, height: geo.T.h }}>
                  <span className="vs-ping" />
                  <div className="vs-mark">{intro.mark}</div>
                  {intro.markLanded && <div className="vs-mark-landed" style={{ opacity: 0 }}>{intro.markLanded}</div>}
                </div>
                {intro.lockup && <div className="vs-lockup" style={{ position: "absolute", inset: 0, pointerEvents: "none", visibility: "hidden" }}>{intro.lockup}</div>}
                {intro.eyebrow && <span className="vs-eyebrow" style={{ visibility: "hidden" }}>{intro.eyebrow}</span>}
              </>
            )}
            {intro.kind === "fade" && intro.eyebrow && <span className="vs-eyebrow vs-fade-eyebrow">{intro.eyebrow}</span>}
            {intro.kind === "fade" && intro.title && <div className="vs-title">{intro.title}</div>}
          </div>
        )}
        {outroCfg?.text && <span className="vs-outtext" style={{ visibility: "hidden" }}>{outroCfg.text}</span>}

        {/* export / print page 2: what is in the video */}
        <div className="vs-chapters">
          <div className="vs-chapters-card">
            <div className="vs-chapters-eyebrow">{L.videoEyebrow} · {clock(D)}</div>
            <h2 className="vs-chapters-title">{L.chapters}</h2>
            <ol>
              {chapters.map((c, k) => <li key={k}><span>{clock(c.t)}</span>{c.title || "—"}</li>)}
            </ol>
            <div className="vs-chapters-src">{src} · {L.playsLive}</div>
          </div>
        </div>

        {/* player bar */}
        <div ref={hud} className="vs-hud" onPointerEnter={() => { hudHover.current = true; }} onPointerLeave={() => { hudHover.current = false; }}>
          <div className="vs-row">
            <span className="vs-row-left">
              <button className="vs-btn" aria-label={playing ? "Pause" : "Play"} onClick={() => { if (isFollower()) return; toggle(); emit("media-toggle"); }}>
                {playing ? <PauseIcon /> : <PlayIcon />}
              </button>
              {chapters.length > 1 && <span className="vs-chnum">{String(i + 1).padStart(2, "0")}</span>}
              <span className="vs-chname">{chapters[i].title}</span>
              {!playing && !ended && <span className="vs-flag">· {L.paused.toUpperCase()}</span>}
              {muted && <span className="vs-flag">· MUTED</span>}
            </span>
            <span className="vs-time">{clock(t)} / {clock(D)}</span>
          </div>
          <div className="vs-scrub" ref={bar} onPointerDown={onScrub} onPointerMove={(e) => setHoverT(timeAt(e.clientX))} onPointerLeave={() => setHoverT(null)}>
            <div className="vs-track">
              <div className="vs-fill" style={{ width: pct(t) }} />
              {chapters.slice(1).map((c, k) => <span key={k} className={`vs-tick ${t >= c.t ? "on" : ""}`} style={{ left: pct(c.t) }} />)}
              <span className="vs-knob" style={{ left: pct(t) }} />
              {hoverT !== null && <span className="vs-hover" style={{ left: pct(hoverT) }}>{clock(hoverT)}{chapters[chapterAt(hoverT)].title ? ` · ${chapters[chapterAt(hoverT)].title}` : ""}</span>}
            </div>
          </div>
          {chapters.length > 1 && (
            <div className="vs-chips">
              {chapters.map((c, k) => (
                <button key={k} className={`vs-chip ${k === i ? "on" : ""}`} style={{ left: pct(c.t) }} onClick={() => jumpTo(c.t)}>{c.title}</button>
              ))}
            </div>
          )}
        </div>
        {toast && !exporting && <div className="vs-toast">{toast}</div>}
      </div>
    </SceneRoot>
  );
}

/** Same thing as a scene component: `export const Demo = makeVideoScene({...})`. */
export function makeVideoScene(config: VideoSceneProps) {
  const Scene = () => <VideoScene {...config} />;
  Scene.displayName = "VideoScene";
  return Scene;
}

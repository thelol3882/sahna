import { useEffect, useRef, useState } from "react";
import { gsap, useGSAP } from "../gsap";
import type { SceneDef } from "./types";
import { DECK } from "./config";
import { slideNo, fmt, labelTime, MAIN, nameOf, partOf } from "./util";
import { voice } from "./remote-client";

/**
 * Step bars (§3): one per part (entrance + each step), filled in real time from the timeline.
 * When the current part is done, the next bar pulses (or the → chip after the last step): the deck waits for a press.
 * Fills get their transform inline only — never a Tailwind scale-* class (it sets `scale`, which wins over transform).
 */
export function StepBars({ tl, steps, step, onWait, moving }: { tl?: gsap.core.Timeline; steps: number; step: number; onWait: (w: boolean) => void; moving?: () => boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const cue = useRef<HTMLSpanElement>(null);
  const waitCb = useRef(onWait);
  waitCb.current = onWait;
  const movingCb = useRef(moving);
  movingCb.current = moving;
  useEffect(() => {
    if (!tl || !ref.current) return;
    const tracks = Array.from(ref.current.querySelectorAll<HTMLElement>(".bar-track"));
    const fills = tracks.map((t) => t.firstElementChild as HTMLElement);
    const bounds = Array.from({ length: steps + 1 }, (_, i) => [i === 0 ? 0 : labelTime(tl, i - 1), labelTime(tl, i)]);
    let last: boolean | null = null;
    const update = () => {
      const t = tl.time();
      fills.forEach((el, i) => {
        const [a, b] = bounds[i];
        const f = b - a < 0.01 ? (t >= b - 0.001 ? 1 : 0) : Math.min(1, Math.max(0, (t - a) / (b - a)));
        el.style.transform = `scaleX(${f})`;
      });
      const s = Math.min(step, steps);
      const done = t >= bounds[s][1] - 0.02 && !movingCb.current?.();
      const wait = !done ? -1 : s < steps ? s + 1 : steps + 1;
      tracks.forEach((el, i) => el.classList.toggle("bar-wait", i === wait));
      cue.current?.classList.toggle("cue-on", wait === steps + 1);
      if (done !== last) { last = done; waitCb.current(done); }
    };
    update();
    gsap.ticker.add(update);
    return () => gsap.ticker.remove(update);
  }, [tl, steps, step]);
  return (
    <span ref={ref} className="no-export flex items-center gap-[8px]" aria-hidden>
      {Array.from({ length: steps + 1 }, (_, i) => (
        <span key={i} className="bar-track"><span className="bar-fill" style={{ transform: "scaleX(0)" }} /></span>
      ))}
      <span ref={cue} className="cue ml-1 text-[22px] leading-none">→</span>
    </span>
  );
}

export function Footer({ scene, index, step, steps, tl, onWait, moving, returnTo, hidden }: {
  scene: SceneDef; index: number; step: number; steps: number; tl?: gsap.core.Timeline;
  onWait?: (w: boolean) => void; moving?: () => boolean; returnTo?: { index: number; step: number } | null; hidden?: boolean;
}) {
  const m = MAIN.indexOf(index);
  const progress = m < 0 ? 1 : (m + (steps ? step / (steps + 1) : 0)) / Math.max(1, MAIN.length - 1);
  const hero = !!scene.hero;
  const muted = hero ? "var(--color-hero-muted)" : "var(--color-muted)";
  return (
    <div className={hero ? "hero-chrome" : ""} style={{ visibility: hidden ? "hidden" : undefined }}>
      <div className="absolute bottom-[40px] left-[120px] right-[120px] flex items-center justify-between gap-10 mono text-[18px] tracking-[0.08em]" style={{ color: muted }}>
        <span className="truncate">{scene.source ? `Source: ${scene.source}` : DECK.footer}</span>
        <span className="tnum flex flex-none items-center gap-6 whitespace-nowrap">
          {tl && onWait && <StepBars key={scene.id} tl={tl} steps={steps} step={step} onWait={onWait} moving={moving} />}
          {scene.appendix && <span className="rounded-full px-3 py-1" style={{ background: "var(--color-accent-soft)", color: "var(--color-ink)" }}>BACKUP</span>}
          {returnTo && <span className="no-export">Esc ↩ {slideNo(returnTo.index)}</span>}
          <span>{slideNo(index)}</span>
        </span>
      </div>
      {!scene.appendix && (
        <div className="absolute bottom-0 left-0 right-0 h-[6px]" style={{ background: hero ? "rgb(255 255 255 / 0.08)" : "var(--color-line)" }}>
          <div className="h-full" style={{ width: `${Math.min(1, Math.max(0, progress)) * 100}%`, background: hero ? "var(--color-hero-muted)" : "var(--color-primary)", transition: "width 600ms var(--ease-standard)" }} />
        </div>
      )}
    </div>
  );
}

/** Export page between the main scenes and the backup slides. */
export function Divider({ count }: { count: number }) {
  return (
    <div className="scene hero" style={{ visibility: "visible", zIndex: 30 }}>
      <div className="absolute left-[120px] top-[400px] flex flex-col gap-6">
        <span className="eyebrow">Appendix</span>
        <h1 className="h1 m-0" style={{ color: "var(--color-hero-ink)" }}>Backup slides</h1>
        <p className="body-l m-0">{count} slide{count === 1 ? "" : "s"} for questions</p>
      </div>
    </div>
  );
}

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

export function NotesPanel({ scene, step, startedAt, speakerStartedAt }: { scene: SceneDef; step: number; startedAt: number | null; speakerStartedAt: number | null }) {
  const now = useNow(true);
  return (
    <div className="no-export absolute left-[120px] right-[120px] bottom-[100px] rounded-[20px] p-8 flex gap-10"
      style={{ background: "rgb(16 18 24 / 0.94)", color: "#F1F1EE", boxShadow: "var(--shadow-lg)", zIndex: 50 }}>
      <div className="flex flex-col gap-2 w-[260px] flex-none mono">
        <span className="text-[18px] tracking-[0.1em]" style={{ color: "#9BA3B8" }}>
          {scene.speaker ? nameOf(scene.speaker).toUpperCase() + " · " : ""}STEP {step}
        </span>
        <span className="text-[44px] tnum">{startedAt ? fmt(now - startedAt) : "0:00"}</span>
        <span className="text-[18px]" style={{ color: "#9BA3B8" }}>speaker {speakerStartedAt ? fmt(now - speakerStartedAt) : "0:00"}</span>
      </div>
      <p className="text-[26px] leading-[1.45] m-0">{scene.notes[step] ?? ""}</p>
    </div>
  );
}

const keyName = (code: string) => code.replace(/^Key|^Digit/, "");

export const helpRows = (): [string, string][] => [
  ["→  Space  PageDown", "next step or scene (clicker works)"],
  ["Shift + →", "finish the running animation now"],
  ["←  PageUp", "back"],
  ["1–9  Home  End", "jump to a main scene"],
  ["/  Ctrl/⌘ K", "search backup slides · Esc returns"],
  ["B  W", "black / white screen (again or → returns)"],
  [`hold ${keyName(DECK.laserKey)}`, "laser dot"],
  ["D", "draw · Backspace undo · C clear · Esc leave"],
  DECK.darkTheme ? ["F  T  R", "fullscreen · theme · replay intro"] : ["F  R", "fullscreen · replay intro"],
  ["P  N  ?", "presenter window · notes (rehearsal) · this help"],
];

export function HelpPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="no-export absolute inset-0 grid place-items-center" style={{ background: "var(--color-scrim)", zIndex: 60 }} onClick={onClose}>
      <div className="card p-12 flex flex-col gap-4 w-[1080px]">
        <span className="eyebrow">Keys · same keys on a Cyrillic layout</span>
        {helpRows().map(([k, v]) => (
          <div key={k} className="flex gap-8 text-[26px]">
            <span className="mono w-[380px] flex-none text-[22px] pt-1" style={{ color: "var(--color-primary-ink)" }}>{k}</span>
            <span style={{ color: "var(--color-ink-2)" }}>{v}</span>
          </div>
        ))}
        <span className="body-m mt-2">Mouse clicks on the stage do nothing. Wheel: {DECK.wheel ? "on" : "off"}.</span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- who is speaking (?remote or ?names) */

const LIVE_MS = 2500; // a phone that sent a level in this time counts as live
const TALK = 0.12;    // level that counts as talking

/** The scene's speaker, plus anyone else whose phone hears them talking right now. */
export function SpeakerChips({ scene }: { scene: SceneDef }) {
  const [others, setOthers] = useState<string[]>([]);
  useEffect(() => {
    const own = partOf(scene.speaker);
    const tick = setInterval(() => {
      const now = Date.now();
      const talking = Object.entries(voice)
        .filter(([p, x]) => Number(p) !== own && now - x.at < 600 && x.v > TALK)
        .map(([p]) => DECK.speakers[Number(p) - 1]?.id)
        .filter((x): x is string => !!x);
      setOthers((prev) => (prev.join() === talking.join() ? prev : talking));
    }, 250);
    return () => clearInterval(tick);
  }, [scene.speaker]);
  if (!scene.speaker) return null;
  return (
    <span className="no-export absolute top-[44px] right-[120px] z-[5] flex flex-row-reverse items-center gap-4">
      <SpeakerChip speaker={scene.speaker} hero={!!scene.hero} />
      {others.map((o) => <SpeakerChip key={o} speaker={o} hero={!!scene.hero} />)}
    </span>
  );
}

function SpeakerChip({ speaker, hero }: { speaker: string; hero: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const bars = useRef<HTMLSpanElement>(null);
  const name = nameOf(speaker);
  const initials = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2);
  const part = partOf(speaker);
  // a new speaker slides in; the same speaker on the next scene stays still
  useGSAP(() => {
    gsap.fromTo(ref.current, { y: -16, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.5, ease: "power3.out", delay: 0.2 });
  }, { dependencies: [name] });
  // with the phone mic on, the bars and the glow follow the real voice; without it they idle
  useEffect(() => {
    const el = bars.current, chip = ref.current;
    if (!el || !chip) return;
    const is = Array.from(el.children) as HTMLElement[];
    const shape = [0.65, 1, 0.8];
    let level = 0, lastTalk = 0;
    const update = () => {
      const x = voice[part];
      const live = !!x && Date.now() - x.at < LIVE_MS;
      el.classList.toggle("live", live);
      if (!live) { chip.style.boxShadow = ""; chip.style.opacity = ""; return; }
      const target = Date.now() - x.at < 600 ? x.v : 0;
      level += (target - level) * 0.35;
      is.forEach((b, k) => { b.style.transform = `scaleY(${Math.max(0.2, Math.min(1, level * 1.6 * shape[k] + (level > 0.05 ? Math.random() * 0.15 : 0)))})`; });
      chip.style.boxShadow = level > TALK ? `0 0 0 ${2 + level * 4}px color-mix(in srgb, var(--color-accent) ${Math.round(25 + level * 35)}%, transparent)` : "";
      // quiet for a moment: the chip dims a little instead of blinking between sentences
      if (level > TALK) lastTalk = Date.now();
      chip.style.opacity = Date.now() - lastTalk < 1500 ? "1" : "0.6";
    };
    gsap.ticker.add(update);
    return () => gsap.ticker.remove(update);
  }, [part]);
  return (
    <span ref={ref} className="flex items-center gap-4 rounded-full pl-2 pr-6 py-2"
      style={{ background: hero ? "rgb(255 255 255 / 0.08)" : "var(--color-surface)", border: `1px solid ${hero ? "rgb(255 255 255 / 0.18)" : "var(--color-line)"}`, transition: "box-shadow 120ms, opacity 400ms" }}>
      <span className="grid place-items-center size-[44px] rounded-full text-[17px] font-bold" style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}>{initials}</span>
      <span className="flex flex-col leading-tight">
        <span className="text-[22px] font-semibold" style={{ color: hero ? "var(--color-hero-ink)" : "var(--color-ink)" }}>{name}</span>
        <span className="text-[14px] tracking-[0.14em] flex items-center gap-2" style={{ color: hero ? "var(--color-hero-muted)" : "var(--color-muted)" }}>
          <span ref={bars} className="spk-bars flex items-end gap-[3px] h-[12px]" aria-hidden><i /><i /><i /></span>
          SPEAKING
        </span>
      </span>
    </span>
  );
}

import type { CSSProperties, ReactNode } from "react";

type Q = (s: string) => Element[];

/** Eyebrow + statement title (+ optional sub). Pair with enterHeading(). */
export function Heading({ eyebrow, title, sub, className = "" }: { eyebrow: ReactNode; title: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={`absolute left-[120px] top-[130px] right-[120px] flex flex-col gap-4 ${className}`}>
      <span className="eyebrow h-eyebrow">{eyebrow}</span>
      <h1 className="h1 h-title m-0 max-w-[1500px]">{title}</h1>
      {sub && <p className="body-l h-sub m-0 max-w-[1300px]">{sub}</p>}
    </div>
  );
}

/** Shared entrance for a Heading: short y/opacity stagger. */
export function enterHeading(tl: gsap.core.Timeline, q: Q, at = 0) {
  tl.from(q(".h-eyebrow"), { y: 20, autoAlpha: 0, duration: 0.5 }, at)
    .from(q(".h-title"), { y: 40, autoAlpha: 0, duration: 0.8 }, at + 0.08);
  if (q(".h-sub").length) tl.from(q(".h-sub"), { y: 24, autoAlpha: 0, duration: 0.7 }, at + 0.22);
  return tl;
}

/**
 * Count a number from `from` to `to` inside `el` (textContent in onUpdate). Seek-safe: a fromTo that writes
 * nothing at build time (immediateRender: false), so several counters on one element and jumps both ways land on
 * the right value. The markup holds the text shown before the count starts (normally the `from` value).
 * Correct in export because the engine seeks with events. For hero numbers prefer odometer() from "../fx".
 */
export function counter(tl: gsap.core.Timeline, el: Element | null | undefined, to: number, at: number | string,
  { from = 0, duration = 1.2, ease = "power2.out", format = (v: number) => Math.round(v).toLocaleString("en-US") }:
  { from?: number; duration?: number; ease?: string; format?: (v: number) => string } = {}) {
  if (!el) return tl;
  const o = { v: from };
  const write = () => { el.textContent = format(o.v); };
  // onReverseComplete: a seek back past the start (← or a jump from a later step) restores the start text
  return tl.fromTo(o, { v: from }, { v: to, duration, ease, immediateRender: false, onUpdate: write, onReverseComplete: write }, at);
}

type Tone = "surface" | "primary" | "accent" | "sunken";
const TONES: Record<Tone, CSSProperties> = {
  surface: { background: "var(--card-bg)", color: "var(--color-ink)", border: "var(--card-border)", borderTop: "var(--card-top-rule)" },
  primary: { background: "var(--color-primary)", color: "var(--color-on-primary)", borderColor: "transparent" },
  accent: { background: "var(--color-accent-soft)", color: "var(--color-ink)", borderColor: "transparent" },
  sunken: { background: "var(--color-sunken)", color: "var(--color-ink)", borderColor: "transparent" },
};

/** Card. Change colours with `tone` or `style`, never by stacking a second bg-* class (Tailwind v4 order). */
export function Card({ children, tone = "surface", className = "", style }: { children: ReactNode; tone?: Tone; className?: string; style?: CSSProperties }) {
  return (
    <div className={`border ${className}`} style={{ borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-sm)", ...TONES[tone], ...style }}>
      {children}
    </div>
  );
}

export function Pill({ children, tone = "sunken", className = "" }: { children: ReactNode; tone?: Tone; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 px-5 py-2 text-[20px] font-semibold whitespace-nowrap ${className}`} style={{ borderRadius: "var(--radius-chip)", ...TONES[tone] }}>
      {children}
    </span>
  );
}

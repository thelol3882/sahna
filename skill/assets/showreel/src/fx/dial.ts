import { DECK } from "../deck/config";
import { deckRuntime } from "../deck";
import { reducedMotion } from "../gsap";

/**
 * The creative dial (DIAL.md). One switch for the whole deck: DECK.style in src/deck/config.ts,
 * overridden by `?style=academic|balanced|showcase` in the link (rehearsal, screenshots).
 * Components ask `allow(feature)` and DEGRADE when the answer is no (never just vanish).
 * The single definition of the dial: the engine (transition grammar), fx kit, diagram and data-viz modules all read it.
 */
export type Style = "academic" | "balanced" | "showcase";
export type Feature =
  | "darkHero" | "darkContent" | "kinetic" | "decode" | "light" | "aurora" | "glass" | "parallax" | "grain" | "tilt"
  | "overlayTransitions" | "sharedElements" | "throughZoom" | "shader" | "protagonist" | "sound";

/** Where the feature is used. Balanced allows some features only on hero scenes or on diagrams. */
export type Where = { hero?: boolean; diagram?: boolean };

const STYLES: Style[] = ["academic", "balanced", "showcase"];
const fromUrl = typeof location !== "undefined" ? new URLSearchParams(location.search).get("style") : null;

export const style: Style = STYLES.includes(fromUrl as Style) ? (fromUrl as Style)
  : STYLES.includes(DECK.style) ? DECK.style : "balanced";

/** Language of the talk: DECK.locale, `?lang=en|ru|kk` overrides it (number formatting, <html lang>, label faces). */
export type Locale = "en" | "ru" | "kk";
const LOCALES: Locale[] = ["en", "ru", "kk"];
const langUrl = typeof location !== "undefined" ? new URLSearchParams(location.search).get("lang") : null;
export const locale: Locale = LOCALES.includes(langUrl as Locale) ? (langUrl as Locale)
  : LOCALES.includes(DECK.locale) ? DECK.locale : "en";

type Rule = boolean | ((w: Where) => boolean);
const TABLE: Record<Feature, [Rule, Rule, Rule]> = {
  //                  academic  balanced                         showcase
  darkHero:           [false,    true,                            true],
  darkContent:        [false,    false,                           true],
  kinetic:            [false,    true,                            true],   // odometer() is always on (academic too)
  decode:             [false,    false,                           true],
  light:              [false,    (w) => !!w.diagram,              true],   // beams on diagrams only in balanced
  aurora:             [false,    (w) => !!w.hero,                 true],   // soft, hero only in balanced
  glass:              [false,    false,                           true],
  parallax:           [false,    (w) => !!w.hero,                 true],
  grain:              [false,    true,                            true],
  tilt:               [false,    true,                            true],
  overlayTransitions: [false,    true,                            true],
  sharedElements:     [true,     true,                            true],
  throughZoom:        [false,    true,                            true],   // once per talk in balanced (the deck's job)
  shader:             [false,    false,                           true],
  protagonist:        [false,    true,                            true],
  sound:              [false,    false,                           () => DECK.sound],
};

/** May this feature run here? (gate) */
export function allow(feature: Feature, where: Where = {}): boolean {
  const r = TABLE[feature][STYLES.indexOf(style)];
  return typeof r === "function" ? r(where) : r;
}

/** 0 academic, 0.6 balanced, 1 showcase: scale glow opacity, drift distance, tilt angle. */
export const intensity = style === "showcase" ? 1 : style === "balanced" ? 0.6 : 0;

/** Is this scene dark? kind "hero" = cover/end, "content" = every other scene. */
export const isDark = (kind: "hero" | "content") => allow(kind === "hero" ? "darkHero" : "darkContent");

/**
 * Continuous loops (aurora drift, beams) may run: scene on screen, not exporting/printing, motion not reduced.
 * Read during render (the Deck re-renders scenes on setExport and on every scene change).
 */
export const loopsMayRun = (active: boolean) => active && !deckRuntime.exporting && !deckRuntime.print && !reducedMotion();

import type { EnterKind } from "./transitions";
import type { Locale, Style } from "../fx/dial";

/** Per-deck settings. Scenes, data and chrome are the only other files a new deck edits. */
export const DECK = {
  title: "Deck title",
  /** creative dial (src/fx/dial.ts): "academic" | "balanced" | "showcase"; `?style=` in the link overrides it.
      apply_pack.py writes the pack's default here. */
  style: "balanced" as Style,
  /** language of the talk: number/date formatting (data-viz), <html lang>, label faces. `?lang=` overrides it. */
  locale: "en" as Locale,
  /** left side of the footer when a scene has no `source` */
  footer: "TALK TITLE · VENUE · 2026",
  /** sample in the talk's language for font preloading */
  fontSample: "Aa Бб Әә Ғғ Ққ Ңң Өө Ұұ Үү Һһ Іі 0123456789",
  /** total talk budget in seconds (presenter timer turns red after it) */
  budget: 10 * 60,
  /** speakers in order; part = position + 1 (phone remote and voice levels use the part number) */
  speakers: [
    { id: "a", name: "Speaker One" },
    { id: "b", name: "Speaker Two" },
  ] as { id: string; name: string }[],
  /** a press during an entrance: false = ignored (Shift+→ fast-finishes), true = old behaviour (fast-finish on every press) */
  fastFinishOnPress: false,
  /** mouse wheel / touch swipes step the deck (own lock, 750 ms) */
  wheel: false,
  /** hold this key (KeyboardEvent.code) for the laser dot; not L, the video scene uses J/K/L */
  laserKey: "KeyX",
  /** the T theme toggle: true only if the concept needs a light AND a dark look for the whole deck (then
      ?theme=dark starts dark). false = T does nothing. Dark scenes (hero, showcase content) work either way:
      they always use the .dark token block of theme.css. */
  darkTheme: false,
  /** sound effects (dial feature "sound", showcase only); nothing in the starter plays sound */
  sound: false,
  /** forward transition into a scene, by scene id (scene meta `enter` wins); missing = the style's default grammar.
      The dial degrades what the style does not allow (shader → overlay → rise/push). */
  enter: {} as Record<string, EnterKind>,
};

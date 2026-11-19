import type { FC } from "react";
import type { EnterKind } from "./transitions";

/** One scene: a component plus its meta (src/scenes/index.ts). */
export type SceneDef = {
  id: string;
  title: string;
  /** steps after the entrance; must match the s1…sN labels of the scene's timeline */
  steps: number;
  /** notes[0] after the entrance, notes[k] after step k */
  notes: string[];
  /** id from DECK.speakers (speaker chip, presenter timers, phone remote) */
  speaker?: string;
  /** chrome grouping (tabs, minimap regions) */
  section?: string;
  /** source line shown in the footer */
  source?: string;
  /** rough length in seconds, for the presenter's budget */
  seconds?: number;
  /** dark hero scene (cover, end) */
  hero?: boolean;
  /** full-bleed media: no footer, no speaker chip */
  full?: boolean;
  /** Q&A backup slide: outside the main flow, reached by the search palette (/ or Ctrl/Cmd+K) */
  appendix?: boolean;
  /** extra search words for the palette */
  tags?: string[];
  /** export two pages (start and end), for question → answer and scroll scenes */
  twoPage?: boolean;
  /** forward transition INTO this scene (wins over DECK.enter); degraded by the style dial */
  enter?: EnterKind;
  /** how the deck LEAVES this scene going forward. through: CSS selector of an element the camera dives through
      (a dot, a device screen, a bold glyph); color: the plate colour once it fills the stage (default: its own colour) */
  exit?: { through?: string; color?: string };
  Component: FC;
};

/** A scene that plays media can take over Next/Back while it runs (return true = handled). */
export type Hold = {
  next?: () => boolean;
  prev?: () => boolean;
  toggle?: () => void;
  skip?: () => void;
  seek?: (t: number) => void;
};

/** What a media scene reports, so the presenter window and the phones can show it. */
export type MediaState = { playing: boolean; t: number; dur: number; chapter: string; ended: boolean };

/** Commands. The first set is the remote protocol (server.mjs); "return" is local only (presenter → deck). */
export type Cmd = "next" | "prev" | "hello" | "replay" | "media-toggle" | "media-skip" | "jump" | "media-seek" | "return";

export type DeckState = {
  /** index into `scenes` (file order of src/scenes/index.ts, appendix included) */
  index: number;
  step: number;
  steps?: number;
  startedAt: number | null;
  speakerStartedAt: number | null;
  media?: MediaState | null;
  /** on a backup slide: the main scene and step that Esc returns to */
  returnTo?: { index: number; step: number } | null;
};

export type Msg =
  | { type: "state"; state: DeckState }
  | { type: "cmd"; cmd: Cmd; index?: number; t?: number }
  | { type: "role"; lead: boolean }
  | { type: "sync"; state: DeckState }
  | { type: "level"; part: number; v: number }
  /** local only: the current part finished, the deck waits for → */
  | { type: "wait"; index: number; step: number; waiting: boolean };

import type { FC, ReactNode } from "react";

/**
 * Optional scene host: a module (src/world) that places scenes in a space and replaces the scene-change
 * transition with its own move. The engine works without one; with one, the engine
 *  - renders the scene list inside `Wrap` and every scene inside `Panel`,
 *  - asks `go()` for every scene change (returns null = the engine does its normal fade/transition),
 *  - calls `settle()` after its own fade and after `__deck.show()` (instant, export),
 *  - lets `key()` take keys first (return true = handled).
 * Install it before mounting: `setSceneHost(host)` (see src/world/index.ts installWorld()).
 */
export type HostHooks = {
  /** start the target scene's entrance (absent when the engine seeks it to a step) */
  start?: () => void;
  /** the move ended; the engine accepts input again */
  done: () => void;
};

export type HostApi = {
  /** jump to a scene by index (same as the palette / digits) */
  jumpTo: (i: number) => boolean;
  /** current scene index */
  index: () => number;
  /** a scene transition is playing */
  busy: () => boolean;
};

export type SceneHost = {
  enabled: () => boolean;
  Wrap: FC<{ children: ReactNode }>;
  Panel: FC<{ id: string; children: ReactNode }>;
  attach: (api: HostApi) => void;
  /** the first scene's opening shot; null = none */
  intro: (id: string, hooks: HostHooks) => gsap.core.Timeline | null;
  /** kind: "next" = forward to the next main scene, "back" = ← to the previous one, "jump" = any other change */
  go: (fromId: string, toId: string, kind: "next" | "back" | "jump", hooks: HostHooks) => gsap.core.Timeline | null;
  settle: (id: string) => void;
  /** Shift+→ during one of the host's moves: end it now (true = it was the host's move and it has ended) */
  skip: (move: gsap.core.Timeline) => boolean;
  key: (e: KeyboardEvent, letter: string | null) => boolean;
  /** export / tests: overview on or off, instant */
  overview: (on: boolean, instant?: boolean) => void;
  state: () => unknown;
};

let host: SceneHost | null = null;
export const setSceneHost = (h: SceneHost | null) => { host = h; };
/** The installed host, only when it is enabled for this style. */
export const sceneHost = (): SceneHost | null => (host && host.enabled() ? host : null);

import type { PState } from "../fx";

/** Halo's mark (fictional): a rounded "H" in the protagonist's 200×200 box, close to the orb's point count. */
export const MARK = "M52,38 L84,38 L84,84 L116,84 L116,38 L148,38 L148,162 L116,162 L116,116 L84,116 L84,162 L52,162 Z";

/**
 * The protagonist (the courier's "halo") through the film. Each scene starts at the previous scene's end state,
 * so the object glides across scene changes. Stage pixels (1920×1080), centre of the object.
 */
export const P = {
  heroIn: { x: 1480, y: 470, scale: 0, shape: "orb" },
  hero: { x: 1480, y: 470, scale: 1.6, shape: "orb" },
  // bento: the live-map card's hub (card c spans x 972..1800, y 330..960)
  bentoHub: { x: 1386, y: 640, scale: 0.36, shape: "orb" },
  closeIn: { x: 960, y: 360, scale: 0, shape: "orb" },
  close: { x: 960, y: 360, scale: 0.95, shape: "orb" },
  closeMark: { x: 960, y: 360, scale: 0.95, shape: MARK, rotate: 0 },
} satisfies Record<string, PState>;

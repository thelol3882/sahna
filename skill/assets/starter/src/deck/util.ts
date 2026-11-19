import { scenes } from "../scenes";
import { DECK } from "./config";

/** Time of label s<k>, clamped to the timeline (a missing label = the end). */
export const labelTime = (tl: gsap.core.Timeline, k: number) => Math.min(tl.labels[`s${k}`] ?? tl.duration(), tl.duration());

/** Steps after the entrance = number of s<k> labels − 1. */
export const stepsOf = (tl?: gsap.core.Timeline) =>
  tl ? Object.keys(tl.labels).filter((k) => /^s\d+$/.test(k)).length - 1 : 0;

/** Indices into `scenes`: the main flow and the Q&A backup slides (file order kept inside each group). */
export const MAIN = scenes.flatMap((s, i) => (s.appendix ? [] : [i]));
export const APPX = scenes.flatMap((s, i) => (s.appendix ? [i] : []));

/** "05/14" for a main scene, "A2/3" for a backup slide. */
export function slideNo(i: number) {
  const m = MAIN.indexOf(i);
  if (m >= 0) return `${pad(m + 1)}/${pad(MAIN.length)}`;
  return `A${APPX.indexOf(i) + 1}/${APPX.length}`;
}
export const pad = (n: number) => String(n).padStart(2, "0");

export function fmt(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Speaker id → part number (1-based) and display name. */
export const partOf = (id?: string) => DECK.speakers.findIndex((s) => s.id === id) + 1;
export const nameOf = (id?: string) => DECK.speakers.find((s) => s.id === id)?.name ?? id ?? "";

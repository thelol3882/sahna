/** Layout-independent key reading: e.code first (physical key), then Russian/Kazakh Cyrillic letters by position. */
const CYR: Record<string, string> = {
  ф: "a", и: "b", с: "c", в: "d", у: "e", а: "f", п: "g", р: "h", ш: "i", о: "j", л: "k", д: "l", ь: "m",
  т: "n", щ: "o", з: "p", й: "q", к: "r", ы: "s", е: "t", г: "u", м: "v", ц: "w", ч: "x", н: "y", я: "z",
};

/** Latin letter of the physical key ("f" for F, А on a Cyrillic layout, …), or null. */
export function letter(e: KeyboardEvent): string | null {
  if (/^Key[A-Z]$/.test(e.code)) return e.code.slice(3).toLowerCase();
  const k = e.key.toLowerCase();
  if (/^[a-z]$/.test(k)) return k;
  return CYR[k] ?? null;
}

/** 0–9 from the digit row or the numpad (on the Kazakh layout the digit row types letters, so e.code wins). */
export function digit(e: KeyboardEvent): number | null {
  const m = /^(?:Digit|Numpad)([0-9])$/.exec(e.code);
  if (m) return Number(m[1]);
  return /^[0-9]$/.test(e.key) ? Number(e.key) : null;
}

/** Clickers send PageDown/PageUp or arrows. */
export const isNext = (e: KeyboardEvent) => ["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(e.key) || e.code === "Space";
export const isPrev = (e: KeyboardEvent) => ["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key);
export const isHelp = (e: KeyboardEvent) => e.key === "?" || (e.code === "Slash" && e.shiftKey);
export const isSearch = (e: KeyboardEvent) => (e.code === "Slash" && !e.shiftKey) || e.key === "/";

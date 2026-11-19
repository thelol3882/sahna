import { locale, type Locale } from "../fx/dial";

export type Loc = Locale;
const TAG: Record<Loc, string> = { en: "en-US", ru: "ru-RU", kk: "kk-KZ" };
/** Deck-wide chart locale: the dial's `locale` (DECK.locale, `?lang=` overrides). */
export const LOCALE: Loc = locale;

export type NumFmt = {
  /** "number" (default), "percent" (value is already 0–100), "currency" (tenge by default), "compact" (1.3M / 1,3 млн) */
  style?: "number" | "percent" | "currency" | "compact";
  decimals?: number;
  currency?: string;
  /** suffix after a thin space, e.g. "ms" */
  unit?: string;
  /** "+" sign for positive deltas */
  signed?: boolean;
  locale?: Loc;
};

const cache = new Map<string, Intl.NumberFormat>();
function nf(loc: Loc, o: Intl.NumberFormatOptions) {
  const k = loc + JSON.stringify(o);
  let f = cache.get(k);
  if (!f) { f = new Intl.NumberFormat(TAG[loc], o); cache.set(k, f); }
  return f;
}

/*
 * Kazakh: Chromium's ICU often ships WITHOUT kk data (headless and some desktop builds print "1,284,000" and
 * "2026 M11 19"), so kk is formatted here from CLDR rules, the same in every browser: group = narrow nbsp,
 * decimal = comma (as ru), percent without a space ("38,4%"), currency after the number ("2 450 000 ₸"),
 * compact мың / млн / млрд, dates "2026 ж. 19 қараша".
 */
const KK_MONTHS = ["қаңтар", "ақпан", "наурыз", "сәуір", "мамыр", "маусым", "шілде", "тамыз", "қыркүйек", "қазан", "қараша", "желтоқсан"];
const KK_MON = ["қаң.", "ақп.", "нау.", "сәу.", "мам.", "мау.", "шіл.", "там.", "қыр.", "қаз.", "қар.", "жел."];
function kkNum(v: number, o: NumFmt): string {
  const d = o.decimals ?? 0;
  const plain = (x: number, dd: number) => nf("ru", { minimumFractionDigits: dd, maximumFractionDigits: dd }).format(Math.abs(x));
  const sign = v < 0 ? "−" : o.signed && v > 0 ? "+" : "";
  switch (o.style) {
    case "percent": return `${sign}${plain(v, d)}%`;
    case "currency": return `${sign}${plain(v, d)}\u00a0${o.currency && o.currency !== "KZT" ? o.currency : "₸"}`;
    case "compact": {
      const a = Math.abs(v);
      const [div, w] = a >= 1e9 ? [1e9, "млрд"] : a >= 1e6 ? [1e6, "млн"] : a >= 1e3 ? [1e3, "мың"] : [1, ""];
      const x = a / div;
      const dd = o.decimals ?? 1;
      const str = nf("ru", { maximumFractionDigits: x >= 100 ? 0 : dd }).format(x);
      return `${sign}${str}${w ? "\u00a0" + w : ""}`;
    }
    default: return `${sign}${plain(v, d)}`;
  }
}

/** Format a number for slides, per locale (en 1,284,000 · ru 1 284 000 · kk 1 284 000; tenge ₸). */
export function fmtNum(v: number, o: NumFmt = {}): string {
  const loc = o.locale ?? LOCALE;
  if (loc === "kk") { const s = kkNum(v, o); return o.unit ? `${s}\u2009${o.unit}` : s; }
  const d = o.decimals ?? 0;
  const sign = o.signed ? "always" as const : "auto" as const;
  let s: string;
  switch (o.style) {
    case "percent":
      s = nf(loc, { style: "percent", minimumFractionDigits: d, maximumFractionDigits: d, signDisplay: sign }).format(v / 100);
      break;
    case "currency": {
      const cur = o.currency ?? "KZT";
      s = nf(loc, { style: "currency", currency: cur, currencyDisplay: "narrowSymbol", minimumFractionDigits: d, maximumFractionDigits: d, signDisplay: sign }).format(v);
      break;
    }
    case "compact":
      s = nf(loc, { notation: "compact", maximumFractionDigits: o.decimals ?? 1, signDisplay: sign }).format(v);
      break;
    default:
      s = nf(loc, { minimumFractionDigits: d, maximumFractionDigits: d, signDisplay: sign }).format(v);
  }
  return o.unit ? `${s} ${o.unit}` : s;
}

/** "4×" style ratio, honest rounding: 840/210 → "4×", 840/250 → "3.4×" (locale decimal mark). */
export function fmtRatio(a: number, b: number, o: { decimals?: number; locale?: Loc } = {}): string {
  const r = a / b;
  const d = o.decimals ?? (Math.abs(r - Math.round(r)) < 0.05 ? 0 : 1);
  return `${fmtNum(r, { decimals: d, locale: o.locale })}×`;
}

/** Short month/year labels for time axes, per locale. */
export function fmtDate(iso: string, o: { month?: "short" | "long"; year?: boolean; day?: boolean; locale?: Loc } = {}): string {
  const loc = o.locale ?? LOCALE;
  if (loc === "kk") {
    const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
    const mon = (o.month === "long" ? KK_MONTHS : KK_MON)[m - 1];
    if (o.day) return `${o.year ? `${y} ж. ` : ""}${d} ${mon}`;
    return o.year ? `${mon} ${y}` : mon;
  }
  const dt = new Date(iso + (iso.length <= 10 ? "T00:00:00Z" : ""));
  return new Intl.DateTimeFormat(TAG[loc], { month: o.month ?? "short", year: o.year ? "numeric" : undefined, day: o.day ? "numeric" : undefined, timeZone: "UTC" }).format(dt);
}

/** Pick the string for the deck locale from {en, ru, kk}. */
export const t = (s: string | Partial<Record<Loc, string>>, loc: Loc = LOCALE): string =>
  typeof s === "string" ? s : s[loc] ?? s.en ?? Object.values(s)[0] ?? "";

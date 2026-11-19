import { useSyncExternalStore } from "react";

/**
 * Is the deck exporting (PDF/PPTX screenshots) or printing? The video must never play then.
 * The module does not need an engine hook for this: it reads a class on <html> (or a flag on __deck).
 * The starter's __deck.setExport(true) adds `export-mode` to <html>, and `#print` adds `print-mode`;
 * `export` and a `__deck.exporting` flag are accepted too, for other engines.
 */
export function isExportMode() {
  if (typeof document === "undefined") return false;
  const c = document.documentElement.classList;
  const d = (window as unknown as { __deck?: { exporting?: boolean } }).__deck;
  return c.contains("export") || c.contains("export-mode") || c.contains("print-mode") || d?.exporting === true;
}

function subscribe(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => mo.disconnect();
}

export function useExportMode() {
  return useSyncExternalStore(subscribe, isExportMode, () => false);
}

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

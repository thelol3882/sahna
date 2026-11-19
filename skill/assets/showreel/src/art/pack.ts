/** The style pack in use: written by tools/apply_pack.py (this default = the neutral starter look).
 *  Motion values are GSAP eases and seconds; scenes read them as PACK.motion.enter etc. */
export const PACK = {
  name: "starter",
  label: "Starter neutral",
  /** the pack's natural look; "dark" starts in .dark only when DECK.style is "showcase" and DECK.darkTheme is true */
  prefers: "light" as "light" | "dark",
  /** recommended DECK.style for this pack */
  dial: "balanced" as "academic" | "balanced" | "showcase",
  motion: { enter: "power3.out", move: "power3.inOut", exit: "power2.in", fast: 0.35, base: 0.7, slow: 1.1, stagger: 0.06 },
  /** faces to preload with DECK.fontSample before mount */
  faces: ["400 1em 'Geist Variable'", "600 1em 'Geist Variable'", "400 1em Inter", "500 1em Inter", "600 1em Inter",
    "700 1em Inter", "400 1em 'Geist Mono'", "500 1em 'Geist Mono'"],
};

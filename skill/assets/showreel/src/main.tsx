import { createRoot } from "react-dom/client";
import "./styles.css";
import "./art/fonts.css";
import "./art/pack.css";
import { gsap, reducedMotion } from "./gsap";
import { App } from "./deck";
import { DECK } from "./deck/config";
import { PACK } from "./art/pack";
import { locale, style } from "./fx/dial";

// Reduced motion: every animation finishes almost at once, the content stays the same.
if (reducedMotion()) gsap.globalTimeline.timeScale(25);
// The pack's motion feel for tweens that name no ease.
gsap.defaults({ ease: PACK.motion.enter });
document.title = DECK.title;
// The dial (after ?style=), the pack and the language, for CSS gates (html[data-style="academic"] .pk-glass {…}),
// label faces (html:lang(kk)) and the checks (wow_check.py).
const html = document.documentElement;
html.dataset.style = style;
html.dataset.pack = PACK.name;
html.lang = locale;
const themeParam = new URLSearchParams(location.search).get("theme");
// A dark-first pack starts dark only where the dial allows dark content scenes (showcase); ?theme= wins.
const startDark = themeParam ? themeParam === "dark" : style === "showcase" && PACK.prefers === "dark";
if (DECK.darkTheme && startDark) html.classList.add("dark");

// Load every face with a sample in the talk's language, so SplitText and layout measure real glyphs.
// No StrictMode: it mounts twice and registers every timeline twice.
Promise.all(PACK.faces.map((f) => document.fonts.load(f, DECK.fontSample).catch(() => [])))
  .then(() => document.fonts.ready)
  .then(() => createRoot(document.getElementById("root")!).render(<App />));

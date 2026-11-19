# Animated web deck — starter

Vite + React + TypeScript + Tailwind v4 + GSAP. A 1920×1080 stage, key-driven steps, presenter window,
presenting tools, Q&A backup slides, offline single-file build, PDF/PPTX export and checks.
Copy this folder, then write only scenes, data and the concept's chrome.

## Run

The easy way is the sahna CLI (`sahna-cli/`, copied in by `sahna new`): `npx sahna` opens a menu; `npx sahna dev`,
`npx sahna check`, `npx sahna export`, `npx sahna doctor --fix` and the rest are listed by `npx sahna --help`
(details: the skill's `assets/cli/README.md`). The npm scripts and Python scripts below are what it runs.

```bash
npm install
npm run dev            # http://localhost:5173
npm run build:single   # → dist-single/index.html: one offline file, works from file://
npm run build          # multi-file build in dist/ (npm run preview to serve it)
```

Present from `dist-single/index.html` in Chrome, fullscreen (F).

## Links

| Link | What |
|---|---|
| `index.html#<scene-id>` | open a scene directly |
| `#presenter` | presenter window (or press P on the deck) |
| `#print` | every scene at its end state, one per page, backup slides after an "Appendix" page |
| `?notes` | notes overlay on (rehearsal) |
| `?style=academic\|balanced\|showcase` | try another creative dial without editing `DECK.style` |
| `?lang=en\|ru\|kk` | number/date locale and `<html lang>` override (`DECK.locale`) |
| `?tr=<id>:<kind>` · `?gl=force\|off` | try a transition into a scene · keep / disable WebGL shaders |
| `?rehearse` | rehearsal mode in the presenter window (S start/stop a run, V report) |
| `?theme=dark` | start in the dark theme (only with `DECK.darkTheme`) |
| `?names` | speaker chip (who is speaking) |
| `?remote&k=<key>[&lead=<lead key>]` | phone remote / synced decks via the remote server |
| `?motion=reduce` | reduced motion (also follows the OS setting) |

## Keys

| Key | Action |
|---|---|
| → Space PageDown Enter | next step / next scene (clickers work). A press while an animation runs is ignored |
| Shift + → | finish the running animation now (0.35 s) |
| ← PageUp Backspace | back (on a backup slide at its start: return) |
| 1–9 Home End | jump to a main scene |
| / or Ctrl/⌘ K | search palette: backup slides, then main scenes. Enter jumps |
| Esc | leave a backup slide → the exact scene and step you left |
| B / W | black / white screen; the same key or any nav key returns (without moving) |
| hold X | laser dot that follows the mouse |
| D | draw on the stage · Backspace undo · C clear · Esc leave. Drawings clear on scene change |
| F T R | fullscreen · light/dark theme · replay the intro |
| P N ? | presenter window · notes (not in `?remote` links) · help |

Letter keys work on Russian/Kazakh layouts too (physical key positions). Mouse clicks on the stage never
advance; the cursor hides after 2 s still. The wheel does not step unless `DECK.wheel = true`.
Fullscreen locks Esc for the deck (Chrome keyboard lock): hold Esc to leave fullscreen.

## Files you edit

| File | What |
|---|---|
| `src/theme.css` | all tokens: colours (incl. chart-1..5), fonts, type scale, radius, shadows, card; light + dark (or apply a pack: `tools/apply_pack.py`) |
| `src/deck/config.ts` | title, style (dial), locale, footer label, speakers, talk budget, transitions per scene, input flags |
| `src/data.ts` | every number on a slide, once, with its source |
| `src/scenes/*.tsx` | one component per scene (`useScene` timeline with labels `s0…sN`) |
| `src/scenes/index.ts` | order and meta: `id, title, steps, notes[], speaker?, section?, source?, hero?, full?, appendix?, tags?, twoPage?, enter?, exit?` |
| `src/ui/kit.tsx` | Heading, Card, Pill, `enterHeading`, `counter` — extend per concept |
| `src/fx/` | the creative kit (aurora, beams, bento, odometer, device frames, protagonist…) and the dial; use, do not fork |
| `src/styles.css` | global classes |

Engine files (`src/deck/*`) normally stay as they are. See NOTES.md for the API.

## Scripts (Python, Playwright)

`npx sahna check` runs all of these (builds first when stale; `--style all` for every dial) and `npx sahna export`
runs the export. By hand:

```bash
pip install playwright img2pdf python-pptx pillow && playwright install chromium
npm run build:single
python scripts/walk.py           # walkthrough + input rules → walk/contact.png
python scripts/check_overlap.py  # nothing below the footer line (1012 px)
python scripts/export.py --two-page results   # → export/deck.pdf, export/deck.pptx (slides are images)
python scripts/wow_check.py --out wow/       # classic-slide / contrast / dial check → wow/contact.png
python scripts/seek_check.py                 # forward = back = jump at every step label (all styles)
python scripts/check_transitions.py --style showcase    # ← is a plain fade, nothing left behind
python scripts/film_transitions.py           # contact sheets of every transition per style
# every check takes --html "file://$PWD/dist-single/index.html?style=academic" to test another dial
```

## Before the talk

1. `npm run build:single`, copy `dist-single/index.html` (and any `media/` next to it) to the real laptop.
2. Open it in Chrome on that machine, charger in, F for fullscreen, second screen: P for the presenter window.
3. Press through the whole deck once: wait for the pulsing bar / → chip before each press.
4. Try `/` and Esc once so you know where the backup slides are.
5. Keep the PDF on a USB stick as the dead-laptop fallback.

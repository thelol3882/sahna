# Showreel — Halo launch keynote (fictional product)

The starter with every module installed (diagram, data-viz, code-scene, video-scene, remote), played as one
continuous film: aurora hero with kinetic type + decode → dive through the title's full stop → bento (odometers,
beams, the orb flies in) → shared-element card flight → tilted device flattens + spotlight → (speaker change, liquid
shader in showcase) diagram journey: context → zoom into Halo → one order → zoom into Routing → tenant kit → code
scene → (speaker change) big number → bars, line with annotations, Kazakhstan map → close: the orb morphs into the
mark. One backup slide (`/`). Try `?style=academic|balanced|showcase` and `?lang=kk`.
Graphs: `src/graphs/halo.graph.json` (`npm run layout`); map: `npm run geo`. Every number is illustrative.

Everything below is the starter's README.

## Run

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
| `?theme=dark` | start in the dark theme |
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
| `src/theme.css` | all colour, font and shadow tokens, light and dark values |
| `src/deck/config.ts` | title, footer label, speakers, talk budget, transitions per scene, input flags |
| `src/data.ts` | every number on a slide, once, with its source |
| `src/scenes/*.tsx` | one component per scene (`useScene` timeline with labels `s0…sN`) |
| `src/scenes/index.ts` | order and meta: `id, title, steps, notes[], speaker?, section?, source?, hero?, full?, appendix?, tags?, twoPage?` |
| `src/ui/kit.tsx` | Heading, Card, Pill, `enterHeading`, `counter` — extend per concept |
| `src/styles.css` | fonts and global classes |

Engine files (`src/deck/*`) normally stay as they are. See NOTES.md for the API.

## Scripts (Python, Playwright)

```bash
pip install playwright img2pdf python-pptx pillow && playwright install chromium
npm run build:single
python scripts/walk.py           # walkthrough + input rules → walk/contact.png
python scripts/check_overlap.py  # nothing below the footer line (1012 px)
python scripts/export.py --two-page results   # → export/deck.pdf, export/deck.pptx (slides are images)
```

## Before the talk

1. `npm run build:single`, copy `dist-single/index.html` (and any `media/` next to it) to the real laptop.
2. Open it in Chrome on that machine, charger in, F for fullscreen, second screen: P for the presenter window.
3. Press through the whole deck once: wait for the pulsing bar / → chip before each press.
4. Try `/` and Esc once so you know where the backup slides are.
5. Keep the PDF on a USB stick as the dead-laptop fallback.

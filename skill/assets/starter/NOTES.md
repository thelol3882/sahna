# Starter notes (for the skill author and module builders)

## File map (merged starter, 19 Nov)

```
starter/
  index.html, vite.config.ts (single mode: viteSingleFile, assetsInlineLimit 100 MB, cssCodeSplit false, base "./")
  package.json            dev, build, build:single, typecheck (tsc -b), remote/record/remote:stop (modules/remote)
  README.md               run, links, keys, files to edit, pre-talk checklist
  src/
    main.tsx              dial → html[data-style], html[data-pack], <html lang>; PACK ease default; ?theme=dark;
                          font preload (PACK.faces + DECK.fontSample); mount (no StrictMode)
    gsap.ts               plugins (DrawSVG, SplitText, MotionPath, MorphSVG, Observer, CustomEase, useGSAP), deck eases,
                          reducedMotion()
    theme.css             ALL tokens (pack schema): @theme = light; `.dark, .scene.hero` = dark scenes + T toggle
    styles.css            stage, type classes (tokens), card, step bars + waiting cue, tools, print/export, idle cursor
    data.ts               numbers with sources
    art/                  fonts.css (font imports), pack.css (pk-* utilities, dial-gated), pack.ts (PACK: motion, faces)
                          — all three rewritten by tools/apply_pack.py
    fx/                   dial.ts (THE dial: style, locale, allow, intensity, isDark, loopsMayRun), fx.css, kinetic.ts
                          (maskLines, decode, odometer, weight), light.tsx, depth.tsx, layout.tsx (Bento), protagonist.tsx,
                          scene.tsx (FxScene), util.ts, index.ts
    ui/kit.tsx            Heading (eyebrow: ReactNode), enterHeading, counter (seek-safe), Card (card tokens), Pill
    scenes/index.ts       order + meta; Cover.tsx (FxScene hero: aurora, mask lines, decode), Results.tsx (bento,
                          odometers, bars, beam), BackupMethod.tsx (appendix)
    deck/
      index.ts            public API (import from "../deck")
      engine.tsx          contexts + hooks, Deck (navigation, keys, sync, __deck), Print, App (routes), scene host hooks
      config.ts           DECK (see INTEGRATION.md for every field)
      types.ts            SceneDef (+ enter, exit), Hold, MediaState, Cmd, DeckState, Msg
      grammar.ts          which transition plays into each scene (request > style default, degraded by the dial)
      director.ts         runs one plan: through-zoom, shader, morph or overlay + shared-element flight
      shared.ts, through.ts, shader.ts, transitions.tsx   data-shared flights, camera dive, WebGL covers, DOM overlays
      host.ts             optional scene host (modules/world): Wrap/Panel, go, settle, key, intro, skip, overview
      rehearse.tsx        ?rehearse recorder, strip, report (presenter only)
      channel.ts, remote-client.ts, keys.ts, chrome.tsx, tools.tsx, palette.tsx, presenter.tsx, util.ts (slideNo, fmt…)
  scripts/
    deckpage.py           shared Playwright helpers
    walk.py               walkthrough + input-rule assertions + contact sheet
    check_overlap.py      overlap check (text ranges + boxes, clipped by overflow viewports)
    check_transitions.py  ← is a plain fade, a killed transition leaves nothing, frame times
    film_transitions.py   contact sheets of every forward transition per style (stepped clock, ?gl=force)
    seek_check.py         forward = back = jump at every label (DOM signature), counters exact at the end and in #print
    wow_check.py (+ colors.py)  classic-slide / contrast / dial check on end states, contact sheet
    export.py             PDF + PPTX (+ "map of the talk" page when a scene host is installed)
    rehearsal_report.py, rehearse_test.py   rehearsal JSON → report; end-to-end rehearsal test
```

The original starter notes follow (still valid unless the file map above says otherwise).

## Public API for scenes

```tsx
import { SceneRoot, useScene, useSceneStep, useSceneActive, useDeckControl, deckRuntime } from "../deck";

export function MyScene() {
  const ref = useScene((tl, q) => {          // ONE paused timeline; q = scoped selector
    enterHeading(tl, q);
    tl.addLabel("s0")                         // end of entrance (added automatically if missing)
      .from(q(".x"), { autoAlpha: 0 }, "s0")
      .addLabel("s1");                        // end of step 1 — add a label BEFORE tweens reference it
  });
  return <SceneRoot ref={ref} hero={false}>…</SceneRoot>;  // SceneRoot adds data-scene=<id> (used by the scripts)
}
```

- `useSceneStep()` → current step while on screen, else -1. `useSceneActive()` → on screen (always true in print).
- Meta (`src/scenes/index.ts`): `{ id, title, steps, notes: string[], speaker?, section?, source?, seconds?, hero?, full?, appendix?, tags?, twoPage?, Component }`. `notes[0]` after the entrance, `notes[k]` after step k. In dev a console warning fires if `steps` ≠ the timeline's label count.
- `deckRuntime` flags: `forward` (deck plays forward at normal speed — the only time a hand/ghost/confetti/media start may act), `seeking` (a jump is seeking with events), `exporting`, `print`. Check them in `tl.call` callbacks.

## Public API for modules (media, code, hand, chrome)

`useDeckControl()` returns `{ setHold, setMedia, setStep, lock, stop, isFollower, emit }` (no-ops in print).

Register a Hold while the scene is active (same shape as the reference DemoVideo):

```tsx
const active = useSceneActive();
const { setHold, setMedia, isFollower, emit } = useDeckControl();
useEffect(() => {
  if (!active) return;
  setHold({
    next: () => playing ? (askSkip(), true) : false,   // true = handled, the deck does not move
    prev: () => (seekChapter(-1), true),
    toggle, skip, seek: (t) => seekTo(t),
  });
  return () => setHold(null);
}, [active]);
// own keys (K/J/…): if (isFollower()) return; … then emit("media-toggle") / emit("media-seek", { t })
```

Media state flow: `setMedia({ playing, t, dur, chapter, ended })` (≈1/s and on play/pause/end; `null` when leaving)
→ the deck sends `{type:"state", state:{…, media}}` → presenter window (shows ▶/❚❚, time, chapter; K there sends
`media-toggle`) and, in `?remote`, the server → phones. Incoming `media-toggle`, `media-skip`, `media-seek`
commands (presenter, phones, lead deck) call `hold.toggle/skip/seek`.
Hold is consulted first by `next()`/`prev()`, before the "ignore during entrance" rule.

Note: the laser is on `DECK.laserKey` (KeyX by default; the video module uses J/K/L). A module that needs X should use
other keys or change `laserKey`; `lock(true)` stops all deck keys while a scene handles input itself.

## Remote protocol (base: presentation-final-gh, 18 Nov — follow() model)

Deck connects to `/ws?role=deck&k=<key>[&lead=<lead>]` only with `?remote` over http(s); `file://` or no
`?remote` = no socket at all. Messages: deck → `state` (every scene/step/media/returnTo change), `cmd` (lead only,
and only `replay`, `media-toggle`, `media-skip`, `media-seek` — the server's LEAD_CMDS); server → `role`, `sync`,
`cmd`, `level`.

Follower model (as in the newer reference): followers do NOT replay the lead's presses. They follow the lead's
`sync` state — scene AND step — via `follow()`: the next main scene with step 0 plays its real transition, a forward
jump plays the entrance, anything else seeks to the step; same scene → drive forward, or tween back 0.35 s.
A sync that arrives during a transition or before all timelines registered is kept in `pendingSync` and applied
when the transition ends / the deck starts (late joiner lands on the current scene and step). Phone `next`/`prev`
reach only the lead when one is open; with no lead, every deck handles them itself.

Tested against `presentation-final-gh/remote/server.mjs` (only `loadScenes` stubbed): follower ignores its own
keys; lead → and a phone `next` move lead and follower to the same step; a late joiner lands on scene+step; a
backup jump and Esc return mirror on every deck (returnTo comes with the state); speaker chip shows in `?remote`.

Additions within the protocol (the server relays the state object untouched):
- `state.returnTo: {index, step} | null` — on a backup slide, where Esc returns; followers copy it.
- `state.index` = position in `scenes` (file order of `src/scenes/index.ts`, appendix included).
- A ?remote deck is a normal deck until the server sends `role` (reference: follower until confirmed), so a
  `?remote` link works without a server.
- Local-only: `{type:"wait"}` (deck → presenter) and `cmd:"return"` / `cmd:"jump"` from the presenter window never
  reach the socket as lead commands; their effect reaches followers through the state.

For the remote server: the reference `loadScenes()` regex expects `speaker: "X", seconds: N` on one line and
`notes` as one string with `(click)`. Here every meta field is on its own line, `notes` is an array of string
literals (one chunk per step, no `(click)`), `speaker` is an id from `DECK.speakers` in `src/deck/config.ts`
(part = position + 1), and backup slides have `appendix: true` and usually no speaker (part 0), so phones cannot
move a backup slide unless the server allows part 0 / the lead.

## What changed vs the reference (presentation-final-gh)

- Brand removed: no logo, map, speakers, colours, Kazakh text, confetti, three.js. Neutral tokens in `theme.css` with
  light + dark values; T toggles `.dark`. Transitions use tokens; `pin`→`shape` (generic rounded square, replace
  with the mark), `road`→`stroke` (generic S-path, dot head), new `rise` (strategy B).
- Files: `deck.tsx` split into `src/deck/*`; `components/ui.tsx` → `src/ui/kit.tsx` (`headingIn` → `enterHeading`,
  new `counter`, `Card` with `tone`, `Pill`). Imports stay `from "../deck"`.
- Meta: `notes` string → `notes: string[]`; new `steps`, `section`, `source`, `appendix`, `tags`, `twoPage`;
  `speaker` is optional and an id (not a name union); `bare` dropped (no header in the neutral chrome).
- Input per SKILL §2: press during a running part is ignored (`DECK.fastFinishOnPress` restores the old fast-finish),
  Shift+→ skips (0.35 s); wheel/touch off unless `DECK.wheel` (own 750 ms lock); keys read by `e.code` (Cyrillic
  layouts work); digits by code (Kazakh digit row types letters); jumps use `tl.pause(); tl.seek(t, false)`;
  print uses the same (reference used `tl.progress(1)`, which suppresses callbacks). Esc locked in fullscreen.
- N toggles notes only outside `?remote`; `?notes` shows them (reference had no N at all).
- Followers use the newer reference's `follow()` + `pendingSync` model; also applied before start (late joiners) and
  carrying `returnTo`. The lead emits only replay/media commands. The demo-specific parts of the newer reference
  (Caption, BrowserFrame, PhoneFrame in ui.tsx; DemoVideo's emit of media-skip/seek) belong to the video module.
- Local channel messages carry an id: the reference delivered presenter commands twice (BroadcastChannel + storage
  event) — a double "next".
- New: `__deck` export API (ready, ids, titles, steps, notes, appendix, twoPage, order, setExport, show, divider,
  state), `#print` with the appendix divider, step bars with waiting cue (64×8 px), presenter: per-step notes,
  next note, status chip, backup list, media line; presenting tools; backup slides + palette; `deckRuntime`.

## Draft text for SKILL.md

Replace the second sentence of §1's last bullet and add §2.1/§2.2; keep the rest.

> **Starter.** Copy `assets/starter/` (Vite + React + TS + Tailwind v4 + GSAP), run `npm install`, then write only
> `src/theme.css` (tokens, light + dark), `src/deck/config.ts` (title, speakers, budget, transitions, flags),
> `src/data.ts`, `src/scenes/*.tsx` + `src/scenes/index.ts`, and the concept's chrome. Do not edit `src/deck/*`
> unless the concept needs it; scenes import `SceneRoot, useScene, useSceneStep, useSceneActive, useDeckControl,
> deckRuntime` from `../deck`. Media scenes register a `Hold` with `setHold` while active and report `setMedia`;
> hands and side effects act only when `deckRuntime.forward` is true. Check with `scripts/walk.py`,
> `scripts/check_overlap.py`, export with `scripts/export.py`.
>
> ### 2.1 Presenting tools
>
> Built in, disabled in export and never in `#print`: B black / W white screen (same key or any nav key returns
> without moving), hold L laser dot on stage coordinates, D pen (freehand SVG over the stage, Backspace undo,
> C clear, Esc leave; strokes clear on scene change). They are in the ? overlay. Mention them in the speaker doc
> ("hold L to point, D to circle a number").
>
> ### 2.2 Q&A backup slides
>
> Put likely-question slides at the end of `scenes` with `appendix: true` and `tags`. They are outside the flow:
> no counter, → never runs into them, → on them does nothing. `/` or Ctrl/⌘K opens a palette (title, tags, notes;
> backup slides first, main scenes second); Enter fades there; Esc (or ← at its start) returns to the exact scene
> and step. The presenter window lists them and shows "in backup — Esc returns to 05/14". Export adds an
> "Appendix" divider and the slides at the end. Plan 2–5 per talk from the "Likely questions" table (§9).

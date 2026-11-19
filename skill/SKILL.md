---
name: "animated-web-deck"
description: "Animated web presentations (React + GSAP) that look like a product launch page, not slides. Uses the sahna toolkit: creative dial, style packs, diagrams, data, 3D world, recording, PDF/PPTX."
---

# Animated web deck

Use when someone wants a presentation that feels like a designed web experience instead of classic slides: animated scenes, a strong intro, clean transitions, presented from a laptop in Chrome. Works for any topic and audience — a product pitch, a course defence, a research talk, an incident report.

The concept is NOT fixed. A website header with tabs and a ghost cursor is one concept among many, not the default. Every deck starts with a concept workshop (§0.2): Claude reads the material, proposes distinct concepts, and decides the look, the navigation and the "hand" together with the user before writing code. The engine (§2–3), export (§10) and checks (§11) are the same for every concept; the chrome, transitions and the hand are modules chosen per concept (§5–7).

How bold it looks is a decision the user makes: the **creative dial** (`DECK.style`: `academic`, `balanced` or `showcase`, §0.2a). The default goal is a deck that feels like a modern product launch page, not a slide deck. Academic is a choice for juries and projectors, not the fallback.

The engine is not rewritten per deck. Copy `assets/starter/` and write only the concept: tokens, config, data, scenes and chrome.

| Folder | What | Section |
|---|---|---|
| `assets/starter/` | engine, transitions (incl. shared elements, through-zoom, shaders), dial, FX kit (`src/fx`), presenter view, rehearsal, presenting tools, backup slides, scripts | §1–3, §5, §11 |
| `assets/packs/` + `assets/tools/` | 8 style packs, `apply_pack.py`, `moodboard.py`, `pack_lint.py`, `fonts.py` | §0.2a |
| `assets/modules/diagram/` | architecture and system-design diagrams as data | §4 |
| `assets/modules/data-viz/` | data storytelling: big numbers, bars, lines, maps | §4 |
| `assets/modules/code-scene/`, `video-scene/` | code walkthroughs, embedded demo videos | §4 |
| `assets/modules/remote/` | phone remotes, synced viewers, phone recording | §12 |
| `assets/modules/world/` | spatial 3D world: the camera flies between scenes | §13 |
| `assets/showreel/` | one deck that uses everything: open it to see what each piece looks like | — |
| `assets/cli/` | the `sahna` command: menu for the user, `--json` subcommands for Claude | below |

Each module has a NOTES.md with install steps and its API. Read the NOTES of every module the brief uses before writing scenes.

If `assets/` is missing next to this SKILL.md (only the instructions were saved), say so and ask the user for the skill zip (`sahna-skill.zip` from the sahna releases), which contains the folder; do not rebuild the engine or modules from these notes.

## The sahna CLI (`assets/cli/`)

Every deck is driven by one command, `sahna` (*sahna* is Kazakh for "stage"), copied into each project as `sahna-cli/`. The user types `npx sahna` (a menu) or `npm run sahna -- <command>`; never tell them to run python, pip, docker or vite directly. Claude uses the subcommands with `--json` (one JSON document `{ok, command, data, errors[]}`, exit 0/1/2, never prompts) and follows `errors[].fix`.
- Environment first on a new machine: `npx sahna doctor --json`; `npx sahna doctor --fix` installs the pip packages and Chromium. On Windows the CLI finds Python via `py -3` (`SAHNA_PYTHON` overrides) and runs scripts in UTF-8 mode.
- Create: `node <skill>/assets/cli/bin/sahna.js new <dir> --pack <p> --style <dial> --lang <en|ru|kk> --modules <a,b> --title "<t>" --json` (copies the starter, applies the pack, installs the modules per their NOTES, runs npm install). Then work inside `<dir>`.
- Look: `npx sahna moodboard --packs a,b,c --content talk.json --json` (show `data.grid`), `npx sahna pack apply <p>`, `npx sahna style <academic|balanced|showcase>`, `npx sahna lang kk`.
- Modules later: `npx sahna module add <name> --json` (diagram, data-viz, code-scene, video-scene, world, remote).
- Verify (§11): `npx sahna check --json` while working, `npx sahna check --style all --json` before delivery. It builds when stale and runs walk, overlap, transitions, seek, wow and the installed modules' checks; fix every row with `status: "FAIL"`, then open the contact sheets in `artifacts[]`. `npx sahna film --json` for transition sheets.
- Export (§10): `npx sahna export --json` gives `data.pdf` and `data.pptx`.
- Rehearsal (§11a): `npx sahna rehearse report <file> --compare`. Recording (§12): `npx sahna record | stop | mix | links`.
The sections below name the underlying scripts; prefer the CLI commands when telling the user what to run.

Deliver: a single offline HTML (the thing you present), a PDF and a PPTX of the same scenes (for upload systems, graders and a dead-laptop fallback), a zip of the project without node_modules/dist, and a speaker script doc if several people present.

## 0. Before building

### 0.1 Content

- Collect the content first: talk length, who presents which scenes, what each scene must say, the audience, and any brand kit (logo SVG, colours, fonts). Research facts before writing scenes. Every number on a slide must come from a source you can name.
- Ask how it will be submitted (file upload? which format?) and where it will be shown (own laptop or a classroom PC). Unknown = build all three formats.

### 0.2 Concept workshop — propose, discuss, then build

Do this every time, after the content is known and before any code. Do not silently reuse the concept of a previous deck.

1. **Read the material and say what you see.** In 3–5 lines: what the story really is (a mystery? a mechanism? a journey? a comparison? a pitch?), which 2–4 moments carry the talk, what the audience will remember, and what the subject itself looks like (code, a map, a document, a machine, people, a timeline). The concept should come from this, not from a template.
2. **Propose 2–3 concepts that really differ** (not colour variants of one idea). For each give:
   - a one-line pitch and why it fits THIS topic;
   - chrome: what is always on screen (header with tabs, a minimap, a time axis, a terminal frame, nothing);
   - navigation grammar: how one scene becomes the next (§5);
   - the hand: who "acts" on screen — ghost cursor, highlighter pen, typing caret, camera, a persistent object, or nobody (§7);
   - 2–3 signature moments tied to real scenes of this talk ("scene 7: the pointer jumps over the end marker and the heap pours into the response");
   - tone, palette direction, fonts;
   - risks (too playful for a jury, dark on a projector, hard to read from the back, too much work for the time left).
   Mark one as recommended and say plainly when one is weaker for this audience.
3. **Discuss.** Ask the dial question and show the mood board (§0.2a), then ask the user to pick or mix (AskUserQuestion: concept; then the elements that are easy to get wrong — cursor yes/no, header yes/no, light, dark or both, motion intensity calm/medium/bold, live or recorded and how many presenters (several, online or recorded → §12)). If they cannot decide from words, offer quick stills: a static HTML mock of the cover and one signature scene per concept, screenshotted (no engine, ~15 min each).
4. **Write a short concept brief and confirm it**: concept, chrome, hand, transition grammar, palette and fonts, per scene one line with its signature animation. Build only after the user says yes. If the user is not there to answer, pick the recommended concept, state the brief at the top of the reply and build.

### 0.2a The creative dial, style packs and the mood board

Ask together with the concept (AskUserQuestion): "How bold should this look?"

| | academic | balanced | showcase |
|---|---|---|---|
| For | juries, teachers, research, a projector in a lit room | course projects with a demo, internal talks, most talks | pitches, launches, demo days, hackathons, recorded videos |
| Scenes | light; calm | dark cover and end, light content | dark-first, glass, aurora, depth |
| Type | big statements, numbers roll | + masked line reveals, weight | + decode text |
| Light | none | beams on diagrams | beams, spotlight, dot-grid glow, aurora |
| Transitions | rise, push | overlays at speaker changes, shared elements, one through-zoom | + WebGL shaders at 2–3 speaker changes, protagonist object, spatial world |

Recommend one and say why; the user decides. Store it as `DECK.style`; `?style=` previews another setting without editing. Every component asks `allow(feature)` and degrades by itself (shader → overlay → push; decode → mask reveal; aurora → still gradient), so switching the dial never breaks a deck. Never branch on the style inside scenes except through `isDark()`.

Always on, at every setting: body ≥ 24 px and labels ≥ 18 px on the 1920 stage, contrast checked including the projector simulation, reduced motion, keys only, clean export end states, and a frame budget (one GPU-heavy effect per scene; loops only on screen).

Then the look:
- Propose 2–3 style packs from `assets/packs/` that fit the concept and the dial: midnight (dark product), aurora (launch), swiss (grid, huge type), terminal (mono, phosphor), brutalist (raw data), oyu (modern Kazakh geometric ornament; have it checked by a Kazakh designer before a public talk), paper (warm research), calm (projector-safe academic). Or build a new one in `packs/_build.py` and check it with `pack_lint.py`.
- Show them, don't describe them: put the real title, three signature points and one number in `talk.json` and run `python assets/tools/moodboard.py --packs a,b,c --content talk.json --out moodboard/`. Show `moodboard/grid.png` and recommend one.
- `python assets/tools/apply_pack.py <pack> --project . --install` writes tokens, fonts, motion and `DECK.style`. It refuses a pack whose fonts miss the talk's letters. Apply the pack before hand-tuning tokens; it overwrites `theme.css`.
- Use pack tokens and `pk-*` classes in scenes, never raw sizes or colours, so a pack switch restyles the deck.

Premium means restraint:
- one display face with tight tracking, one glow hue plus one warm accent for the single thing that matters, hairline borders, big empty space;
- `expo.out` for entrances, `power3.inOut` for moves; no rainbow gradients, no spinning, no bounce on content;
- light is a material: at most one light effect per scene (aurora OR beams OR spotlight OR dot glow), and it points at the scene's idea;
- three to five signature moments per talk get the motion budget; everything else is quiet so they land.

Plan the talk as one film, not a stack of slides:
- every scene change is motivated: the next scene comes out of something in this one (a shared element flies, the camera dives through a letter or a screen, a card expands, the camera travels across one world). Plain fades are for going back.
- a **protagonist** (balanced optional, showcase recommended): one object that carries the story through the talk and changes shape only when its meaning changes (signal → node → mark).
- steps are beats (setup → tension → reveal), not bullets appearing.

Concept catalogue — starting points, not defaults. Combine or invent:

| Concept | Chrome / navigation | The hand | Fits |
|---|---|---|---|
| Website or product of the topic | capsule header, sections as tabs, push between sections (§6) | ghost cursor clicks tabs and cards (§7) | products, platforms, web companies, SaaS pitches |
| Case file / evidence board | none; one big board, camera pans to each pinned item, red thread drawn between items | camera + stamp ("CONFIRMED") | incidents, investigations, history, forensics |
| Terminal / log stream | terminal window frame; each scene is a command and its output; clear or new tab between scenes | typing caret | security, dev tools, systems, CLIs |
| Infinite canvas / map | no header, minimap with a dot as progress; camera flies between regions of one world layer | camera | architecture, geography, ecosystems, supply chains |
| Living document / paper | page frame, scroll between sections, margin notes appear | highlighter pen and margin comments | research, law, literature, policy |
| One object that morphs | none; a central object stays on stage and transforms between scenes (GSAP Flip) | the object itself | one mechanism explained deeply (a cell, a memory buffer, an engine) |
| Editorial / magazine | issue masthead; big kinetic type, full-bleed images, vertical page turns | none | humanities, social topics, storytelling |
| Mission control / dashboard | status bar with clocks and counters; panels swap | live counters and alerts | operations, data-heavy talks, live demos |
| Timeline scrubber | persistent time axis at the bottom, playhead moves between scenes | the playhead | history, chronology-driven stories |
| Product launch film | none; dark stage, aurora hero, bento of numbers, device frames that flatten, one protagonist | the protagonist + spotlight | pitches, launches, demo days |
| Spatial world | scenes are panels in 3D space; overview shot on O (§13) | the camera | journeys, ecosystems, "tour of the system" |

### 0.3 Tone and planning

- The dial (§0.2a) sets the tone. Within any setting, motion must explain or carry the story; never animate for its own sake.
- Plan scenes: one idea per scene, ~30–50 s each, 1–4 steps (key presses) per scene. Titles are statements ("Coverage drops as terms get deeper"), not topic labels. Write speaker notes per step with `(→)` markers while planning, and a handoff line at the end of each speaker's part ("Now X will show…").
- Every scene needs a meaningful END STATE: it will be printed as a static page. A reveal that only works in motion (question → answer) gets two pages in the export.
- Design: no bullet walls. Big type, clear hierarchy, cards, bento grids, real icons and real UI, generous space, colours as tokens. Light content scenes in academic and balanced (projectors wash out dark ones); dark content only in showcase, and then check the projector simulation (§11).

## 1. Stack

- Vite + React + TypeScript + Tailwind v4 (colour/font tokens in `@theme`).
- GSAP 3 with plugins (free): DrawSVG, SplitText, MotionPath, Observer, `@gsap/react` `useGSAP`.
- Icons: lucide-react; tool/brand logos: simple-icons (CC0) on white rounded tiles.
- Fonts: Fontsource packages (offline), from the style pack. Starter defaults: Geist Variable (display), Inter (text), Geist Mono (labels, code); all cover Kazakh. Preload every face with `document.fonts.load(...)` for a sample string in the target language, then `await document.fonts.ready`, then mount.
- CHECK GLYPH COVERAGE for the presentation language before choosing fonts (fonttools + brotli on the woff2 files of the `*-ext` subsets). Many monospace fonts lack extended Cyrillic/Latin (e.g. Kazakh ә ғ қ ң ұ һ): JetBrains Mono lacks them; IBM Plex Mono, Fira Code/Mono, Roboto Mono, Source Code Pro and Noto Sans Mono cover them; DM Mono, Space Mono and Inconsolata have no Cyrillic at all. Rule: monospace only for code/English terms; never put local-language text in the mono class.
- Optional: three + @react-three/fiber for ONE hero visual (e.g. an extruded map), canvas-confetti for one celebration moment.
- `vite-plugin-singlefile` in a `--mode single` build with `assetsInlineLimit: 100_000_000`, `cssCodeSplit: false` → `dist-single/index.html` works from file:// with no internet. `base: "./"`.
- Start from `assets/starter/`: copy it, `npm install`, then edit only `src/theme.css` (tokens), `src/deck/config.ts` (title, footer, speakers, budget, transitions per scene, `darkTheme`, flags), `src/data.ts` (every number, once), `src/scenes/*.tsx` + `src/scenes/index.ts` (order and meta: id, title, steps, notes[], speaker, section, source, appendix, tags, twoPage, hero, full), `src/ui/kit.tsx` and the concept's chrome. Leave `src/deck/*` alone unless the concept needs an engine change. Scenes import `SceneRoot, useScene, useSceneStep, useSceneActive, useDeckControl, deckRuntime` from `../deck`; side effects (hand, confetti, media) act only when `deckRuntime.forward` is true. Delete the three example scenes when the real ones exist.
- Tokens: the pack schema in `src/theme.css`; the `.dark, .scene.hero` block is the look of every dark scene (and of the T toggle when `darkTheme: true`). Charts use `--color-chart-1..5`. Never raw hex in scenes.
- Scenes use `<FxScene kind="hero|content">` (or `SceneRoot hero={isDark(...)}`) with meta `hero: isDark("hero" | "content")`, so the dial decides which scenes are dark.
- `DECK` fields: `style`, `locale` (`?lang=`; also sets `<html lang>`), `darkTheme`, `sound`, `enter`, plus title, footer, speakers, budget and flags.

## 2. Engine (starter: `src/deck/`)

The starter implements §2–3. Read them to understand and adjust the engine, not to rewrite it.

- Stage 1920×1080, `position:absolute; left:50%; top:50%; transform: translate(-50%,-50%) scale(min(w/1920,h/1080))`. Not CSS grid centering (breaks at 1280×720).
- Every scene builds ONE paused GSAP timeline in `useScene((tl, q) => {...})` inside `gsap.context`. Labels `s0` (end of entrance), `s1`, `s2`, … = end of each step. After building: add `s0` if missing, and stretch the timeline if a label sits after the last tween: `if (last > tl.duration()) tl.set({}, {}, last)`.
- Register timelines in a context; start the first scene only when ALL scenes registered (Set + started flag). No React StrictMode (double registration).
- Driving: `driver = tl.tweenTo(label)`, kill the previous driver first.
- JUMPING (scene change, going back, print, export): use `tl.pause(); tl.seek(t, false)`. `tl.pause(t)` suppresses callbacks, so `onUpdate`-driven counters and typed text freeze at the wrong value.
- `next()`: if the current part is still playing (`tl.time() < min(label(step), duration) - 0.05`) → by default IGNORE the press; Shift+→ finishes it quickly (`duration: 0.35`). Accidental fast-forward is how presenters lose the best moments (if the user prefers the old fast-finish on press, make it a flag). Otherwise go to the next step; after the last step → next scene. `prev()`: step back with a short tween; at step 0 → previous scene seeked to its last label.
- Keys: →/Space/PageDown/Enter next, Shift+→ skip, ←/PageUp back, 1–9/Home/End jump, F fullscreen, N notes overlay (not in `?remote` links, so it never reaches a recording; `?notes` shows them), P presenter window, G ghost cursor on/off (only if the concept has one), T theme (only with `darkTheme`), R replay intro, ? help; presenting tools B/W, hold X, D (§2.1); `/` or Ctrl/⌘K search, Esc return (§2.2). Match by `e.code` first so the keys work on any layout (Cyrillic included), with `e.key` as fallback.
- A MOUSE CLICK ON THE STAGE DOES NOT ADVANCE. Only keys drive the deck (presentation remotes send PageDown/→, so they still work). The real mouse is for chrome (tabs, minimap) and pointing at things; a click-to-advance listener makes the deck jump whenever the presenter touches the touchpad. Hide the real cursor after ~2 s without movement (`body.idle * { cursor: none }`). Wheel/touch via GSAP Observer only if asked, with its OWN lock variable (not the busy flag used by transitions).
- `busy` ref blocks input while a scene transition plays.
- Contexts: `useSceneActive()` (pause heavy canvases off-screen: R3F `frameloop={active ? "always" : "never"}`) and `useSceneStep()` (for loops tied to the current step).
- `#print` mode: every scene at its end state, one per page. `#<scene-id>` opens a scene directly.
- Export API on `window.__deck`: `ready()`, `ids`, `steps`, `notes`, `titles`, `setExport(bool)` (hides step bars and notes, makes chrome animations instant), `show(i, step | "end")` (instant, no transition, seek with events). Used by the PDF/PPTX export (§10).
- Reduced motion: `gsap.globalTimeline.timeScale(25)` and skip transitions and the hand.
- Presenter view at `#presenter` (second window): timer, per-speaker timer, current notes, next-step note, next scene, and a status chip "animation running" / "ready — press →". Synced with BroadcastChannel + localStorage fallback; arrows there drive the deck.

### 2.1 Presenting tools

Built into the starter, off in export and never visible in `#print`:
- B black screen, W white screen. The same key or any nav key lifts it without moving.
- Hold X: laser dot that follows the real mouse (`DECK.laserKey`; not L, which the video scene uses).
- D: pen over the stage (mouse or pen). Backspace undoes a stroke, C clears, Esc leaves. Strokes clear on scene change.
Mention them in the speaker doc ("hold X to point at the number, D to circle it").

### 2.2 Q&A backup slides

- Plan 2–5 backup slides from the likely questions (§9): a number's method, an architecture detail, a cost, a comparison. Put them at the end of `scenes` with `appendix: true` and `tags`.
- They are outside the flow: no counter, → never runs into them, → on them does nothing.
- `/` or Ctrl/⌘K opens a search palette (title, tags, notes; backup slides first, main scenes second). Enter fades there; Esc, or ← at its start, returns to the exact scene AND step.
- The presenter view lists them and shows "in backup — Esc returns to 05/14". Followers in a synced talk (§12) go along.
- Export adds an "Appendix" divider page and the backup slides at the end.

## 3. Step bars (bottom right) — the presenter's dashboard

One bar for the entrance + one per step. Each bar fills in real time from its timeline segment, so the speaker sees when an animation is finished and when to press →:

```tsx
const bounds = Array.from({ length: steps + 1 }, (_, i) => [
  i === 0 ? 0 : labelTime(tl, i - 1),
  labelTime(tl, i), // min(tl.labels[`s${i}`] ?? duration, duration)
]);
const update = () => {
  const t = tl.time();
  fills.forEach((el, i) => {
    const [a, b] = bounds[i];
    const f = b - a < 0.01 ? (t >= b - 0.001 ? 1 : 0) : Math.min(1, Math.max(0, (t - a) / (b - a)));
    el.style.transform = `scaleX(${f})`;
  });
  // waiting cue: current segment done → pulse the next bar, or after the last step show a pulsing → chip
  const done = t >= bounds[step][1] - 0.02;
  const wait = !done ? -1 : step < steps ? step + 1 : steps + 1;
  // toggle .bar-wait on track[wait]; toggle .cue-on on the → chip when wait === steps + 1; post {type:"wait"} to the presenter
};
gsap.ticker.add(update);
```

- Size at least 64×8 px on the 1920 stage (they shrink ~0.67× on a 1280 laptop), rounded, track translucent ink, fill = primary (hero scenes: light). Waiting bar: tinted track + pulsing box-shadow ring. Next to them only the scene number (`03/14`) and the → chip, no speaker names on screen.
- TAILWIND v4 GOTCHA: `scale-x-0` sets the CSS `scale` property, which wins over a JS-set `transform`, so the bars never fill. Never put `scale-*`/`rotate-*`/`translate-*` utilities on elements whose transform is driven by GSAP or `style.transform`; set the initial value inline (`style={{transform: "scaleX(0)"}}`).

## 4. Scene animation recipes

- Intro: build the logo from its layers (shapes scale in, strokes drawn with DrawSVG, a mark drops in with a bounce + ping ring), then the wordmark reveals with SplitText (`mask: "chars"`), then the lockup moves into place.
- Headings: eyebrow + title in with a short y/opacity stagger (one shared `enterHeading` helper).
- Counters: use the kit's `counter()` or the FX `odometer()`. The markup holds the initial value; never write text at build time and never call `tl.progress(1)`.
- Typing / live search: write `"query".slice(0, n)` in `onUpdate`, blinking caret via CSS, result rows stagger in after. Good as an audience-question moment; let the ghost cursor (§7) click into the field first.
- Charts: build bars/lines as HTML/SVG from the data object; bars `scaleY` from the baseline, value labels count up; reveal series per step; one callout with the conclusion.
- Process/status pipelines: chips light up per step, optionally a phone mock shows the message, one celebration at most (confetti in brand colours, `zIndex` below the transition layer, fired from a dummy tween's `onStart` so it only fires going forward and never in print/export).
- Architecture diagrams: nodes pop in, links draw with DrawSVG, then an endless packet LOOP per step (separate timeline with `repeat:-1`, rebuilt on step change, killed on leave): dots ride paths with MotionPath (`align`, `start/end` for the reply direction), nodes glow on arrival, active links get a moving dotted overlay (CSS `stroke-dashoffset` animation), inactive links dim; a small `LIVE · 1 · …` caption per step.
- Timelines/roadmaps: draw a line or a brand shape, drop milestone markers with a stagger; a second row for a parallel track (e.g. world vs local history).
- Term pairs (code vs word, original vs translation): give each side its own typeface (mono vs serif italic) so the contrast is visible before it is read.
- SVG transforms: use `svgOrigin`, not `transformOrigin`; set `immediateRender: false` on later tweens of the same element.
- Prevent wrapping of chips/labels with `whitespace-nowrap`.
- GSAP labels: add a label before any tween references it (`"s2+=0.3"` on a label that does not exist yet is resolved at the END of the timeline).
- Kit components with default classes (e.g. a Card with `bg-surface`): a second `bg-*` class passed in does not reliably win in Tailwind v4. Override colours via `style` or a `tone` prop, never by stacking utility classes.

### FX kit (`src/fx`, in the starter)

- Wrap scenes in `<FxScene kind="hero" | "content">` and set the meta `hero: isDark("hero")` (cover, end) or `isDark("content")`, so footer and chrome match.
- Hero: `<Aurora>` around the visual focus + `<Grain/>`; title `maskLines`; subtitle `decode` on step 1 (showcase scrambles, others reveal).
- Numbers: `odometer(tl, el, from, to, at, { format })` for key numbers (allowed in academic). In a bento, `<BentoCard kind="stat">` + `bentoIn` rolls them all.
- A card that matters: `beam` on a BentoCard (showcase) or `<BeamPath>` along a diagram link (balanced+).
- Product UI: `<DeviceFrame kind="browser|laptop|phone" tilt>` with real-looking HTML inside; `deviceIn` on the entrance, `flatten` on step 1, then `<Spotlight>` inside the screen + `spotlightTo` and a callout card. Academic gets a focus ring.
- Depth: `<Parallax>` with 2–3 `<Layer depth>` and `camera()` per step; a `<Glass>` panel holds the message. Under Glass use `<Aurora loop={false}>` and nothing else that loops.
- Protagonist: states in one file; each scene `protagonist.start(tl, q, prevEnd)` then `protagonist.to(...)`, and `<ProtagonistSlot/>` in every scene that uses it (it draws the static copy for export).
- Variable weight: `weight(...)` once per talk, on the closing line.
- Loops (aurora, beams) run only while the scene is on screen and never in export. Never put `mix-blend-mode`, `filter: blur` or a full-scene mask on something that animates every frame.

### Architecture and system design diagrams (`assets/modules/diagram`)

- Write the system as data: `src/graphs/<name>.graph.json` with nodes (title, sub, icon, tone, group), groups (column, row, grid, free), edges (dashed, hot, label, both) and named `flows` (hop lists; `"<id"` for replies). One graph per zoom level (context → containers → components, the C4 idea) linked by `inside`. Never place boxes by hand; `pin` only for side chains that run off the stage.
- `scripts/layout.mjs` runs ELK before dev and build and validates the JSON; fix every error it prints. Keep each level within ~5 layers so text stays ≥ 18 px.
- One idea per step: `d.flow(name)` (path lights up, numbered hops, the rest dims), `d.zoom(node)` (the node grows into a panel and its inside builds; ← zooms out), `d.toSequence(flow)` when the order of calls matters, or a kit: tenant isolation, failure and recovery, scale-out, trace waterfall, state machine.
- Build a system up one request at a time; never show everything and explain afterwards. The outer level stays at 5–9 boxes.
- Ambient packets and beams only through `useLive` (while the step is on screen); export shows the end state, so it must explain itself (lit path, hop numbers, counters, captions).
- Check: `python scripts/diagram_check.py all` (shots per style, seek identity, text fit, frame times).

### Data storytelling (`assets/modules/data-viz`)

- Every number lives once in `src/data.ts` with its `source`. Compute totals, shares, ratios and growth in code; never type a derived number. Label sample data as sample data.
- One idea and one highlight per chart; say the conclusion in a statement title and one callout.
- Pick the form by the job: one number → `BigNumber` (then fly it into its card); compare → `BarChart` or `RatioBars`; rank over time → `BarRace`; trend → `LineChart` with notes pinned to dates; part of a whole → `Waffle`; stages → `Funnel`; place → `GeoMap`.
- Honest geometry: bars start at 0, one scale per chart and per race, ratios computed.
- Colour is never the only signal: direct labels, markers, shapes, numbers. Chart text ≥ 18 px, values ≥ 26 px.
- Format with `fmtNum` per `DECK.locale` (en, ru, kk; tenge ₸). Kazakh is formatted by the module, not by `Intl` (Chrome may lack the locale).
- Maps are built at build time (`scripts/geo-build.mjs`, d3-geo dev-only). Kazakhstan from Natural Earth has the pre-2022 regions: use the merged names and keep the boundary note.
- Check: `scripts/seek_check.py` (forward = back = jump; counters exact in export) and `viz_contrast.py`.

### Code scene (`assets/modules/code-scene`)

- Highlight at build time, never at runtime: the `codeScene()` Vite plugin (first in `plugins`) with `shiki` as a devDependency only. Put samples in `src/scenes/code/` and import them with `?shiki` (last query parameter). Add `.txt` to `.ts/.tsx/.js` samples so `tsc` skips them.
- Diffs: `// +` and `// -` at line ends, or a before/after pair with `?after=./new.go&shiki`.
- `<CodeBlock code={...} />` (26 px, at most 16–18 visible rows, about 65 characters per line), `codeIn(tl, q)`, then `codeSteps(tl, q, STEPS)` with one object per step:
  - `focus`: the rest dims and blurs, a bar sits behind the range;
  - `diff`: removed lines go red and collapse, added lines go green and expand, line numbers renumber;
  - `run` + `values`: a marker walks the request path, with short notes at line ends ("38 ms");
  - `scrollTo` and `type`.
  Steps are plain property tweens, so ←, jumps and export need nothing extra. Line references are lines of the source as written (`a:`/`b:` for the after/before file of a pair).
- One idea per step, 3–4 steps per scene. Say the point in a `<CodePanel>` card in the sans font, not in code comments. Annotate only short lines, because notes on long lines get clipped.
- Mono only for code. If comments or strings hold local-language text, use a mono font that covers it (§1). Ligatures are off, because typing assumes one character per cell.
- The last step is the printed end state: added lines keep their green tint.

### Embedded video scene (`assets/modules/video-scene`)

For a demo or screen recording inside the deck. Do not write a player per deck.
- Put the video in `public/media/` and pass `src: "media/x.mp4"`. Never import it, or the single file inlines it. Import a small poster instead. Ship `media/` next to the HTML and say so in the README.
- Intro: `morph`, `card` or `fade`. Outro: the intro backwards, at a given time or at the end.
  - `morph`: the mark builds, the first frame opens from it, and the mark lands on the logo in the video.
  - `card`: the video opens from a card of the previous scene.
- For `morph`: pick `startAt` on a still logo frame, measure the logo with `tools/measure-rect.py`, and pass it as `target` in video pixels with `videoSize`. Check frames just before and after the handoff; nothing may jump.
- Meta: `steps: 0, full: true, twoPage: true`. Notes: "Do not speak; Next twice skips; Back = previous chapter".
- While it plays, the scene owns the keys: Next asks, then skips to the outro; Back goes to the previous chapter; K pauses; J/L jump chapters. After the outro, Next moves on. It plays only when the deck goes forward, never on seek, jump, export or print.
- A missing file shows a card with the expected path, and Next continues. If the browser refuses sound, the video plays muted until the next press. Export gives the poster plus a page with the chapter list.

## 5. Transitions — pick ONE strategy (from the concept brief)

Transitions play only going forward to the next scene; going back = simple fade. The concept decides the grammar; the options below are a toolbox.

- **The dial picks the default grammar** (`src/deck/grammar.ts`) and degrades what it does not allow: shader → nearest overlay → push at a speaker or section change, else rise. Academic = rise and push; balanced = overlays at speaker changes, shared elements, one through-zoom; showcase = everything, with 2–3 shaders at speaker changes. Ask for a kind with meta `enter` (or `DECK.enter`); `?tr=id:kind` tries one without editing.
- **Every transition must come out of something in the old scene.** If nothing motivates it, use rise.
- **Shared elements (all styles):** `data-shared="key"` on one element in two consecutive scenes; on → it flies from the old rect to the new one (size, radius, colour, content crossfade) above everything, and a default transition becomes a morph. In the incoming scene never animate that element or its content in the entrance; animate its content from step 1.
- **Through-zoom:** meta `exit: { through: ".sel" }` dives through that element (a headline's full stop, a solid dot, a device screen) and the new scene grows from 0.85. Give the next scene the element's colour as its background. Once per talk in balanced.
- **Shaders (showcase):** `liquid`, `waves`, `dissolve`, `sweep`. WebGL covers in theme colours, no DOM snapshots, compiled and benchmarked at load; a slow or missing GPU plays the overlay fallback. Check `__deck.gl()` on the presenting laptop; film headless with `?gl=force`.
- **Spatial world:** scenes as panels in 3D space and the camera flies between them (§13).

A) Variety (pitches, demo days): give every scene its own kind (map `ENTER: Record<sceneId, kind>`); put the four biggest where the speaker changes. All 2D GSAP, 1–2 s. Colour = brand primary/accent, shapes = the brand mark.

B) Coherent metaphor (academic talks): one grammar for the whole deck, taken from the concept. Example for the website concept, "site navigation": a persistent header; between sections the ghost cursor clicks the next tab, then the content pushes horizontally (direction = section order); inside a section it rises softly (y 56 → 0) while the old one lifts and fades fast (~0.3 s, so they barely overlap); the header's active indicator travels to the new tab. Calmer and easier to follow.

C) Camera over one world (canvas, map, evidence board, timeline): all scenes live on one big layer at fixed world coordinates; a scene change tweens the layer (`x`, `y`, `scale`) so the camera flies to the next region (~1.2 s `power3.inOut`, slight zoom-out in the middle for long jumps). Off-camera regions dim to ~0.25 opacity; a minimap or time axis shows where you are. In export, set the camera instantly per scene.

D) Persistent object (morph): one element stays on stage across scenes and changes shape, size and position (GSAP Flip: `Flip.getState` before the swap, `Flip.from` after), while the rest of the scene fades around it. Use for one mechanism followed through the whole talk.

Overlay kinds (cover → `swap` scenes under it → reveal → `start` next entrance):
- shape mask: the brand mark (simple, notch-free silhouette) grows from the centre to cover, then a mark-shaped hole (SVG `<mask>`) grows to reveal; accent outline with `vector-effect: non-scaling-stroke`.
- pixels: 16×9 grid of primary-colour squares, `scale` 0→1 with `stagger: { grid: [9,16], from: "start", amount: 0.55 }`, then back to 0; one in ~40 squares in the accent colour.
- curtain: 6 panels with an accent top edge, `yPercent` 102→0→-102, stagger 0.06.
- stroke wipe: a thick brand path (stroke ~430) drawn with DrawSVG, a marker rides its head with MotionPath, fill, then draw off `100% 100%`.
- split: two halves fade in, an accent seam line `scaleX` 0→1, halves open up/down (good from a dark cover).
- blinds: 8 horizontal stripes `scaleY` from top, then away from bottom (good into a dark end scene).

Scene-over-scene kinds (new scene on top with `zIndex` and a temporary background; clear props after):
- circle reveal: `clip-path: circle(r at 50% 50%)` + an accent ring div of the same size; old scene scales to 0.94.
- push: new scene `x: 1920 → 0` with a soft shadow, old `x: 0 → -560`, opacity 0.4.
- diagonal wipe: `clip-path: polygon(x1% 0, 140% 0, 140% 100%, x2% 100%)` with x2 = x1 + 35, an accent line following the cut.
- zoom: old scale 1.12 + fade out, new 0.9 → 1 + fade in.

Shared-element kind (fits strategy B too):
- card expand (container transform): the outgoing scene names a card in its meta (`exit: { expand: ".selector" }`). On the forward press the ghost cursor (§7) clicks the card, then: clone the card (`cloneNode(true)`), place the clone absolutely at the card's rect in stage coordinates, hide the original, fade the clone's children (0.2 s), tween the clone to the full stage (`left/top 0, 1920×1080, borderRadius 0, backgroundColor = page background`, ~0.8 s `power3.inOut`) under the header but above the scenes, swap scenes under it, start the next entrance, fade the clone and remove it. Use it once or twice per talk, where the next scene really is "inside" that card.

## 6. Chrome modules (only what the concept brief chose)

Other chrome, briefly: a minimap (small world outline + moving dot, for strategy C), a time axis with a playhead (timeline concepts), a terminal frame with a tab bar (terminal concept), a masthead with issue and page number (editorial), a status bar with clocks/counters (mission control). Keep chrome thin, out of the content area, and instant in export mode.

Site-style header — only for website/product concepts: a floating capsule header (`inset-x 40px, top 20px, rounded-full`, translucent white + `backdrop-blur`, soft shadow), logo left, sections as tabs in a segmented track, the active tab = a dark pill that slides (`gsap.to(pill, {x, width})` from the tab's `offsetLeft/offsetWidth`), a search pill with a `⌘K` hint on the right. Delay the active tab's text colour change (~380 ms) so white text never sits on the light track before the pill arrives. In export mode set the pill instantly (`killTweensOf` + `set`), or screenshots catch it mid-way. Clicking a tab with the real mouse jumps to the first scene of that section. Scene meta gets a `section` field. Content area starts below the header (~112 px). Lift the tab button refs to the deck so the ghost cursor can target them.

## 7. The hand — something that acts on screen (optional)

Choose per concept; "none" is a valid answer (editorial, calm academic talks). Options:
- ghost cursor (below) — only when the concept is a UI being used;
- highlighter pen: a marker stroke drawn with DrawSVG under key words or numbers, plus margin notes (document concepts);
- typing caret: commands and text typed in `onUpdate` (terminal concepts);
- camera: the moving viewport itself is the hand (strategy C);
- laser dot / magnifier lens: a soft dot or a circular zoom lens that moves to the key detail (diagrams, code);
- a persistent object (strategy D).
Same rules for all of them: they act only when the deck plays forward at normal speed, they are hidden on going back, skips, jumps and export, and they are used 3–5 times per talk, not on every step.

### Ghost cursor

A drawn cursor that is part of the animation (the presenter still only presses →). It makes a website-like deck feel used, not played.

- ONE global cursor for the whole talk (`ghost` singleton + a layer in the stage, `z` above everything, `pointer-events: none`). It REMEMBERS its position: every move starts where the last one ended, so tab clicks never start from the same spot. After a tab click it drifts into the content to a per-scene rest point and fades out (`restPoint(i)` = deterministic pseudo-random spot), then reappears there next time.
- Path: quadratic Bézier from current position to the target, control point offset perpendicular to the line by `dist × (0.10–0.22)`, side alternating per move; duration from distance (`clamp(0.5, 1.1, 0.42 + dist/1900)`), `power3.inOut`. Compute the bezier in `onUpdate` (no plugin needed).
- Looks: arrow while moving; on arrival switch to a hand over clickable things (tabs, cards) or an I-beam over inputs; add a `.gh-hover` class to the target (tab gets the hover background, card gets a lifted shadow). Click = scale 0.82 → 1 (`transformOrigin: 0 0` so the tip stays) + a ripple ring at the tip. Auto-hide after ~1.5 s idle. Draw the SVGs yourself, ~40 px tall on the 1920 stage, white fill + dark outline + soft shadow.
- Target points come from `getBoundingClientRect()` divided by the stage scale, taken when the move starts, so start a move only after the target has finished its entrance.
- Inside scenes: a `cursorTo(tl, q, at, target, opts)` helper puts a `tl.call(...)` in the scene timeline; the visual consequence (focus ring, typed text, highlight) is a normal reversible tween placed after the cursor's arrival time. Reserve time for the move in the timeline (`tl.set({}, {}, "sN+=dur+0.15")` before the next label). Place calls at `"sN+=0.01"`, not exactly on a label: arriving on a label already fires callbacks sitting on it.
- Before a section change: on the forward press, `ghost.go(tabButton, {kind: "hand", click: true}).then(() => goScene(...))`; the header pill then slides as if the tab was really clicked. A real mouse click on a tab jumps without the ghost.
- Gating: the cursor moves ONLY when the deck plays forward at normal speed. Set `ghost.live = true` in `drive()` for forward tweens, `ghost.stop()` (hide + not live) on going back, Shift-skip, jumps, `__deck.show` and export. Otherwise the timeline callbacks fire while seeking and the cursor flies around.
- Dose: section changes + 3–5 meaningful in-scene actions (click a search field before typing, point at the key number, hover the answer). Not on every step.

## 8. Scroll inside a scene

When a scene has more content than fits (a full table, a long list, a document), make it scroll like a page instead of shrinking the text:
- A card with a fixed column header, a viewport (`overflow: hidden`) and an inner list moved with GSAP `y`. Compute stops at build time from the list's section headers (`offsetTop`, clamped to `scrollHeight - viewHeight`); one step = scroll to the next stop (~1.3 s `power2.inOut`).
- A thin custom scrollbar (track + thumb, thumb height = `track × view/list`, thumb `y` tweened with the list) and a white fade at the bottom so it reads as "more below".
- The hand, if the concept has one (cursor, lens), moves into the viewport just before each scroll and stays still while the content moves (like a wheel scroll).
- A side panel synced to the scroll (current section highlighted, counters count up when their section arrives) turns the scroll into an argument, not just a long list.
- Export: two pages (top and end) for such a scene. The overlap check (§11) will flag the hidden list; ignore content clipped by the viewport.

## 9. Speaker notes and script

- Notes live in each scene's meta: `notes[0]` after the entrance, `notes[k]` after step k. Write them in the language of the talk, the way the presenter speaks (plain words, short connected sentences). If the presenter has style rules, apply them, and run one review pass by a native-language editor/agent on titles, slide text and notes (titles as statements, ≤5–7 words per item, parallel form, no machine-translation calques).
- One presenter: no separate doc needed — notes overlay (N), presenter window (P) and PPTX notes cover it.
- Several presenters: a shared doc (docs connector if available):
  1. How to use: table speaker · scenes · time; what [→] means; the step bars and the waiting cue; do not press during a transition; mouse clicks do nothing; keys; before-the-talk checklist (open the single HTML in Chrome on the real machine, charger in, F, press through once).
  2. One section per speaker: per scene the time, what to wait for, the spoken text as quotes, **[→]** lines with what happens on screen, the handoff line, and the transition that follows.
  3. Likely questions: table question · who answers · 2–3 sentence answer, taken from the project's real decisions · the backup slide that shows it (§2.2: `/` + a word to open it).
- Keep the spoken text identical in the deck notes, the doc and the PPTX notes.

## 10. Export (PDF + PPTX)

`scripts/export.py` in the starter does this: Playwright (Chromium) on `dist-single/index.html`, viewport 1920×1080:

```python
await pg.wait_for_function("window.__deck && window.__deck.ready()")
await pg.evaluate("__deck.setExport(true)")
for i, sid in enumerate(ids):
    frames = [0, "end"] if sid in TWO_PAGE_SCENES else ["end"]   # question → answer, scroll scenes
    for k in frames:
        await pg.evaluate(f"__deck.show({i}, {json.dumps(k)})")
        await pg.wait_for_timeout(400)   # let chrome settle
        await pg.screenshot(path=...)
```

- PDF: `img2pdf` over the PNGs.
- PPTX: `python-pptx`, 16:9, one full-bleed picture per slide, speaker notes (with `[→ k]` markers) in each slide's notes. Tell the user the slides are images: right for viewing and presenting, not editable text.
- Backup slides come last, after an "Appendix" divider page. Scenes with `twoPage: true` (question → answer, scroll scenes, video scenes) get two pages.

## 11. Verify before sending

- `tsc -b` and both builds.
- `python scripts/seek_check.py`: forward, back and jump give the same DOM at every label; counters exact at "end".
- **Wow check:** `python scripts/wow_check.py --project . --out wow/` and open `wow/contact.png`. Fix every red scene (bullet lists, title + list, too many words, no visual, small type, empty bottom) by turning the list into one visual (cards, diagram, timeline, numbers revealed per step) and moving words to the notes. Fix amber warnings: text collisions, projector washout, dial mismatches. It sees end states only; judge motion by filming.
- Run every check at each style you ship (`?style=`): a deck meant for showcase should still pass at academic if it might be shown on a projector.
- Transitions: `scripts/film_transitions.py` (contact sheet per transition at exact times) and `scripts/check_transitions.py` (← is a plain fade, nothing left behind after a jump, frame times).
- Performance numbers from the sandbox are software rendering only. Tell the user to rehearse once on the presenting laptop; with `?rehearse` the presenter view records timing (below).
- `python scripts/walk.py` (presses → through the deck and checks the input rules, presenting tools and backup-slide return, then writes a contact sheet) and `python scripts/check_overlap.py`. Fix every FAIL before looking at screenshots.
- Screenshot every scene at its end state (`#print` or `__deck.show`) and look at a contact sheet. Check: counters show real values, typed text is there, nothing clipped, local-language text is not in the mono font.
- Overlap check by script, not by eye: per scene, max bottom of visible text ranges (`Range.getBoundingClientRect` over text nodes) and of visible boxes with a background or border (skip full-stage containers). Anything below the footer line (~1012 px on the stage) collides with the source line / bars.
- Walk the whole deck with the arrow key until the last scene with no page errors (wait for the waiting cue between presses, film frames every 250 ms around ghost-cursor moments and look at contact sheets); confirm a press during an entrance does NOT advance and Shift+→ does; confirm a mouse click on the stage does NOT advance and chrome navigation (tabs, minimap) does jump; confirm the hand (cursor, pen, lens) stays hidden after ←.
- Capture each transition at ~250/550/850/1150/1500 ms (strategy A), ~150/300/450/700 ms (strategy B) or ~300/600/900/1200 ms (strategy C/D) and look at a contact sheet; with a header, check the indicator lands on the right tab on every exported page.
- Readability for projectors: body text ≥24 px, labels ≥18 px on the 1920 stage; if a scene is only two-thirds full, enlarge content rather than leaving the bottom empty.
- Test the presenter sync and file:// for the single file.
- Headless WebGL needs `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`; it is slow, so GSAP lag smoothing slows timelines: wait longer, or pause the timeline and `seek()` to exact times for frames.
- Custom ribbon/strip geometries: check the triangle winding (back faces are culled and the mesh is silently invisible).
- Zip the project without node_modules and dist (include dist-single and a README with keys and the pre-talk checklist), send it with the HTML, PDF and PPTX, and say in one or two lines what changed. Tell the user to rehearse once on the real machine.

## 11a. Rehearsal

Give every main scene a `seconds` target. The presenter rehearses with `index.html?rehearse`: P for the presenter window, S to start, present, S to stop, V for the report (scenes that run long, per-speaker totals, seconds per step). Export the JSON and run `scripts/rehearsal_report.py <file> --compare` to compare runs. Cut or split scenes that run more than 15 % over; a step above ~20 s hides a monologue. The rehearsal UI is presenter-only.

## 12. Phone remote, synced viewers and recording (`assets/modules/remote`)

Use it when several people present, when the talk is online (viewers follow in their own browser instead of a laggy screen share), or when the talk is recorded. Install per its NOTES.md: copy the folder to `remote/`, add `ws`, the npm scripts (`record`, `stop`, `mix`, `links`) and the `.gitignore` lines. Speakers come from `DECK.speakers`; `remote/config.json` only overrides title, port, speakers and `mediaDir` (videos kept outside `media/`). Secrets (the OBS password) go only to the git-ignored `remote/config.local.json`. The starter sends the scene list to the server, so phones get the exact notes for every step.

The user only ever runs npm commands; never tell them to run python or docker directly.
- `npm run record`: builds the deck if stale, starts the server and a Cloudflare quick tunnel (Docker if it runs, else node + cloudflared), opens the control page and the lead deck, copies the team message with every phone link to the clipboard, and prints a QR code. Running it again reuses the running setup; a half-started run is cleaned up.
- `npm run stop`, `npm run mix` (latest take, finds the OBS file itself), `npm run links`.
- Lead and followers: the lead deck drives every other deck. Followers copy the lead's scene and step, not key presses, so a late joiner lands on the current step.
- Phones: one "I'm ready" tap (mic + headphones confirmed), then the speaker's own note big, a big Next that works only on their part (and waits while a video plays), a REC badge. Mic sends only a voice level for the speaker chip; details hide behind "…".
- Recording: OBS records the deck (Browser source 1920×1080 at 60 fps; laptop mic on track 2 as a backup). Each phone records its own speaker and uploads every 5 s to `recordings/<session>/`, so nothing waits for a call recording and a dead phone loses at most 5 s. The call (Meet or any other) is only for hearing each other: on the laptop, headphones on, phone page open with the screen on.
- OBS automation (obs-websocket v5, OBS 28+): one-time, enable the WebSocket server and put its password in `config.local.json`. Then Start on the control page (or Ctrl+R in the lead deck) starts OBS, counts 3-2-1 on every phone and plays the sync beep; Stop stops phones and OBS and mixes `final.mp4` (voices aligned and loudness-normalised under the video; needs ffmpeg). Without OBS reachable, everything works with OBS started by hand.
- The control page shows one status (WAITING, READY, REC, MIXING, DONE) and one button; keep it in its own window next to the deck, not a background tab.
- Give the team the six-line text `npm run record` copies, give the lead `remote/RECORDING.md`, and insist on one short test take with real phones and real OBS the day before. Docker, cloudflared, real phones and real OBS cannot be tested in the sandbox.

## 13. Spatial world (`assets/modules/world`)

Use when the concept is a space you fly through (a system tour, a product world, a "spatial" feel). Scenes stay DOM panels; only the camera moves, and only the scene change is replaced. Showcase gets full 3D with a depth layer; balanced gets 2.5D pan and zoom; academic turns it off.
- Install per the module's NOTES (copy `src/world/`, the `src/deck/host.ts` hook, `three`), then `installWorld(WORLD)` in `main.tsx`. Describe the world in `src/scenes/world.ts` with `world(path(…), ring(…), room(…), { moves })`; scene files import `../world/layout`, never `../world`.
- Layout: panels 1920×1080, at least 400 px apart, roughly facing the viewer; never put a panel on the line of sight between two consecutive scenes.
- Grammar: dolly between neighbours, orbit inside a ring of 2–4, drop or rise between levels, fly through a window into a room behind a panel, and one survey (out to the overview and back in) per talk. Moves 1.1–1.6 s, no roll, at most 90°/s turn (comfort mode 45°/s; long turns become fades).
- At rest the active panel has `transform: none` and everything else is hidden: text is as crisp as a flat scene, and export is unchanged. O opens the overview (1–9 flies there); export adds a "map of the talk" page.
- Depth comes from space, fog, light and a few abstract lines. No literal 3D props.
- The world replaces every scene change, so dives, card flights and shaders no longer play. Choose it as the concept's navigation, not as an extra on top of a transition-heavy film. Its example deck is `assets/modules/world/example`.
- Check with `scripts/world_check.py` (flight sheets, rest frame identical to flat, ←, O, export, turn rate) and run `scripts/world_perf.py` on the presenting laptop: the overview is the heaviest moment on a weak integrated GPU.

## What did NOT work

- Reusing one concept for every topic (website header + ghost cursor for everything): it fit an incident at a web company, but many topics need no cursor and no navigation. Hence the concept workshop in §0.2.
- A 3D city flythrough with box cars, vans and doors looked like a toy, even when it ran well. 3D is for abstract depth (the spatial world, §13) or one hero visual, never literal props.
- Name cards ("NEXT SPEAKER: …") are not wanted.
- A different flashy transition on every scene in front of an academic jury reads as a gimmick; use strategy B there.
- Dark content scenes on a classroom projector lose contrast; outside showcase keep data scenes light, and in showcase check the projector simulation.
- Fast-finish on a press during an entrance: presenters skipped their best animations without noticing — hence wait-by-default, Shift to skip, and the waiting cue.
- Click-to-advance with the mouse: any touch of the touchpad moved the deck on. Keys and remotes only.
- A ghost cursor that always starts from the same corner looks like a macro; keep one persistent cursor with varied arcs and rest points.
- Screen sharing the deck in Meet drops frames, and a call recording compresses the voices. Record the deck in OBS and the voices on the phones (§12); viewers of a live online talk open the deck themselves and follow the lead.
- Followers that replayed the lead's key presses drifted: a press that only finished an animation on the lead moved a follower on. Followers copy the lead's scene and step.
- Rewriting the engine for every deck repeated old bugs. Start from `assets/starter/`.
- Calm academic defaults for every talk made decks look like slides with motion. The dial is asked every time; showcase and balanced are the normal case for pitches and demos.
- Blend modes, `filter: blur` and stacked live layers (dot grid over a live aurora) dropped frames to 100 ms even before the content moved. One light effect per scene, faint wide strokes instead of blur filters.
- A counter that wrote its start value into the page when the scene was built showed later values at step 0 after a jump. Counters render from a tweened value only.
- A killed GSAP tween still reports itself as active; clear the driver after every kill, or the next → is ignored.
- Picking fonts by eye: JetBrains Mono, Manrope, Unbounded, Playfair Display, Jost and others lack Kazakh letters, and no Fontsource subset has → or ← (use SVG arrows). Use the packs or `fonts.py check`.
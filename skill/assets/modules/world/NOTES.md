# Spatial world (3D camera) — module notes

Scenes are DOM panels placed in one 3D space; a camera rig flies past, around and through them. The world only
replaces the scene-change transition (SKILL §5 strategy C, in 3D). Every scene keeps its own paused step
timeline, labels, seek-with-events, export end state.

```
modules/world/
  src/world/          the module: math.ts, layout.ts, camera.ts, depth.ts, World.tsx, world.css, index.ts
  scripts/            world_check.py (flights, rest = flat, ←, O, export, turn rate; 3 styles), world_perf.py
  example/            the example deck sources (Tessera, fictional): scenes/*.tsx, scenes/world.ts, scenes/windows.ts,
                      scenes/PanelLight.tsx, scenes/index.ts, data.ts
  NOTES.md
```

## 0. Install into a deck made from assets/starter

The engine hook is already in the starter (`src/deck/host.ts`: the generic scene host; the engine renders scenes
inside `host.Wrap/Panel`, asks `host.go()` on scene changes, `settle()`, `key()`, `intro()`, Shift+→ `skip()`,
`__deck.overview/hasOverview/world`), and `scripts/export.py` already adds the "Map of the talk" page when a host
is installed. The dial is the starter's single `src/fx/dial.ts`.

1. `cp -r modules/world/src/world <deck>/src/` and `cp modules/world/scripts/*.py <deck>/scripts/`.
2. `npm i three` and `npm i -D @types/three`.
3. Write `src/scenes/world.ts` (section 3; the example's is a template) and give content scenes
   `<FxScene>` (or `SceneRoot hero={isDark("content")}`) so showcase scenes are dark, as everywhere in the starter.
4. `src/main.tsx`, after the dial import:
   ```ts
   import { installWorld } from "./world";
   import { WORLD } from "./scenes/world";
   // spatial world: scenes become panels in one space (off in academic, 2.5D in balanced, 3D in showcase)
   installWorld(WORLD);
   ```
   (Before mounting. No `.dark` class is needed: the space colours follow the dial, see world.css.)
5. Example deck: replace `src/scenes/` with `example/scenes/` and `src/data.ts` with `example/data.ts`.
6. Check: `python scripts/world_check.py --out world-shots/` (3 styles), then `walk.py`, `export.py`.

Colours: `--color-world-*` are declared in `world.css`, derived from the deck tokens (light space from canvas/ink
around light scenes; in showcase the hero palette: `html[data-style="showcase"]`), so any style pack restyles the
space. Override them in `theme.css` for a custom space. The three.js layer reads them through a canvas (any CSS
colour works).

## 1. Approach and why

- **CSS 3D for the panels.** Each scene is rendered by the engine as usual; the world wraps it in a `.wpanel`
  (stage-size, centre origin) and sets one `matrix3d` per frame: `Persp(P) · View(camera) · Panel(pos, yaw, pitch)`.
  Text stays real DOM: selectable, searchable by the palette, exported by the same `__deck.show()`.
- **Exactly frontal at rest.** When a move ends, the active panel gets `transform: none` (not an identity matrix
  with float noise) and every other panel `visibility: hidden`. The rest frame is the flat scene: measured pixel diff
  vs `?world=off` (same style) = 0 % pixels off by > 8 levels, mean ≤ 0.0001, for 7/7 scenes in showcase and balanced. 3D transforms, `will-change`, the
  WebGL layer and the render loop exist only while the camera moves or the overview is open.
- **Depth sorting by hand.** No `preserve-3d` (Chrome's plane splitting is unpredictable and costly): each panel
  carries its own perspective inside the matrix and gets a `z-index` from its centre depth every frame.
- **Plain three.js, not R3F,** for the depth layer: R3F measures its canvas with `getBoundingClientRect`, which is
  the *scaled* stage size and fights the stage `scale()`; the layer is ~150 lines of imperative code driven from the
  same GSAP update that moves the panels, so R3F's React loop would only add a second clock.
- **One camera for both worlds.** World space = CSS stage space (x right, y DOWN, z toward the viewer, px, origin
  = stage centre). Camera = eye + yaw + pitch, no roll. `View = Tz(P) · Rᵀ · T(−eye)`; at
  `eye = panel + R·(0,0,P)` the product with the panel matrix is the identity (frontal, scale 1).
  three.js: `PerspectiveCamera(fov = 2·atan(540/P), 16/9)` and `matrixWorldInverse = S·Rᵀ·T(−eye)·S` with
  `S = diag(1,−1,1)` (y up). Same projection, so stars and grid parallax exactly with the panels. `P = 1500`
  (vertical FOV 39.6°: little distortion, comfortable).

## 2. API

```ts
// main.tsx (before mounting)
import { installWorld } from "./world";
import { WORLD } from "./scenes/world";
installWorld(WORLD);                     // returns the runtime, or null when the dial turns the world off
```

Engine side (`src/deck/host.ts`, generic "scene host" — the engine does not import the world):
`setSceneHost(host)`; the engine renders scenes inside `host.Wrap`/`host.Panel`, asks `host.go(from, to, kind,
{start, done})` on every scene change (null = its normal fade/transition), calls `host.settle(id)` after its own
fade and after `__deck.show()`, gives keys to `host.key()` first, plays `host.intro()` at start and on R, and
Shift+→ calls `host.skip()` (cut to the end of the move, then the normal fast-finish).

New export/test API: `__deck.overview(on)` (instant overview, "map of the talk"), `__deck.hasOverview()`,
`__deck.world()` (mode, comfort, settled, overview, flight stats). `window.__world` = the runtime (tests seek
`__world.flight`, read `__world.stats`).

URL flags: `?style=academic|balanced|showcase` (dial), `?world=off|flat|full` (override), `?comfort`,
`?gl=0` (no WebGL fallback), `?motion=reduce`.

Keys: **O** overview (fly out; labels for every scene: centred above each panel, else below it, sideways or in a
free row with a dashed leader line to the panel; titles wrap to two lines, then ellipsis; never overlapping). In the overview: O / Esc / ← / → / Enter fly back to the
current scene, **1–9** (or a click on a label) fly to that scene. Shift+→ during any flight cuts to its end.

## 3. World authoring (`src/scenes/world.ts`)

```ts
import { path, ring, room, world } from "../world/layout";   // not "../world": avoids an import cycle
import { LEDGER_WINDOW } from "./windows";                    // shared with the scene that draws the window

export const WORLD = world(
  path(["cover"], { start: [0, 0, 0] }),
  { panels: { relay: { pos: [2700, -160, -3600], yaw: -14 } } },          // hand placement still works
  ring("core", ["edge", "risk", "ledger"], { center: [5200, 0, -10600], radius: 3100, arc: 78, yaw0: -4 }),
  room("inside", "ledger", { window: LEDGER_WINDOW, depth: 2500, drop: 1600 }),
  { panels: { results: { pos: [10200, -320, -9200], yaw: 22 }, end: { pos: [8400, -240, -2600], yaw: -24 } } },
  { moves: { end: "survey" }, intro: { distance: 9000, rise: 1400, duration: 2.6 } },
);
```

- Units are stage px; a panel is 1920×1080. Keep ≥ ~400 px between panel edges.
- Helpers: `path(ids, {start, step, yaw, turn})` (a dolly line or gentle curve), `ring(group, ids, {center,
  radius, arc, yaw0})` (outer arc facing outward; the camera orbits outside), `spiral(...)`, `grid(...)`,
  `room(id, of, {window: [x,y,w,h], depth, drop})` (behind a window of `of`, `drop` px lower = one level down).
- `moves[toId]`: `auto` (default) | `dolly` | `orbit` | `drop` | `rise` | `window` | `survey` | `fade`.
  Auto: same ring → orbit; room of the source → window (back out: window reversed); |Δy| > 1200 → drop/rise; else dolly.
- `flat`: 2.5D positions for the balanced style (default: an automatic strip, rooms below their parent).
- Scenes not listed (backup slides) are not in the world: they fade in flat over it, Esc returns with a fade.
- The window element in the scene is decoration only; the world cuts the hole from the rect in the layout
  (CSS mask, `mask-composite: exclude`), so keep both from one constant. Window ≥ 400×240 px so the hole covers the
  screen before the camera reaches the plane.

## 4. Camera grammar

Each move = 3–9 keyframes (eye, yaw, pitch at t), non-uniform Hermite spline (holds = zero tangent), ONE GSAP
tween over progress with an ease. The entrance of the target starts at `entranceAt` (0.55–0.8) so content builds as
you arrive.

| Move | Path | Base |
|---|---|---|
| intro | from 9000 px in front and 1400 px above, looking down ~7°, straight dolly in | 2.6 s |
| dolly | straight, pull-back mid-way (16 % of distance, ≤ 1500 px); never through a panel (path cleared sideways) | 1.1–1.6 s |
| orbit | eye on the ring circle, radius swells 520 px mid-way, yaw follows | 1.2–1.6 s |
| drop / rise | dolly + 5° pitch sway toward the motion | 1.1–1.6 s |
| window | frame the window (≈ 80 % of screen) → pass its centre → (dip and drop to the room) | 1.6 s |
| survey | out to the overview, hold, in to the target (used once: into the last scene) | 2.9 s |
| overview / back | dolly to/from the overview pose (front, above, pitch 34°, fitted with label/footer margins) | 1.5 / 1.3 s |
| ← back | the forward path from the previous scene, reversed, quick | ≤ 0.9 s (survey 1.2) |

Readability in flight is not needed (motion), at rest it is the flat scene. Off-camera panels: fog (opacity 0.62 →
0.14 with distance; balanced 0.3), panels the camera passes near fade out from 960 px, are hidden under 180 px or
when fully outside the frustum; back faces are hidden. The departing/arriving panels morph their corner radius
28 px ↔ 0 and a hairline edge in the first/last 15 %.

## 5. Dial

| | academic | balanced | showcase |
|---|---|---|---|
| world | off: the engine's normal transitions (`DECK.enter`, fade) | 2.5D: panels on one plane (auto strip), pan/zoom with a 2.5° lean toward the motion and a zoom-out mid-way | full 3D world |
| depth layer | — | CSS dot grid that moves with the plane | three.js stars + grid floor + slow wireframe icosahedron + one soft light (`allow("shader")`) |
| window / orbit | — | become pan/zoom | yes |
| overview (O) and map page | no | yes | yes |
| theme | light | light | dark "space" tokens (`allow("darkContent")`) |

## 6. Comfort rules

- No roll, ever. Yaw always turns the short way. Eased moves (power2/power1 inOut), 1.1–1.6 s; intro 2.6 s and
  the one survey 2.9 s are the documented exceptions.
- Peak turn rate ≤ 90°/s (normal) / 45°/s (comfort): the duration grows until the sampled peak rate fits.
  Measured: 9–81°/s (normal), ≤ 43°/s on flights in comfort.
- Comfort (`?comfort` or `world({comfort: true})`): limit 45°/s, sway × 0.45, durations × 1.15, and any move that
  would need more than 2.2 s becomes a fade (in the example the two orbits fade).
- Reduced motion (OS or `?motion=reduce`): no flights, the engine's crossfade; the world snaps (previous panel kept
  under the new one for the crossfade); O is an instant cut with a 0.3 s fade.
- A press during a flight is ignored (busy); Shift+→ cuts to the end. The camera never passes through a panel
  (path clearing + near fade).

## 7. Performance

- At rest: one untransformed DOM panel, nothing else visible, no WebGL frames, no loop. Cost = a flat scene.
- In flight: up to ~9 composited 1920×1080 layers + the WebGL layer (rendered at 60 % resolution, no MSAA,
  ~1400 points, one grid, one line mesh, one sprite). Panels outside the frustum are hidden, far ones are faint.
- Headless numbers (Chromium headless shell, software compositing + SwiftShader, 2 vCPU shared with other jobs,
  load avg ~8, numbers vary 2× between runs): showcase p50 74–157 ms, p95 196–485 ms per frame; showcase `?gl=0`
  p50 25 ms, p95 149 ms; balanced p50 27–120 ms. These are CPU-raster numbers, not a laptop GPU; the relative finding is that SwiftShader
  WebGL roughly doubles headless frame time. Re-measure on the real laptop (`scripts/world_perf.py` works with
  `--html` pointing at any build; or press O and watch).
- Bundle: single file 1.05 MB → 1.64 MB (+0.59 MB raw, +149 KB gzip) with three.js bundled.

## 8. Export

- Every scene: `__deck.show(i, "end")` → `settle()` → frontal, untransformed, identical to the flat scene
  (world layout irrelevant).
- `scripts/export.py` adds one "Map of the talk" page after the main scenes (before the Appendix): the overview
  with every scene labelled (labels ≥ 22 px on the stage, never wider than their panel, de-overlapped).
- `#print` renders scenes flat (no world), as before.

## 9. Engine changes (already merged into assets/starter)

`src/deck/host.ts` (the `SceneHost` interface + `setSceneHost`/`sceneHost`), the engine hooks listed in section 0,
and the export map page. Not taken from the original patch: its minimal dial copy (the starter's `src/fx/dial.ts`
is the only one), its `.dark`-in-showcase line in main.tsx and its `--color-world-*`/space palette in theme.css
(now derived in world.css), its `DECK.style` line (already in config.ts).

## 10. Verification

Integration (19 Nov, merged starter + this folder, fresh copy): `tsc -b`, `build:single` clean (single file
2.14 MB with three.js); `world_check.py` 0 failures at showcase, balanced and academic; overview labels checked
on the sheet (no overlap, two lines). Original module verification below.

### Original verification (shots/ of the module author)

- `tsc -b`, `build`, `build:single` clean.
- `world_check.py` × 3 styles: 0 failures (`shots/world_check.log`). Sheet index: 00 intro, 01 cover→relay (dolly),
  02 relay→edge (dolly, path cleared past the relay panel), 03/04 orbits, 05 ledger→inside (window, one level down),
  06 inside→results (rise), 07 results→end (survey: overview hold, then in), 08 ← risk, 09 ← inside (back out of the
  window), 10 O overview out, 11 overview back. `shots/export-deck.pdf` + `export-map.png` from `scripts/export.py`. Contact sheets per flight at 10/25/40/55/70/85 % (`sheet-flight-NN`),
  rest frames (`sheet-rest`), ←/overview/backup (`sheet-extra`), export incl. map (`sheet-export`).
  Landing index/step, `transform: none` at rest, crispness diff vs flat = 0, ← from the ring and from the room land
  on the previous scene's last step, O → Esc returns, O → 2 flies to scene 2, a press mid-flight does not skip,
  backup + Esc return, overview labels 22 px on screen, turn rate under the limit, no page errors.
- Starter `walk.py` (input rules, tools, backup) PASS and `check_overlap.py` PASS on the showcase build.
- Reduced motion, comfort and `?gl=0`: walked 12 presses + O/Esc, no errors, correct landings.

## 11. Gotchas

- `page.evaluate("__world.flight.progress(x)")` returns the GSAP timeline: Playwright tries to serialise it and
  hangs. Wrap in `void (...)`.
- Do not import `../world` from a scene file: `World.tsx` imports the scene list → cycle → `MAIN` evaluated on an
  uninitialised array. Scenes import `../world/layout` and shared constants (`windows.ts`) only.
- The `.world` wrapper needs `z-index: 0; isolation: isolate`, or a panel's per-frame `z-index` paints over the footer.
- Do not tween colours to `var(--…)` in scene timelines (GSAP cannot interpolate them): fade an overlay instead.
- Do not leave a near-identity `matrix3d` on the active panel: text is re-rastered through the 3D path and goes
  soft. `transform: none` at rest.
- Flights that cross a panel's plane inside its rectangle look like a glitch (huge text flashes by): the planner
  pushes the mid key sideways; layouts should still avoid stacking panels on one line of sight.
- `will-change: transform` only during flights (it freezes the raster scale; at rest it would keep text blurry).
- A panel seen before its entrance shows its t=0 state: keep backgrounds/frames static (the kit's `PanelLight`)
  so far panels read as designed surfaces, not blank cards.
- Headless timing: lag smoothing + slow frames → seek paused flights for frames, never sleep-and-shoot.

## 12. Open issues

- Real-GPU frame times not measured (sandbox is CPU-only and shared). Budget risk: 9 large layers during the
  overview on a weak iGPU; if needed, hide panels beyond a distance in the overview or lower the depth layer to 50 %.
- Followers in `?remote` fly the same moves (they go through `goScene`); not tested with the remote server.
- Presenter window does not show the overview state.
- `DECK.enter` transitions are ignored for placed scenes while the world is on (by design); balanced has no window
  fly-through (becomes pan/zoom), which uses less than the dial's "throughZoom once per talk" allowance.
- Overview labels: fixed in the integration (placement candidates + leader lines + two-line titles); with many
  scenes in one cluster some labels sit on a row above with a leader line, and a label may cover a far panel.

## 13. Draft SKILL.md section

> ### 5.1 Spatial world (3D camera) — `src/world`
>
> Use when the concept is a space you fly through (a system tour, a product world, "VR / spatial" feel). Scenes stay
> DOM panels; the camera moves. Showcase only for full 3D; balanced gets 2.5D pan/zoom; academic turns it off.
> - Install: copy `src/world/`, add `three` (+ `@types/three`), then in `main.tsx` `installWorld(WORLD)`; the
>   engine hook (`src/deck/host.ts`) is part of the starter. Write `src/scenes/world.ts` with `world(path(…), ring(…), room(…), {moves})`; import
>   `../world/layout`, never `../world`, from scene files.
> - Layout: stage px, y down, z toward the viewer, panels 1920×1080 ≥ 400 px apart, faces roughly toward +z so
>   the overview sees them. Never put a panel on the line of sight between two consecutive scenes.
> - Grammar: dolly between neighbours, orbit inside a ring of 2–4, drop/rise between levels, a window into a room
>   behind (the hole rect comes from one shared constant; ≥ 400×240 px), one survey (out to the overview and in)
>   per talk. Moves 1.1–1.6 s, no roll, ≤ 90°/s turn (comfort 45°/s, long turns fade).
> - The active panel ends with `transform: none` and everything else hidden: text is the flat scene, export is
>   unchanged. Keep scene backgrounds static so panels seen from afar are not blank.
> - O opens the overview (labels ≥ 20 px, 1–9 flies there); export adds a "map of the talk" page.
> - Check with `scripts/world_check.py` (flight sheets at 10–85 %, rest-vs-flat pixel diff = 0, ←, O, export,
>   turn rate) and `scripts/world_perf.py` on the presenting laptop. Do not use literal 3D props (cars, buildings):
>   depth comes from space, fog, light and a few abstract lines.

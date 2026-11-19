# Data storytelling module (`src/data-viz/`)

Numbers that land like on a product launch page: big, animated, annotated, honest. Pure HTML/SVG + GSAP (no
chart library). Every chart is built from ONE data object (`src/data.ts`), is a set of plain tweens in the scene's
one paused timeline, lands on the same frame forward / back / jumped, and prints its end state.

## Folder

`src/data-viz/` (module, incl. `maps/kz.map.json` + `kz.names.ts`), `geo/` (Kazakhstan source GeoJSON + config),
`scripts/geo-build.mjs`, `scripts/viz_contrast.py`, `scripts/viz_shots.py`, `example/scenes/` + `example/data.ts`
(8 example scenes). The seek check is the starter's generic `scripts/seek_check.py` (it was viz_seek.py).

Single definitions it shares with the starter: the locale and the dial come from `src/fx/dial.ts` (`locale`:
`DECK.locale`, `?lang=` overrides; `style`/`allow`), counters from the kit's `counter()` (`countText` = counter +
`data-final`), rolling digits from the fx kit's `odometer()` (`<Odometer>` renders the final text, `odometerIn`
rolls it from zeros; spins follow the dial), series colours from `--color-chart-1..5` (theme / pack).

## Install into a deck made from assets/starter

```
cp -r modules/data-viz/src/data-viz  <deck>/src/
cp modules/data-viz/scripts/*  <deck>/scripts/          # next to the starter's deckpage.py
# maps only:
cp -r modules/data-viz/geo  <deck>/  &&  npm i -D d3-geo @types/d3-geo
npm pkg set scripts.geo="node scripts/geo-build.mjs geo/kz.config.json"   # rebuilds src/data-viz/maps/kz.map.json
```
Nothing else: `DECK.locale`, `Heading`'s ReactNode eyebrow and the chart tokens are in the starter, and
`src/data-viz/index.ts` imports `viz.css`. Example deck: replace `src/scenes/` with `example/scenes/` and
`src/data.ts` with `example/data.ts` (the starter's Results/BackupMethod read the starter's data).
Check: `python scripts/seek_check.py`, `python scripts/viz_contrast.py --lang en|ru|kk`, `python scripts/viz_shots.py`.

## Data format

`src/data.ts` holds every number once, each block with `source`. Charts derive totals, shares, ratios, growth
rates and "biggest drop" from it; scene titles that quote a number compute it (`` `${fmtNum(share,{style:"percent"})} of sign-ups…` ``).
Scene meta: `source: sourceOf(DATA.launch)` → footer "Source: …". Example values are ILLUSTRATIVE and labelled so.

```ts
launch: { byDay: [{ key: "mon", label: "Mon", value: 4120 }, …], signups: sum(byDay), peak: "thu", source }
race:   { entities: [{ key, label }], frames: [{ label: "Q1 2026", values: { almaty: 41200, … } }], source }
growth: { wau: [["2025-01", 1200], …], events: { mobile: "2025-11" }, source }        // ISO month or date
kz:     { share: { "almaty": 24.1, … } /* keyed by map region id */, hub, served: [...placeIds], source }
```

## API

Every chart root carries `data-viz="<id>"`; get it in the timeline with `vizEl(q, id)`. Helpers take
`(tl, root, at)`; `at` = number, `"label"` or `"label+=n"` (labels must exist; `"<"`-style positions are not
supported because helpers resolve times themselves). Add `tl.addLabel("sN")` after the tweens of step N.

| Piece | Component | Timeline helpers |
|---|---|---|
| Rolling digits | `<Odometer text={fmtNum(v)} />` | `odometerIn(tl, el, at)` — transform-only, exact without events |
| Big number → card | `<BigNumber id text context card={{left,top,width,height}} cardLabel />` (full-stage layer) | `bigNumberIn`, `bigNumberToCard` (shared-element move) |
| Columns | `<BarChart id data highlight width height format axisLabel>{callouts}</BarChart>`; `barGeom(...)` for callout coords | `barsIn(tl, root, at, format)`, `barsHighlight` |
| Bar race | `<BarRace id entities frames width height highlight color? />`, `<FrameLabels frames className="… absolute …"/>` | `barRaceIn`, `barRaceTo(tl, root, k, at)`, `frameLabelTo` |
| Line | `<LineChart id series main width height yFormat notes bands xTicks />` | `lineIn(tl, root, at, {to})`, `lineTo(tl, root, idx, at)`, `lineNote(i)`, `lineBand(i)`, `lineEnd` |
| Before/after | `<BeforeAfter id before after beforeLabel afterLabel width height />` | `splitSweep(tl, root, at, {reach, rest})` |
| Ratio | `<RatioBars id a b format word lowerIsBetter />` — ratio computed (`fmtRatio`) | `ratioIn` |
| Units | `<Waffle id share total=100 label />` | `waffleIn`, `waffleFill` |
| Funnel | `<Funnel id stages width highlight />` — width ∝ value, step conversions printed | `funnelIn` |
| Map | `<GeoMap id map values breaks places routes legendTitle />` | `mapIn`, `mapFill`, `mapPins`, `mapRoutes` |
| Annotations | `<Callout x y tx ty w>` (leader + dot), `<Band x0 x1 top height label>`, `<ChartSource of={DATA.x}/>`, `sourceOf()` | `calloutIn`, `bandIn` |
| Showcase extras | `<Burst x y seed>` (SVG), `.viz-beam` path | `burstIn`, `beamIn` — both end invisible |
| Format | `fmtNum(v, {style: "number"|"percent"|"currency"|"compact", decimals, unit, signed, locale})`, `fmtRatio(a,b)`, `fmtDate(iso,{month,year,day})`, `t({en,ru,kk})` | |

Counters: `countText(tl, el, from, to, at, format)` writes text in `onUpdate` and stores `data-final`; correct
because the engine seeks WITH events. Odometers need no events at all. `scripts/seek_check.py` reads both.

### Map pipeline

`node scripts/geo-build.mjs geo/kz.config.json` → `src/data-viz/maps/kz.map.json` (33 KB): projected SVG paths
(Douglas–Peucker in px), centroids, bboxes, and pixel positions for the named `places` (lon/lat in the config).
d3-geo runs only here. Config: `input`, `idField`, `ids` (source id → your id), `projection` (`geoConicConformal`,
`parallels`, `rotate`), `size`, `tolerance` (px), `minRingArea`, `dropHoles` (fill enclaves such as Baikonur;
cities that are their own feature draw on top), `places`. Another country: new config + GeoJSON, same component.
Kazakhstan: `geo/kz-admin1.ne10m.geojson` = Natural Earth 1:10m admin-1 (public domain) filtered to KAZ;
names in `maps/kz.names.ts` (en/ru/kk official forms, 20 cities).

## Dial behaviour (same data, same steps, same labels in every style)

| | academic | balanced | showcase |
|---|---|---|---|
| Scenes | light; cover light too (`allow("darkHero")`) | light content, dark cover | dark content (`allow("darkContent")` → `SceneRoot hero`, footer follows) |
| Fills | flat | gradient bars, glow on the highlighted bar/line/dots | gradient + glow |
| Counters | odometer, no spin, 0.9 s | 1 spin, 1.3 s | 2 spins, 1.6 s |
| Lines / routes | draw | draw | draw + one light beam run |
| Milestones | callout | callout | callout + particle burst (seeded) |

Tokens live in `viz.css` (`--viz-*`), all derived from the deck tokens (`--color-chart-1..5`, primary, ink, line…); inside a dark scene (`.scene.hero`) they resolve against the dark token block. Charts never use raw hex.

## Accessibility

- Colour is never alone: highlighted bar = colour + ▲ marker + bolder value + callout; waffle lit = filled vs ring;
  bar race / ranking = direct names on every bar; funnel drop = red chip WITH the number and a callout; map classes
  = legend with the thresholds + ranked list with values. No legends where a direct label works.
- Series palette validated with the dataviz validator: light `#2F4BD3,#EB6834,#1BAF7A,#EDA100,#E87BA4,#008300` on
  #FFF (all hard gates pass; 3 slots < 3:1 → relief = direct labels, which every chart has), dark
  `#6F86FF,#D95926,#199E70,#C98500,#D55181,#0CA30C` on #181B22 (all pass). Re-run when the brand primary changes.
- `scripts/viz_contrast.py` measures RENDERED text against what is under it (canvas-resolved colours, so
  `color-mix()` tokens count as painted): 4.5:1 text, 3:1 large; flags chart text < 18 px.
- Locale: en `1,284,000 · 38.4% · ₸2,450,000`, ru `1 284 000 · 38,4 % · 2 450 000 ₸`, kk `1 284 000 · 38,4% ·
  2 450 000 ₸ · 2,5 млн ₸ · 2026 ж. 19 қараша`.

## Gotchas

- **Chromium has no Kazakh ICU data** (headless here; some desktop builds too): `Intl` prints `1,284,000` and
  `2026 M11 19` for `kk-KZ`. `format.ts` formats kk from CLDR rules itself. Do not "simplify" it back to Intl.
- **Eyebrows are monospace.** The starter's mono is Geist Mono (covers Kazakh; JetBrains Mono, which does not, is gone), and every pack mono is checked, so no sans override is needed any more.
- **Natural Earth boundaries predate June 2022**: no polygons for Abai, Jetisu, Ulytau; Shymkent sits inside
  Turkistan. Use `merged` names whenever such a polygon is labelled or filled, aggregate data the same way, and
  keep `KZ_BOUNDARY_NOTE` on the slide. NE's own `name_en` for the capital is "Nur-Sultan" — never print NE names.
- Small city polygons (Astana, Almaty) are hidden under their pins; their class shows in the list, not the map.
- Shared-element move uses layout offsets (`fitTo`), not `Flip.fit`: at build time earlier `from()` tweens have
  already rendered transforms, so rect-based measurement is off. Same result, seekable, no plugin.
- `tl.addLabel("sN")` right after the step's tweens; a helper that starts at `"sN"` needs the label first.
- Bar race keeps ONE scale across frames (a longer bar is always a bigger number); bars always start at 0
  (`BarChart` throws on negatives); lines are straight segments (no smoothing — a curve invents values).
- `niceTicks` always ends at a tick ≥ max, so the top bar never pokes above the last gridline unlabelled.
- Tailwind `-translate-*` uses the CSS `translate` property: never put it on an element whose `transform` a
  tween or onUpdate writes (the bar-race value labels write `transform` themselves).
- Particles and beams end at opacity 0: the printed end state is clean; they exist only in motion
  (`shots/sheet-motion-showcase.png`).
- Titles that paraphrase data ("Astana overtook Almaty in Q4") are hand-written: recheck them when data changes.
- Dataviz-skill deviations for the projector stage: bars up to 112 px wide (not 24), 4 px lines, 6 px rounded
  caps; no hover tooltips (keys only, nothing to hover); direct labels instead of legends for ≤ 6 entities.

## Verify

Integration (merged starter, fresh copy + this folder): `build:single` clean; `seek_check.py` 153 checks 0 failures
(forward = back = jump at every label, counters exact at the end and in #print); `viz_contrast.py` 0 failures in
en, ru, kk at all styles; `walk.py` PASS; `check_overlap.py` clean.

```
npx tsc -b && npm run build && npm run build:single
python scripts/seek_check.py      # forward == back == jump at every label, counters exact at end and in #print
python scripts/viz_contrast.py [--lang ru|kk]
python scripts/viz_shots.py       # shots/<style>/…, sheet-<scene>.png, sheet-<style>.png, sheet-motion-showcase.png
python scripts/walk.py && python scripts/check_overlap.py
```

## Draft SKILL.md recipe — "Data storytelling"

> ### Data storytelling (`assets/modules/data-viz`)
>
> - Put every number in `src/data.ts` once, with `source`. Compute totals, shares, ratios and growth rates in
>   code; never type a derived number. Scene meta: `source: sourceOf(DATA.x)`. Label sample data as sample data.
> - One idea per chart, one highlight per chart. Say the conclusion in a statement title and one callout.
> - Pick the form by the job: one number → `BigNumber` (then fly it into its card); compare → `BarChart` (one
>   highlight) or `RatioBars`; rank over time → `BarRace`; trend → `LineChart` with notes pinned to dates and a
>   band for before/after; part of a whole → `Waffle`; stages → `Funnel`; place → `GeoMap`.
> - Honest geometry: bars start at 0, one scale per chart and per race, straight line segments, ratio computed.
> - Steps: reveal the data first, then the highlight, then the callout. Helpers go into the scene's ONE timeline;
>   add `sN` after each step's tweens.
> - Counters: odometers (transform-only) for hero numbers, `countText` elsewhere; never `tl.progress(1)`.
> - Colour is never the only signal: direct labels, a marker, a shape, a number. Chart text ≥ 18 px, values ≥ 26 px.
> - Format with `fmtNum` per `DECK.locale` (en/ru/kk, tenge ₸). Kazakh is formatted by the module, not by Intl.
> - Maps: build paths at build time (`scripts/geo-build.mjs`, d3-geo dev-only). Kazakhstan from Natural Earth
>   shows pre-2022 regions: use the merged names and keep the boundary note.
> - Dial: academic = light and flat, balanced = gradients + glow on the highlight, showcase = dark + beams +
>   particles. Same data, same steps.
> - Check: `seek_check.py` (forward = back = jump, counters exact in export), `viz_contrast.py`, `viz_shots.py`
>   (look at the sheets), then the starter's `walk.py` and `check_overlap.py`.

# Diagram module — animated architecture / system-design diagrams

Files: `src/diagram/*` (module), `src/graphs/saas.graph.json` + `saas.layout.json` (example graph),
`scripts/layout.mjs` (ELK + validation), `scripts/diagram_check.py` (shots, seek, text, perf; uses the starter's
`scripts/deckpage.py`), `example/scenes/` (8 example scenes + their `index.ts`, one per story tool and kit).

Graph JSON → ELK layout at build time → React renderer → story API on the scene's ONE paused timeline, plus live
loops while a step is on screen. Dial-aware (academic / balanced / showcase) through the starter's `src/fx/dial.ts`
(`allow("light", { diagram: true })`: balanced allows beams on diagrams only). Counters use the kit's `counter()`.

## Install into a deck made from assets/starter

```
cp -r modules/diagram/src/*  <deck>/src/            # src/diagram/ and src/graphs/
cp modules/diagram/scripts/*  <deck>/scripts/
npm i -D elkjs && npm i simple-icons
npm pkg set scripts.layout="node scripts/layout.mjs" scripts.layout:check="node scripts/layout.mjs --check" \
  scripts.predev="node scripts/layout.mjs" scripts.prebuild="node scripts/layout.mjs" scripts.prebuild:single="node scripts/layout.mjs"
```
Example deck: copy `example/scenes/*` over `src/scenes/` (its `index.ts` replaces the starter's; the starter's own
scenes may stay or go). Your graphs live in `src/graphs/*.graph.json`; the script writes `*.layout.json` next to
them (commit both; scenes import only the layout file, ELK never reaches the bundle). Delete the example
`saas.*` files when the deck has its own graph. Check: `python scripts/diagram_check.py all`.

## Graph spec (`src/graphs/<name>.graph.json`)

One file holds several named graphs (levels, kit views). Keys starting with `$` are comments.

```jsonc
{
  "system": {
    "title": "Acme Shop · containers",          // panel title when zoomed into
    "direction": "RIGHT",                       // RIGHT | DOWN | LEFT | UP
    "spacing": 96,                              // px between layers (default 110)
    "size": "sm",                               // default node size: lg (300×104) | sm (230×84)
    "nodes": [
      { "id": "gw", "title": "API gateway", "sub": "auth · rate limits", "icon": "nginx", "tone": "core",
        "group": "edge", "w": 260, "h": 84,     // w defaults to fit the text (estimate), h to the size
        "pin": { "below": "queue", "gap": 48 }, // escape hatch: below|above|right|left of a node/group, or {x,y}
        "inside": "orders",                     // zoom target: another graph of this file
        "badge": "1" }                          // corner badge
    ],
    "groups": [{ "id": "services", "title": "Services", "layout": "free" }],   // column | row | grid (+cols) | free
    "edges": [{ "from": "gw", "to": "orders", "id": "gw-orders", "label": "REST", "dashed": true, "hot": true, "both": true }],
    "flows": {
      "checkout": { "title": "Checkout", "color": "primary",
        "path": ["web", "gw: POST /orders", "auth: verify", "<gw: ok", "orders", { "to": "queue", "async": true, "label": "order.paid" },
                 { "from": "worker", "to": "s3", "with": true }, { "to": "pipe", "light": true }],
        "back": false, "backLabel": "200" }
    }
  }
}
```

- Tones: `default core entry store queue external hot later danger ghost` (`kind` is an alias of `tone`).
- Groups: `column`/`row`/`grid` are packed boxes; edges to a member attach to the group box (one arrow), and a flow
  hop into the group can `light` its members in order. `free` = ELK compound: edges reach each member.
- Flow hops: `"id"`, `"id: label"`, `"<id: label"` (reply, dashed in sequence view) or
  `{to, from?, label?, async?, reply?, with?, light?}`. `from` defaults to the previous hop's `to`; `with` starts
  together with the previous hop. Each hop resolves to an edge (forward or reverse, also via a packed group);
  `back: true` appends the synchronous chain in reverse. Labels show in the sequence view; numbers on the graph.
- Validation (exit 1, every problem listed with its path): ids (CSS-safe, unique), titles, tones, groups,
  edge endpoints, self-loops, pins (target, cycles, one direction), `inside` targets, flows (no edge between hop
  nodes), empty groups. Warnings: unknown keys (typos), unknown icon names, explicit `w` too narrow for the text.
- Determinism: fixed seed, model order, rounded coordinates; the file is only rewritten when it changed.
- Icons (`src/diagram/icons.tsx`): lucide names (`server database queue…`, see the map) and brands from
  simple-icons (`postgres redis rabbitmq nginx go react stripe mailgun telegram…`). Add names there or call
  `registerIcons({...})` in a scene file. Brands sit on a white tile in every style.

## Renderer

```tsx
import LAYOUT from "../graphs/saas.layout.json";
const VIEW = diagramView(LAYOUT as unknown as LayoutFile, "system", {
  region: { x: 120, y: 300, w: 1680, h: 620 },           // stage region; fit never scales above 1 (max)
  panel: { x: 60, y: 110, w: 1800, h: 820 },             // where zoomed nodes open (all deeper levels)
  seq: { checkout: { x: 120, y: 290, w: 1680, h: 640 } }, // flows that can become sequence diagrams ("graph:flow" for deeper levels)
});
<FxScene ref={ref}>   {/* or SceneRoot hero={isDark("content")} */}
  <DiagramView view={VIEW} overlays={{ system: <QueueGauge … /> /* layout coords */ }}>
    <Captions items={[…]} />                               {/* stage coords, diagram tokens apply */}
  </DiagramView>
  <Heading … />
</SceneRoot>
```

`DiagramView` renders the background (showcase dot grid), the root level in a camera wrapper, and for every node
with `inside` a hidden panel + its graph (recursively: context → container → component). Class hooks:
`.dgx-<level>`, `.dg-n-<id>`, `.dg-e-<edgeId>`, `.dg-g-<groupId>`, `.dg-l-<edgeId>`, `.dgc-<level>`, `.dgp-<level>`.

## Story API (scene timeline; reversible, seekable, printable)

```ts
const d = story(tl, q, VIEW);          // root level; d.level("orders") for another level
tl.addLabel("s0", d.enter(0.3, { hidden: ["api-2"] }));
tl.addLabel("s1", d.flow("checkout", "s0+=0.1", { color, keep, focus, numbers, speed, onHop }));
d.focus("checkout" | { nodes, edges } | null, at);   d.clear(at);
d.ring(ids, at, color, on);   d.light(groupOrIds, at, color);   d.alarm(id, at, on);   d.reveal(ids, at);
const z = d.zoom("shop", at);  /* z.story, z.end */   d.zoomOut("shop", at);
d.toSequence("checkout", at);  d.fromSequence("checkout", at);
count(tl, el, from, to, at, { duration, format });   caption(tl, q, i, at);
```
Every call takes `at` as seconds or an existing label expression (`"s1+=0.2"`) and returns its end time — use it
for the next label. What stays after a step (lit path, hop numbers `1·9`, rings, dim, sequence view, open panel,
counter values) is the printed end state.

## Live loops (only while the step is on screen)

```ts
useLive(ref, VIEW, step, (live, s) => {
  if (s === 1) live.flow("checkout");              // packets + beams + halo pulses, repeated
  if (s === 2) live.seq("checkout");               // packets along the sequence messages
  if (s === 3) live.level("orders").flow("request");
});                                                // also: live.beam, live.pulse, live.call, live.tl
```
A loop starts when the scene timeline rests on the step's label, dies on any step change, and never runs in export,
`#print` or reduced motion (`useStill()`). It only touches what it owns (its packets, `.dg-halo`, `.dg-bm*`) and its
`gsap.context` is reverted, so forward / back / jump frames are identical.

## Kits (`src/diagram/kits/*`)

| Kit | Scene timeline | Live | Overlay components |
|---|---|---|---|
| tenant isolation | `tenantIsolation(d, tl, q, {id, tenants, rows, db}, at)`: each tenant's flow in its colour; at the db the table filters (others dim + lock); end: "X sees N of M rows" per tenant | `liveTenants` | `RowsTable` |
| failure & recovery | `failure(d, tl, q, {id, node, edge, from, queue, retries, focus}, at)`: node red + shake, "503" chip, backlog gauge + counter, retries bounce with backoff chips; `recovery(…, {flow})`: green, gauge drains | your flows + `live.pulse(node,…,"danger")` | `QueueGauge`, `FailureNotes` |
| scale-out | `overload(…)` p95 climbs, instance red; `scaleOut(…, {replicas, flows, stats})` replicas (graph nodes hidden by `enter({hidden})`) appear, round-robin, counters recover | `liveRoundRobin` | `Hud` (`initial` values in markup) |
| trace waterfall | `trace(d, tl, q, {id, flow, spans, total}, at)`: bar of a node fills from the packet's arrival to its reply's departure; ms count up | `live.flow` | `Waterfall` |
| state machine | `const m = machine(d, tl, q, {id, start})`; `m.enter(at)`, `m.go(to, at, {blocked})`, `m.color(c, at)`: token rides transitions, guard labels go green / red, blocked = halfway, shake, back | — | `Token` |

## Dial behaviour

| | academic | balanced | showcase |
|---|---|---|---|
| canvas | scene light | scene light | dark `#090B10` + dot grid + soft glow (scene `hero` = `allow("darkContent")`) |
| nodes | white, 1.5 px border, radius 12, no shadow; core = ink | white cards, soft shadow, radius 18; core = primary | glass (translucent gradient, hairline, inset highlight), core = cyan/violet tint |
| edges | 2 px grey; active path 3.5 px solid | 3 px; active path + soft wide glow | 2.5 px hairline; neon active path + glow |
| packets | flat dot | dot + layered halo | dot + halo, white rim |
| live extras | packets only | + beams on active edges, node halo pulses | same, brighter |
Driven by `allow("light")` (beams, halos, glow paths not even rendered in academic) and `allow("glass")`.
Tokens: `--dg-*` per `[data-dg-style]` in `diagram.css`, built on the deck's theme tokens, so brand colours flow in.

## Verified (integration, merged starter, fresh copy + this folder)

- `tsc -b`, `build:single` clean; `diagram_check.py all`: shots 3 styles, seek, text (0 problems), perf — all ok.
  The showreel (assets/showreel) uses its own graph (`halo.graph.json`) for a context → containers → component zoom
  and the tenant kit; `diagram_check.py text` 0 problems there too.

### Original verification (module author)

- `tsc -b`, `npm run build`, `npm run build:single` clean; layout deterministic; validation errors readable.
- `scripts/diagram_check.py shots`: 9 scenes × all steps × 3 styles (29 frames each), 0 page errors; sheets in `shots/`.
- `seek`: jump (`__deck.show`) vs forward (→ and wait) vs back (←) at every label, export mode: max 41 px differ
  (anti-aliasing), all pass.
- `text`: no node text overflows (scrollWidth ≤ clientWidth), no visible text below 17.5 px effective size.
- `perf`: headless Chromium with software raster (no GPU), p95 frame time: most steps and loops 16.7–33 ms;
  worst 66–100 ms during zoom / sequence morphs and the tenant loop in balanced/showcase. Indicative only; rerun on
  the real laptop.

## Gotchas

- `ui/kit counter()` writes the start value into the DOM at build time: two counters on one element leave the LAST
  start value showing at s0 (seek check caught it). Use `count()` (writes nothing at build; markup holds the initial).
- DrawSVG overrides `stroke-dasharray`: dashed edges fade in instead of drawing; lifelines grow with `scaleY`.
- Anything a step can repeat is `fromTo(..., { immediateRender: false })`; plain `from` only for entrances.
- Elements with a CSS `transform` (hop badges, sequence labels) need `xPercent/yPercent` in the GSAP tween, or the
  tween drops the CSS centring.
- Roles never mix: entrance = outer opacity/visibility; focus = inner (`.dg-body`, `stroke-opacity`, `.dg-lb`);
  path highlight/rings/numbers = scene timeline; halos/beams/live packets = loops. A loop that writes something the
  timeline owns breaks ←.
- Readability is a layout job: a graph wider than the region scales every font down. Keep a level ≤ ~5 layers ×
  ~250 px (`size: "sm"`, `spacing` 70–100, pins for side chains); the text check reports anything < 18 px.
- `hidden` nodes must go through `enter({hidden})` (a later `set` loses against the entrance tween).
- Caption i placed at `s_i` belongs to step i+1 (it shows during that step and in its export page).

## Draft SKILL.md section

### Architecture and system design diagrams (`assets/modules/diagram`)

- Write the system as data: `src/graphs/<name>.graph.json` with nodes (title, sub, icon, tone, group), groups
  (column/grid/free), edges and named `flows` (journeys as hop lists, `"<id"` for replies). One graph per level
  (context → containers → components) linked by `"inside"`. Never place boxes by hand; `pin` only for side chains.
- `scripts/layout.mjs` runs ELK before dev/build and validates; fix every error it prints. Keep each level within
  ~5 layers so fonts stay ≥ 18 px; the check script says when they do not.
- One idea per step: `d.flow(name)` (path lights up, numbered hops, the rest dims), `d.zoom(node)` to open a
  level, `d.toSequence(flow)` when the order of calls matters, or a kit: tenant isolation, failure & recovery,
  scale-out, trace waterfall, state machine. Each returns its end time: use it as the next label.
- Ambient motion only through `useLive` (packets, beams, pulses while the step is on screen). It is off in export,
  so the step's end state must explain itself: lit path, hop numbers, counters, captions.
- Style follows the dial: academic = clean light cards and plain dots; balanced = soft glow and beams on the
  active path; showcase = dark canvas, dot grid, glass nodes, light beams.
- Check with `python scripts/diagram_check.py all` (shots per style, seek identity, text fit, frame times).

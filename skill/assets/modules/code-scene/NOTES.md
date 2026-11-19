# code-scene module — notes

## Files

```
vite-plugin-code-scene.ts        Vite plugin: `?shiki` imports → pre-highlighted token HTML per line (build time)
src/code-scene/index.ts          barrel (also imports the CSS)
src/code-scene/CodeBlock.tsx     <CodeBlock> (card, header, gutter, rows, viewport, scrollbar) and <CodePanel> (side card)
src/code-scene/steps.ts          codeIn() entrance and codeSteps() step builder
src/code-scene/types.ts          CodeLine, HighlightedCode, CodeStep, LineRef
src/code-scene/shiki.d.ts        module types for "*?shiki" / "*&shiki"
src/code-scene/code-scene.css    layout, token colours (light + dark) as --cs-* variables, panel
example/CodeHandler.tsx          Go handler: focus → diff (context timeout) → run with values → add + type a line; side panel
example/CodeRefactor.tsx         before/after file pair, dark hero scene, a:/b: line refs, auto-scroll and scrollTo
example/code/handler.go          source with inline `// +` / `// -` markers
example/code/orders.{before,after}.ts.txt   the pair (.txt keeps it out of tsc)
README.md                        short usage + which mono fonts cover Kazakh/extended Cyrillic
```

## Install into a starter

1. `npm i -D shiki` (devDependency only: it runs in the Vite plugin, nothing of it reaches the bundle;
   checked: no oniguruma/textmate code in `dist` or `dist-single`).
2. Copy `vite-plugin-code-scene.ts` to the project root and `src/code-scene/` to `src/code-scene/`.
3. `vite.config.ts`: `import { codeScene } from "./vite-plugin-code-scene.ts";` and put `codeScene()` FIRST in
   `plugins` (before react/tailwind/singlefile). Without the `.ts` extension Vite 8 prints a "configLoader native"
   warning; with it, a `tsconfig.node.json` that type-checks the config needs `allowImportingTsExtensions`.
   Options: `codeScene({ defaultTab: 4, langs: ["go"] })`.
4. Code samples: `src/scenes/code/<name>.<ext>`. For `.ts/.tsx/.js` samples add `.txt` (`util.ts.txt`) so `tsc -b`
   and linters skip them; the language still comes from the name before `.txt`. Other languages need nothing.
5. Fonts: the block uses `--font-mono`: the starter's Geist Mono 400/500 (covers Kazakh) or the pack's checked mono.
6. Copy an example scene to `src/scenes/` (it imports `../deck`, the starter's public API) and register it in
   `src/scenes/index.ts`. Wrap it in `<FxScene>` (as the showreel does) to follow the dial: the block turns dark with
   the scene (`theme="auto"` follows `.hero`).

## API

### Import
```ts
import code from "./code/handler.go?shiki";                                   // inline markers
import pair from "./code/a.before.ts.txt?after=./a.after.ts.txt&shiki";        // before/after pair (LCS line diff)
import sql  from "./code/q.txt?lang=sql&tab=2&shiki";                          // force language / tab width
```
`shiki` must be the LAST query parameter (the TS declarations match `*?shiki` and `*&shiki`).
Result: `{ file, lang, lines: { html, text, mark: "" | "add" | "del", b, a }[] }`. Tabs are expanded (default 4).
Inline markers at a line end, removed from the shown code: `// [!code ++]`, `// [!code --]` (also `#`, `--`, `;`
comment starts), short form `// +`, `// -`, `# +`, `# -`.

### `<CodeBlock code fontSize=26 lineHeight=1.5 lines maxLines=16 numbers=true title theme="auto" className style />`
Static by itself. Position/width it with `className`/`style`; height comes from `lines` (viewport rows, default
`min(maxLines, rows)`) × `round(fontSize × lineHeight)` + 36 px + 60 px header. `theme="auto"` follows a `.dark` or `.hero`
ancestor; `title={false}` hides the header. Keep code lines ≤ ~65 chars at 26 px in a 1180 px card.

### `<CodePanel steps intro eyebrow className style />`
Stacked cards: item 0 = `intro` (after the entrance), item k = `steps[k-1].title/body`. A step without text keeps
the previous card. Progress dots underneath. Sans font (the deck's), not mono.

### `codeIn(tl, q, at = 0.2, { root?, panel? })`
Entrance: the card rises in, `.cs-txt` spans fade in top to bottom, the panel slides in. Touches only the card,
the text spans and the panel, never row opacity/height, so it cannot fight the steps.

### `codeSteps(tl, q, steps, opts?) → { labels, start(k) }`
Adds `s0` at the end if missing, then one label per step starting at the next free `sN` (`opts.from` to force).
Options: `root=".cs-root"`, `panel=".cs-panel" | false`, `dim=0.3`, `blur=1.2`, `dwell=0.5`, `focusBar=true`.
Inside one step the order is: panel text → leave previous run → diff → scrollTo → focus → type → run.

`CodeStep` fields (all optional, combine freely):
- `focus: LineRef | null` — those lines opacity 1, the rest `dim` + `blur(px)`; a soft bar with an accent edge moves to
  cover first..last focused line. Auto-centres the range in the viewport. `null` clears.
- `diff: true` — apply every marked line (the first `diff: true` claims them); or `{ add, remove, collapse = true }`
  with explicit lines (works on unmarked sources). Removed: red tint + `−` → collapse to height 0. Added: expand with green
  tint + `+` (tint stays, so the printed end state shows what changed). `collapse: false` keeps removed lines red and faded.
  Gutter numbers cross-fade to the new numbering. Bars and scroll follow the new layout.
- `run: LineRef` — a dot in the gutter + a line bar walk the lines in order (0.24 s move + `dwell`), following the scroll.
  `values: { 17: "38 ms" }` notes pop in at the line end when the marker arrives; they stay until the next `run`.
  The marker fades at the next step without `run`.
- `scrollTo: n | "a:n"` — line n to the top (clamped), thumb and bottom fade follow. Focus/run/type auto-scroll anyway.
- `type: LineRef` — the line is empty until this step, then revealed one character per `typeSpeed` (0.045 s) with a caret.
  Combine with `diff: { add: [n] }` to type a new line into the file.
- `title`, `body` — side panel text.

`LineRef`: `12`, `"3-7"`, `"3-5,9"`, `[12, 14]`. Numbers are lines of the imported source AS WRITTEN (with the
marker lines). Prefix `a:` = numbers of the after file, `b:` = of the before file (`"a:11-14"`); use them for pairs.

Own tweens on a step: `const r = codeSteps(...); tl.to(x, {...}, r.start(2) + 0.3)` (labels already exist).

## How it stays reversible and export-safe

Every step is plain `to`/`fromTo` property tweens on known targets with end values computed from a tracked layout
state (row visibility, focus set, scroll, run position), all built once at timeline build. No `onUpdate`, no `call`.
So it plays backwards, and `seek(any label | end)` gives the same picture with or without events.
Typing is a `width: 0ch → Nch` tween with `ease: steps(N)` on the line's token span (mono font → 1 ch per character);
the caret is an inline element right after it, so it follows for free. This is stricter than the SKILL's
"onUpdate + seek with events" recipe: it also survives `seek(label, true)`, which the reference deck uses when going back
to the previous scene (`goScene`, dir < 0).

Verified in a test deck (an older engine + this module):
- `tsc -b`, `npm run build`, `npm run build:single` pass; single file 832 kB (the scenes' JSON adds ~20 kB).
- Playwright on `dist-single/index.html` (file://): for both examples, a screenshot at every label reached by
  (1) → presses, (2) ← presses, (3) `seek(end)` then `seek(label)`, (4) `seek(0)` then `seek(label)`:
  0 differing pixels in the stage above the footer (one anti-aliased pixel in one frame). Mid-step frames with
  `seek(t, true)` (events suppressed) render correctly. `#print` shows the end states. Dev server (`vite`) works too.
  No page errors.

Integration (merged starter, fresh copy + this folder): `build:single` clean, `walk.py` PASS, `check_overlap.py`
clean, the starter's `seek_check.py` 0 failures over both examples (forward = back = jump at every label, all
styles). The panel now reads the starter tokens (`--card-bg`, `--card-border`, `--radius-card`, `--color-ink`,
`--color-ink-2`, `--color-primary-ink`, `--color-line`; the reference names `--color-bg-surface`… are gone); gutter
and language label raised to ≥ 4.5:1. In wow_check, dimmed (unfocused) rows count as "dimmed", not wash-out.

## Gotchas hit

- Query order: `?after=…&shiki`, not `?shiki&after=…` — TypeScript wildcard modules allow one `*`, so only
  `*?shiki` and `*&shiki` can be declared.
- `.ts` samples under `src/` are type-checked by `tsc -b` (failed on `import "./http"`): use the `.txt` suffix.
- React re-renders every scene on each step change (the deck's step state). Containers that codeSteps writes into
  (`.cs-gut`, `.cs-sign`, `.cs-code`) are rendered with `dangerouslySetInnerHTML` and a stable string, so React never
  reconciles their children; generated nodes carry `.cs-gen` and are removed first if the build runs again (HMR).
- `from()` tweens on rows in the entrance would record opacity 1 as the end value of rows that a diff adds later
  (they would pop in during the entrance). The entrance animates `.cs-txt` instead, and the steps own row opacity/height.
- `filter` needs a numeric start: rows get `filter: blur(0px)` at setup, otherwise the first dim tween jumps.
- "Visible" must ignore the bottom fade (64 px, shown when there is more below), otherwise auto-scroll leaves the
  focused/typed line under the fade.
- Focus with a diff in the same step: rows added outside the current focus come in dimmed; the focus of that step is
  applied after the diff.
- Value notes on long lines are clipped at the card edge (rows are `overflow: hidden`): annotate short lines.
- Ligatures are off in the block (`font-variant-ligatures: none`): they change the visible character count while typing.
- Blur on ~25 rows is fine in Chrome; for 40+ rows use `blur: 0`.
- When testing with your own seeks right after load, the deck's driver tween (`tweenTo("s0")`) is still running and
  pulls the playhead back: wait for `s0` or kill the driver (as `__deck.show` does).

## Draft SKILL.md recipe ("Code scene", for §4)

- Code scene: highlight at build time, never at runtime. Put samples in `src/scenes/code/` (add `.txt` to `.ts/.js`
  samples so tsc skips them) and import them with `?shiki` (`codeScene()` Vite plugin, `shiki` as devDependency only;
  `?after=./new.go&shiki` for a before/after pair, `// +` and `// -` at line ends for inline diffs). Render
  `<CodeBlock code={...} lines={14} />` (26 px, ≤ 16–18 visible rows, ≤ 65 chars per line), call `codeIn(tl, q)`,
  add `s0`, then `codeSteps(tl, q, STEPS)` with one object per step: `focus` (dim + blur the rest, bar behind the range),
  `diff` (red → collapse, green → expand, gutter renumbers), `run` + `values` (marker walks the request path, notes at
  line ends), `scrollTo`, `type` (with `diff: {add}` to type a new line). Steps are plain property tweens, so ←, jumps
  and export need nothing extra. Line refs are lines of the source as written; `a:`/`b:` for the after/before file of
  a pair. One idea per step, 3–4 steps per scene, and say the point in a side `<CodePanel>` card (sans font), not in
  code comments. Mono only for code; if comments or strings hold local-language text, pick a mono that covers it
  (JetBrains Mono lacks Kazakh ә ғ қ ң ұ һ; IBM Plex Mono, Fira Code, Roboto Mono, Source Code Pro, Noto Sans Mono
  cover it). Make the last step the end state you want printed (added lines keep their green tint and `+`).

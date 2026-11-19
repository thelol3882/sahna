# sahna — one CLI for animated-web-deck projects

One command for everything a deck needs: create, run, build, check, export, packs, modules, rehearsal,
recording, environment. Two faces over the same code:

- **People**: `npx sahna` in a terminal opens a menu (arrow keys, Enter). Spinners for long steps, a summary
  at the end, and "What next" hints.
- **Claude, scripts, CI**: `npx sahna <command> [flags] --json` never prompts and prints one JSON document.

You never type `python`, `pip`, `docker` or `vite` yourself: the CLI finds Python and runs the deck's
scripts, runs npm through Node, and tells you the exact fix when something is missing.

Works on Windows, macOS and Linux. Needs Node.js 20.19+ or 22.12+ (Vite 8) and, for checks/export/packs,
Python 3.9+ with a few packages (`npx sahna doctor --fix` installs them).

## Start

```bash
# from the skill folder (no install: the CLI has no npm dependencies)
node assets/cli/bin/sahna.js new my-talk            # or with choices:
node assets/cli/bin/sahna.js new my-talk --pack midnight --style showcase --lang en --modules diagram,data-viz --title "Q3 review"

cd my-talk
npx sahna              # the menu
npx sahna dev          # live dev server
npx sahna check        # every check, one summary table
npx sahna export       # PDF + PPTX
```

Inside a deck, `npx sahna <cmd>` and `npm run sahna -- <cmd>` are the same thing. `sahna new` copies this CLI into the
project as `sahna-cli/`, so the project keeps working when it is zipped, moved or opened on another computer.
It also writes `.sahna.json` (git-ignored) with the path of the skill's assets, for commands that need packs,
tools or modules (`pack`, `moodboard`, `module add`). Elsewhere, pass `--assets <skill>/assets` or set `SAHNA_ASSETS`.
`npx deck` and the old names (`deck-cli/`, `.deck.json`, `DECK_ASSETS`, `DECK_PYTHON`) still work, so decks made
before the rename keep running.

## Commands

| Command | What it does |
|---|---|
| `sahna new <dir> [--pack] [--style] [--lang] [--modules a,b] [--title] [--no-install]` | copy the starter, apply a pack (`apply_pack.py`), install modules, `npm install` |
| `sahna dev [-- <vite args>]` | Vite dev server (`npm run dev`, so module pre-hooks such as the diagram layout run) |
| `sahna build [--single]` | `dist/` and `dist-single/index.html` (the offline file you present) |
| `sahna open [--style s] [--hash id] [--print]` | open the single file in the browser; rebuilds it when the sources changed |
| `sahna check [--style all\|academic\|balanced\|showcase] [--only walk,overlap,transitions,seek,wow,modules]` | builds if stale, runs the checks, prints one table, writes `report/` |
| `sahna export [--pdf] [--pptx] [--name] [--out] [--two-page ids] [--theme]` | PDF and PPTX of every end state (`export.py`) |
| `sahna film [--style] [--only ids] [--tr id:kind]` | transitions filmed into contact sheets (`report/film/`) |
| `sahna moodboard --packs a,b,c [--content talk.json] [--style s]` | the talk's title and points in 2–3 packs (`moodboard/grid.png`) |
| `sahna pack list` · `sahna pack apply <name> [--style] [--lang]` · `sahna pack lint` | style packs |
| `sahna style [academic\|balanced\|showcase]` | show or set `DECK.style` |
| `sahna lang [en\|ru\|kk]` | show or set `DECK.locale` |
| `sahna module list` · `sahna module add <name…> [--force]` | diagram, data-viz, code-scene, video-scene, world, remote: files, package.json, config edits, `npm install` |
| `sahna rehearse report [file.json] [--compare]` | rehearsal report (newest `rehearsal*.json` in the project or Downloads by default) |
| `sahna record` · `sahna stop` · `sahna mix` · `sahna links` | phone remotes and recording (remote module; `-- <args>` go to it) |
| `sahna doctor [--fix]` | Node, npm, Python, pip packages, Playwright Chromium, ffmpeg, Docker, cloudflared, OBS websocket |

`sahna --help` and `sahna <command> --help` show every flag with examples.

### sahna check

Builds `dist-single/index.html` when it is missing or older than `src/`, `public/`, `index.html`, the Vite config or
`package.json`. Then, per style: `walk.py`, `check_overlap.py`, `check_transitions.py`, `wow_check.py`; once for all
styles: `seek_check.py`; and for installed modules: `diagram_check.py` (text, seek, shots), `viz_contrast.py`
(in `DECK.locale`), `world_check.py`. Default style: the deck's own; `--style all` before delivery.

Output: the scripts stream as they run, then one table:

```
check        style     status  result                                s
───────────  ────────  ──────  ────────────────────────────────────  ────
walk         academic  PASS    23 ok                                 13.4
overlap      academic  PASS    3 ok                                  2.3
wow          academic  PASS    0 classic, 0 with warnings            2.7
seek         all       PASS    24 checks, 0 failures, 0 page errors  38.8
diagram text all       PASS    all ok                                4.3
```

`report/summary.md` and `report/summary.json` hold the table, every FAIL line and the contact sheets:
`report/<style>/walk/contact.png`, `report/<style>/wow/contact.png` (+ `report.md`), `shots/sheet-<style>.png`
(diagram), `report/world/` (world). Exit 1 on any FAIL.

### sahna doctor

Prints what it found and, for anything missing, the exact command for this OS. `--fix` does the safe part:
`npm install` in the project, `pip install` of the missing packages (`--user`, or into a project `.venv` when the
system Python refuses pip under PEP 668; the CLI uses `.venv` automatically), `playwright install chromium`.
Docker, cloudflared, ffmpeg and OBS are only reported (with the install command).

## How it finds things

- **Project**: the nearest folder at or above the current one with `package.json` and `src/deck/config.ts`;
  `-C <dir>` / `--project <dir>` points elsewhere.
- **Python**: `SAHNA_PYTHON` (a path) → the project's `.venv` → Windows: `py -3`, `python`, `python3` → macOS/Linux:
  `python3`, `python`. Each one is asked for its version: Python 2, < 3.9 and the Microsoft Store stub are
  skipped. The resolved interpreter path is used from then on. Children run with `PYTHONUTF8=1`, so the scripts
  read and print Kazakh text and arrows on a Windows console.
- **npm**: run as `node <npm-cli.js>` (found next to Node or through `npm_execpath`), never through `npm.cmd` or a
  shell. No command line is ever built by string concatenation: paths with spaces, quotes and backslashes are
  passed as single arguments.
- **Assets**: `--assets` → `SAHNA_ASSETS` → `.sahna.json` → the folder next to this CLI.

## Files

```
cli/
  bin/sahna.js         entry
  lib/cli.js           argument parsing (node:util parseArgs), help, dispatch, JSON envelope, exit codes
  lib/commands.js      every command (the menu calls the same functions)
  lib/tui.js           the menu (buildMenu() is pure and unit-tested)
  lib/checks.js        check plan per style + output parsing + report/summary.md
  lib/modules.js       module install specs (copies, package.json, vite.config.ts / main.tsx / .gitignore edits)
  lib/edit.js          pure text edits: DECK fields, package.json, vite config, main.tsx, world.ts
  lib/doctor.js        environment checks and safe fixes
  lib/python.js        Python discovery    lib/proc.js   processes without a shell, npm via node
  lib/project.js       project / assets resolution, build staleness, file:// URLs
  vendor/clack.mjs     @clack/prompts 1.9.0 bundled (MIT, see vendor/LICENSES.md): no npm install needed
  test/                unit tests (`npm test`), the menu in a pseudo-terminal, test/e2e.mjs (slow, full run)
```

The starter wires it in: `package.json` has `"bin": {"sahna": "scripts/sahna.mjs", "deck": "scripts/sahna.mjs"}` and
`"scripts": {"sahna": …}`; `scripts/sahna.mjs` runs `sahna-cli/bin/sahna.js`, or the skill's copy through
`.sahna.json` / `SAHNA_ASSETS`.

## For Claude

Never use the menu: always pass a command, and add `--json`. Nothing prompts when stdin is not a TTY, when `CI` is
set, or with `--json`; a missing required argument is a usage error. Run from inside the deck or pass `-C <dir>`.

Every command prints exactly one JSON document on stdout:

```json
{ "ok": true, "command": "check", "data": { … }, "errors": [ { "code": "check-failed", "message": "walk showcase: 1 FAILED", "fix": "…" } ] }
```

Exit codes: `0` ok · `1` something failed (a check, the build, a script) · `2` usage or environment problem
(bad flag, not in a deck, Python or assets not found). `errors[].fix` is the exact next command. Add `--verbose`
to stream script output to stderr while stdout stays JSON.

| Command | `data` |
|---|---|
| `new <dir> --pack p --style s --lang l --modules a,b --title t` | `{dir, name, title, pack, style, lang, modules[], installed, next[]}` |
| `build [--single]` | `{dist, single, bytes}` |
| `open --print [--style s] [--hash id]` | `{url, opened}` |
| `check [--style all] [--only …]` | `{styles[], build: "fresh"\|"rebuilt"\|"skipped", report, ok, summary: {pass, fail}, rows: [{check, style, label, status: "PASS"\|"FAIL", exitCode, summary, fails[], seconds, artifacts[], details?}]}` (wow rows: `details` = per scene `{id, appendix, classic, score, reasons[], warnings[]}`) |
| `export [--pdf] [--pptx]` | `{pages, pdf, pptx, png, out}` (null for a format not asked) |
| `film [--style s] [--only ids]` | `{sheets[], out}` |
| `moodboard --packs a,b,c [--content f]` | `{out, grid, sheets[]}` |
| `pack list` / `pack apply <p>` / `pack lint` | `{packs: [{name, label, pitch, dial, prefers, fits[]}], current}` / `{pack, style, lang}` / `{fails, warnings, lines[]}` |
| `style [s]` / `lang [l]` | `{style, previous}` / `{locale, previous}` |
| `module list` / `module add <m…>` | `{modules: [{name, summary, installed}], project}` / `{added: [{module, copied, kept[], edited[], already, after[]}], installed}` |
| `rehearse report [f] [--compare]` | `{file, out, report, png}` |
| `record` / `stop` / `mix` / `links` | `{exitCode, output[]}` (last 60 lines) |
| `doctor [--fix]` | `{ok, checks: [{id, label, status: "ok"\|"warn"\|"fail"\|"skip", detail, fix?}], fixed[], python}` |
| `--version` | `{version}` |

Typical loop: `sahna new … --json` → edit scenes → `sahna check --json` → read `data.rows[].fails` and the contact
sheets in `artifacts` → fix → `sahna check --only <the failed ones> --json` → `sahna check --style all --json` →
`sahna export --json`. `sahna dev` is long-running: start it in the background.

## Tests

```bash
cd assets/cli
npm test                 # unit tests (args, paths incl. win32, python discovery, npm lookup, config and module edits,
                         # output parsing, menu builder) + the menu driven in a pseudo-terminal (Linux/macOS)
node test/e2e.mjs        # new → check --style all → export → style academic → check --only walk,wow →
                         # module add code-scene → build → doctor (several minutes; needs Python + Chromium)
```

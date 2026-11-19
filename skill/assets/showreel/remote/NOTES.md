# Remote module: notes

Optional module for animated-web-deck. Copy this folder to `remote/` in the deck project (the starter). Phones become clickers with the speaker's notes, one lead laptop drives every other deck (OBS, viewers), and each phone can record its speaker's voice for a double-ender recording.

Base: `presentation-final-gh` (18 Nov), the follow() model. The wire protocol of its `server.mjs` is kept. New message types are optional, and an old client never receives one it did not ask for, except `scenes`/`rec`/`pong` sent to phones, which only the new `remote.html` reads.

## File map

| File | What |
|---|---|
| `server.mjs` | HTTP + WebSocket relay (needs `ws`). Serves the deck, `/remote`, `/preflight` (the control page), `/media/*` with Range, `/upload`, `/rec-overlay.js`, `/healthz`, `/api/*` (lead key). obs-websocket v5 client (drives OBS). Binds 127.0.0.1 (Docker: 0.0.0.0 inside the container, published on 127.0.0.1). Heartbeat 15 s. |
| `remote.html` | Phone page, two screens. **Join**: name, one line, one "I'm ready" tap (mic permission + level + wake lock + headphones/call confirmed). **Talk**: slim bar (connection dot, level, YOUR TURN pulse, REC timer, "…"), own note big, others dimmed, big Next only on your part, small Back. "…" sheet: mic, connection, upload state, battery, text size, change speaker. Full-screen 3-2-1 and "you left the page" card. Red "microphone stopped" bar re-opens the mic. |
| `preflight.html` | Control page: big status (WAITING FOR n / READY / STARTING / REC mm:ss / SAVING / MIXING / DONE / MIX FAILED), one button (Start / Stop, both with a 2-press confirm when risky), OBS line, one row per speaker (dot + one line + level; click for details), Details (checks) and Events collapsed, Open folder / Copy path after the mix. |
| `rec-overlay.js` | Injected by the server into `?remote&obs` and `?remote&lead=` decks: the sync beep (1 kHz, 0.2 s) + white flash; REC badge on the lead deck only. Lead deck only: Ctrl+R / Cmd+R starts, twice stops; reports tab visibility; while the tab is hidden, animation frames come from a worker timer (Chrome stops rAF in background tabs, which froze GSAP and so the phones' Next). |
| `start.py` | All the npm commands (stdlib). Docker by default when running, else node + cloudflared. `--record` (idempotent: reuses a healthy run, cleans up a dead or half-started one incl. the compose project), `--links`, `--stop` (stops a running take, waits for its mix), `--mix …` (→ mix.py), `--fresh`, `--local`, `--mode`, `--no-open`, `--no-build`, `--qr`, `--dry-run`. Opens the control page and the lead deck (webbrowser), copies the team message (clip / pbcopy / wl-copy / xclip), runs the **helper** (`--helper`, detached, also in Docker mode): polls `/api/helper`, mixes stopped takes, opens folders. State in `remote/.run/`. |
| `obs-check.mjs` | One obs-websocket handshake for the first-run OBS question (`npm run obs`): connected, wrong password or not found. |
| `run.mjs` | `npm run record|stop|mix|links|obs` → finds py -3 / python / python3, runs `start.py`. |
| `qr.py` | Stdlib QR encoder (byte mode, level M, versions 1–10), terminal half-blocks. Matrices identical to the `qrcode` library for 150 random inputs. |
| `mix.py` | Stdlib + ffmpeg: align takes by `timeline.json`, loudnorm each, amix, mux under the OBS video (beep found with bandpass + silencedetect). No session = the latest; no `--video` = `timeline.obs.outputPath`, else the newest video written during the take in `obs.folder` / ~/Videos / ~/Movies / ~. With a video it writes `final.mp4` and `voices.wav` (same timeline) in one ffmpeg run. `mix()` is used by the helper. |
| `Dockerfile`, `Dockerfile.dockerignore`, `compose.yaml` | Build the deck in Docker and run the server; cloudflared quick tunnel as a second service; `recordings/` bind-mounted. |
| `config.example.json` | Copy to `config.json` (optional). |
| `RECORDING.md` | OBS + phone recording guide for the user. |
| `test/*` | Tests (not needed in a deck project): `test-server`, `test-parse`, `test-obs` + `fake-obs.mjs` (a tiny obs-websocket v5 server), `test-start` (the npm commands end to end), `test-overlay`, `e2e-browser` (Playwright). |

Add to the deck's `package.json`:

```json
"scripts": {
  "record": "node remote/run.mjs --record",
  "stop": "node remote/run.mjs --stop",
  "mix": "node remote/run.mjs --mix",
  "links": "node remote/run.mjs --links",
  "obs": "node remote/run.mjs --obs",
  "remote": "node remote/run.mjs",
  "remote:stop": "node remote/run.mjs --stop"
},
"devDependencies": { "ws": "^8.18.0" }
```

Add to `.gitignore`: `recordings/`, `remote/.run/`, `remote/obs-scene-collection.json`, `remote/obs-profile/`, `remote/config.local.json`.

The starter's `package.json` already has `ws` and all of these scripts.

## Config (`remote/config.json`, all optional)

```json
{
  "title": "Team Atlas: final demo",
  "port": 8787,
  "startScene": "cover",
  "mediaDir": "media",
  "speakers": [{ "part": 1, "name": "Alex" }, { "part": 2, "name": "Sam" }],
  "recording": { "chunkMs": 5000, "bitrate": 128000, "countdownMs": 3000, "processing": false,
                 "autoMute": true, "startFromCover": true, "camera": true },
  "obs": { "url": "ws://127.0.0.1:4455", "password": "", "source": "Deck (browser)", "folder": "~/Videos" }
}
```

- `obs`: obs-websocket v5 (OBS 28+, Tools → WebSocket Server Settings). `false` turns the automation off. Node mode re-reads the password on every connection attempt (paste it, no restart). Docker: start.py passes `OBS_URL` with 127.0.0.1/localhost replaced by `host.docker.internal` (compose adds `host-gateway` for Linux) and `OBS_PASSWORD`. `source`: the Browser source whose URL is set to this run's OBS link on connect. `folder`: where mix.py looks for the OBS file when obs-websocket did not tell it.

- `config.local.json` (git-ignored) is merged over `config.json`: put secrets there, e.g. `{"obs": {"password": "…"}}`. The shipped `config.json` is the generic example; edit or delete it.
- `mediaDir`: the folder `/media/*` is served from (videos of the video-scene module), relative to the deck project; default `media/`. Order: `MEDIA_DIR` env (Docker sets `/app/media`) > `mediaDir` > `media/`. With Docker, `start.py` mounts the real folder through `MEDIA_HOST_DIR`, because a Windows git checkout turns a `media` symlink into a text file and Docker cannot mount a file; point `mediaDir` at a real folder there.
- `speakers` may also carry `id` (matches `scene.speaker`). Without them: `DECK.speakers` in `src/deck/config.ts` (part = position + 1), else the deck's manifest, else speaker names of the scenes in order of first appearance.
- `title`: else `DECK.title`.
- `recording.autoMute` (default on): a phone is muted while it is not its speaker's part; the mic button overrides it until the next change of turn. Mute is a gain of 0 before the level and the recorder, so the recording keeps running and stays in sync.
- `recording.startFromCover` (default on): Start jumps every deck to the first scene for the countdown and replays the intro 700 ms after the beep (`introAfterBeepMs`).
- `recording.camera` (default off): `true` or `{ "fps": 15, "size": 192, "quality": 0.62 }`. Phones send square JPEG frames over the WebSocket (`{type:"frame", part, t, data}`); the server relays them to every deck (dropped for a deck with a full buffer), sends one thumbnail a second to the other phones, and records the median delay as `cameraLagMs` in `timeline.json`; `mix.py` delays the voices by it. The deck's speaker chip shows the face (`camera` in `remote-client.ts`, `.spk-face` in `styles.css`). No video is recorded on the phones: the faces reach the video through the OBS deck.
- A lead deck that joins while the talk is on (the control page's *Open the lead deck*) gets `{type:"sync", state, resume:true}` and goes there; its own states are ignored until it reports that place (or 30 s pass), so it never pulls the other decks back to its first scene.
- `recording.processing: true` turns echo cancellation, noise suppression and auto gain on (for speakers without headphones; worse voice).

Scenes, best first: `remote/scenes.json` (`[{id, title, speaker | part, notes: string[] | "a (click) b", appendix?}]`) → the lead deck's `{type:"scenes"}` manifest → `src/scenes/index.ts` parsed (top-level object literals of `export const scenes = [...]`, fields in any order, string/array/number literals; non-literal values ignored). Scenes with part 0 (backup slides) cannot be moved by phones; the lead can.

## Protocol

`/ws?k=KEY&role=deck|remote|console|overlay[&lead=LEAD][&kind=obs|lead]`. Wrong key → 403. `console` needs the lead key. A `deck` with the right `lead` is a lead; with a wrong or no `lead`, a follower.

| Type | From → to | Fields | Notes |
|---|---|---|---|
| `role` | server → deck | `lead` | on connect |
| `sync` | server → follower decks | `state` | every lead `state`, and on join (late joiners) |
| `state` | deck → server → phones | `state: {index, step, steps?, media?, returnTo?, …}` | with a lead open only the lead's counts; relayed untouched |
| `cmd` | lead deck → other decks | `cmd: replay\|media-toggle\|media-skip\|media-seek`, `index?`, `t?` | next/prev/jump are not forwarded: followers follow the state |
| `cmd` | phone → server → lead (or all decks if no lead) | `cmd: next\|prev\|replay\|hello`, `part` | next/prev only from the part on screen, 350 ms debounce, dropped while `state.media` exists and not `ended`; replay only on scene 0; `hello` goes to every deck |
| `deck` | server → phones | `online` | |
| `level` | phone → server → decks, consoles | `part`, `v` 0..1 | ~10/s, rounded to 0.01 |
| `scenes` *(new)* | lead deck → server | `scenes`, `speakers?` | optional manifest (see snippet) |
| `scenes` *(new)* | server → phones | `scenes`, `speakers` | on connect and on change |
| `ping` / `pong` *(new)* | phone → server → phone | `t` / `t`, `server` | clock offset NTP-style; also the phone's dead-socket check |
| `status` *(new)* | phone → server | `part, battery, charging, mic, micOn, headphones, recording, hidden, queue, rtt, offset, mime` | every 3 s and on change |
| `status` *(new)* | server → consoles | lead, decks, scenes, speakers (+ `lastChunkAgeMs`, `bytes`, `takes`), rec, media | 1/s |
| `rec` *(new)* | console (or lead deck) → server | `action: start\|stop` | lead only |
| `rec` *(new)* | server → phones, consoles, overlays | `state: idle\|countdown\|recording\|stopped`, `session`, `at`, `beepAt`, `countdownMs`, `beep?` | `beep: true` only to overlays, at the end of the countdown |
| `rec-gap` *(new)* | phone → server | `part, state: hidden\|visible, at, offset, hiddenMs?, resumed` | logged in timeline.json, forwarded to consoles as `gap` |
| `rec` *(added)* | lead overlay → server | `action: start\|stop\|toggle` | Ctrl+R in the lead deck (`toggle` also from console/lead deck) |
| `vis` *(added)* | lead overlay → server | `hidden` | the lead deck's tab is in the background; `status.lead.hidden` |
| `rec-error` *(added)* | server → consoles, overlays | `text` | OBS did not start recording: no take was started |
| `note` *(added)* | server → consoles | `text` | OBS events for the Events log |
| `open` *(added)* | console → server | `what: folder` | queued for the helper (opens recordings/<session>) |
| `status` *(added fields)* | server → consoles | `obs: {state: off\|connecting\|not-found\|auth\|connected, recording, error, source: ok\|updated\|missing, version, url}`, `starting`, `mix: {state: waiting\|pending\|mixing\|done\|error, note?, path?, voices?, video?, folder?, error?}`, `helper: {online}`, `consoles`, `lead.hidden`, `recDir` | |

REC with OBS connected: `rec start` → `starting` → GetRecordStatus (already recording = use it) → StartRecord → wait for `RecordStateChanged OBS_WEBSOCKET_OUTPUT_STARTED` (10 s) → the usual countdown/beep. Failure → `rec-error`, no session. `rec stop` → phones `stopped` at once → after `OBS_TAIL_MS` (1 s) StopRecord → `outputPath` into `timeline.obs` → `mix.state` goes `waiting` → `pending` once OBS stopped and the newest take of every speaker sent a chunk after Stop (or 4 × `UPLOAD_SETTLE_MS` = 10 s). Without OBS: the same minus the OBS steps.

HTTP `/api/*` (needs `k` and `lead`): `GET /api/status` (the status above), `POST /api/rec?action=start|stop`, `GET /api/helper` (`{session, state, mix, jobs}`; marks the helper online for 5 s; jobs are handed out once), `POST /api/helper` (`{session, mix}`; ignored for another session).

HTTP: `POST /upload?k&session&part&take&seq&ext&mime&t0&off&rtt` (body = one MediaRecorder chunk). 200 `{next, bytes}`, duplicate → 200 `{dup:true}`, gap → 409 `{next}`, unknown session → 410. Appends to `recordings/<session>/<speaker>[-n].<webm|m4a|ogg>`.

`timeline.json`: `{version, session, title, startedAt, countdownMs, beepAt, stoppedAt, speakers, obs: null | {driven, outputPath, stoppedAt}, tracks: [{part, name, take, file, mime, startedAt (server ms = phone t0 + offset), phoneStartedAt, clockOffsetMs, rttMs, firstChunkAt, lastChunkAt, chunks, bytes}], events: [{at, t, type: start|beep|scene|gap|stop, …}]}`. Server clock, ms since epoch; `t` = ms since `startedAt`.

## Deck-side snippets for the starter (optional, recommended)

1. **Scene manifest** (exact scenes and speakers, no source parsing). In `src/deck/remote-client.ts`:

```ts
export function connectRemote(onMsg: (m: Msg) => void, manifest?: () => object): RemoteLink | null {
  …
    s.onopen = () => {
      if (manifest) s.send(JSON.stringify({ type: "scenes", ...manifest() }));
      onMsg({ type: "cmd", cmd: "hello" });
    };
```

and where the engine calls it:

```ts
connectRemote(handler, () => ({
  speakers: DECK.speakers.map((s, i) => ({ part: i + 1, id: s.id, name: s.name })),
  scenes: scenes.map((s) => ({
    id: s.id, title: s.title, notes: s.notes, appendix: !!s.appendix,
    part: s.speaker ? DECK.speakers.findIndex((x) => x.id === s.speaker) + 1 : 0,
  })),
}));
```

Without it the server parses `src/scenes/index.ts` + `src/deck/config.ts` (tested on the starter: cover=1, results=2, backup-method=0). The manifest is still better: with Docker the source is copied at build time, and literals built from code (`notes: DATA.x.map(…)`) are invisible to the parser.

2. **REC from the lead deck** (optional; the pre-flight page already does it): on a key in the lead deck, `link.send({type:"rec", action:"start"|"stop"})`. `remote-client.ts` `send` must then let `rec` through.

## Draft SKILL.md section

> ## 12. Phone remote and recording (optional module)
>
> Use when several people present, when the talk is online (viewers follow in their own browser instead of a laggy screen share), or when the talk is recorded.
>
> - Copy `assets/modules/remote/` to `remote/`; add the `remote`, `record`, `remote:stop` scripts and `ws` (see its NOTES.md). Speakers come from `DECK.speakers`; `remote/config.json` only overrides title, port and speakers.
> - Add the scene manifest to the deck (NOTES.md snippet 1), so phones get the exact notes per step.
> - `npm run record` prints the lead link (your laptop), the OBS link, the pre-flight link, a paste-ready team message with each speaker's phone link, and a QR code. Docker if it runs, else node + cloudflared; `--local` for one laptop.
> - Phones: big Next/Back, own notes highlighted, a buzz when their part starts, Mic sends the voice level for the speaker chip. Next works only while that speaker's part is on screen and waits for a playing video. With a lead open, phones move only the lead; every other deck follows its slide and step.
> - Recording: OBS records the deck (Browser source, track 1); each phone records its own voice and uploads every 5 s. The call is only for hearing each other: on the laptop, with headphones. Wait for READY on the pre-flight page, start OBS, then Start REC: countdown, sync beep, take. Watch "saved N s ago" per speaker during the take.
> - `npm run record` opens the control page and the lead deck and copies the team message; with OBS's WebSocket server on (password in `remote/config.json`), Start/Stop on the control page also drive OBS, and after Stop the helper writes `recordings/<session>/final.mp4` by itself (`npm run mix` re-runs it, `npm run stop` ends everything). Then speed up talk parts to 1.5x, keep the demo at 1x. Give the user `remote/RECORDING.md`.
> - Test before the day: one full take with every phone, then mix it and listen.

## Tests (headless Linux, no real phones or OBS)

- `node --check` on all JS and the page scripts; `python -m py_compile start.py qr.py mix.py`.
- `MIX_TEST=1 node remote/test/test-server.mjs`: 22 groups (the 19 before, plus `/api` auth + status, the helper API: mix waits for the last uploads then pending, progress to the console, open-folder job; Ctrl+R toggle from the lead overlay only; `voices.wav` on the video timeline).
- `node remote/test/test-obs.mjs`: 7 groups against `fake-obs.mjs`: SHA-256 auth, Browser source URL update, Start → StartRecord → OutputStarted → countdown, Stop → phones first → StopRecord → outputPath in timeline.json → mix pending, OBS already recording, StartRecord failing (no take, reason to the console), reconnect after an OBS restart, OBS gone (manual path), wrong password (4009) fixed live in config.json, no password, missing source, `obs: false`.
- `node remote/test/test-parse.mjs .`: 3 groups (unchanged).
- `node remote/test/test-start.mjs`: 10 groups, the npm commands in a throwaway project (node mode, fake cloudflared, fake OBS): record opens both pages + copies the message; record again reuses (same keys, same processes); after a killed server it cleans up and starts fresh; links; a take through OBS mixed by the helper by itself (onsets within 30 ms); Open folder; `npm run mix` / `-- --no-video`; stop kills server, tunnel, helper; nothing printed mentions python.
- `node remote/test/test-overlay.mjs` (Playwright): hidden lead deck gets ~30 frames/s from the worker, native rAF when visible, cancel works, OBS deck untouched.
- `node remote/test/e2e-browser.mjs <shots>` (Playwright, fake mic, fake OBS on 4455 with a password, the real deck): 4 phones join with one tap, a fast tap right after load keeps the mic, READY, Start (OBS records first), phone Next + lead arrow key, Stop ×2, auto-mix to final.mp4 under a fake OBS mkv, Ctrl+R start / double stop without reload, npm run stop; no page errors. Passed 9 of the last 9 runs after the fixes.

## Open issues

- Not run here: Docker (no daemon in the sandbox; `docker compose config` validates), cloudflared (not installed), a real phone (MediaRecorder on iOS Safari, wake lock, vibration, background behaviour), OBS import of the generated scene collection and profile (format of OBS 30/31, written from memory of its JSON/ini keys: `browser_source` `reroute_audio`, `fps_custom`; `mixers` bitmask; `AdvOut RecFormat2/RecTracks`).
- Chrome records Opus as 2 channels even with `channelCount: 1` (same signal twice); `mix.py` downmixes to mono.
- Upload queue lives in memory: a page reload during REC loses chunks not yet uploaded (at most ~5 s); the new take continues in a new file.
- iOS Safari stops the microphone when the screen locks or another app takes audio; the page cannot prevent it, only detect it on return (gap marker + new take).
- Alignment accuracy is the clock offset (half the best RTT, usually < 50 ms over a tunnel) plus MediaRecorder start latency; check the beep visually in the editor if lips must match.
- `/media/*` and deck assets are served without the key (the `<video>` and the multi-file build cannot add it); the tunnel host name is random.
- The OBS link changes with the key at every fresh start; with obs-websocket connected the server writes it into the "Deck (browser)" source, otherwise edit the URL (or re-import the collection).
- Not run here: real OBS (the client follows the obs-websocket v5 protocol: Hello/Identify/Identified, GetRecordStatus, StartRecord, StopRecord → outputPath, RecordStateChanged, Get/SetInputSettings), Docker → host.docker.internal → OBS (Windows Firewall may block it: then the control page says OBS not found and the manual path works), a real hidden Chrome tab (the worker-frame fallback is tested with a faked document.hidden).

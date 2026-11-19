# Remote module: notes

Optional module for animated-web-deck. Copy this folder to `remote/` in the deck project (the starter). Phones become clickers with the speaker's notes, one lead laptop drives every other deck (OBS, viewers), and each phone can record its speaker's voice for a double-ender recording.

Base: `presentation-final-gh` (18 Nov), the follow() model. The wire protocol of its `server.mjs` is kept. New message types are optional, and an old client never receives one it did not ask for, except `scenes`/`rec`/`pong` sent to phones, which only the new `remote.html` reads.

## File map

| File | What |
|---|---|
| `server.mjs` | HTTP + WebSocket relay (needs `ws`). Serves the deck, `/remote`, `/preflight`, `/media/*` with Range, `/upload`, `/rec-overlay.js`, `/healthz`. Binds 127.0.0.1 (Docker: 0.0.0.0 inside the container, published on 127.0.0.1). Heartbeat 15 s. |
| `remote.html` | Phone page: picker, notes per step (own part highlighted), your-turn buzz + flash, counter, connection, Mic (level only), REC (MediaRecorder + chunk upload), setup checks, wake lock, reconnect, clock ping. |
| `preflight.html` | Lead console: checks + READY, speaker table (phone, mic, live level, headphones, battery, clock, REC, last upload age), REC start/stop, event log. |
| `rec-overlay.js` | Injected by the server into `?remote&obs` and `?remote&lead=` decks: the sync beep (1 kHz, 0.2 s) + white flash; REC badge on the lead deck only. |
| `start.py` | Launcher (stdlib). Docker by default when running, else node + cloudflared. `--record`, `--local`, `--links`, `--stop`, `--dry-run`, `--mode`, `--no-build`, `--no-qr`, `--qr-invert`. Writes the OBS files with `--record`. State in `remote/.run/`. |
| `run.mjs` | `npm run record` → finds python3 / python / py -3, runs `start.py`. |
| `qr.py` | Stdlib QR encoder (byte mode, level M, versions 1–10), terminal half-blocks. Matrices identical to the `qrcode` library for 150 random inputs. |
| `mix.py` | Stdlib + ffmpeg: align takes by `timeline.json`, loudnorm each, amix, optionally mux under the OBS video (beep found with bandpass + silencedetect). |
| `Dockerfile`, `Dockerfile.dockerignore`, `compose.yaml` | Build the deck in Docker and run the server; cloudflared quick tunnel as a second service; `recordings/` bind-mounted. |
| `config.example.json` | Copy to `config.json` (optional). |
| `RECORDING.md` | OBS + phone recording guide for the user. |
| `test/test-server.mjs`, `test/test-parse.mjs` | Tests (not needed in a deck project). |

Add to the deck's `package.json`:

```json
"scripts": {
  "remote": "node remote/run.mjs",
  "record": "node remote/run.mjs --record",
  "remote:stop": "node remote/run.mjs --stop"
},
"devDependencies": { "ws": "^8.18.0" }
```

Add to `.gitignore`: `recordings/`, `remote/.run/`, `remote/obs-scene-collection.json`, `remote/obs-profile/`.

## Config (`remote/config.json`, all optional)

```json
{
  "title": "Team Atlas: final demo",
  "port": 8787,
  "startScene": "cover",
  "mediaDir": "media",
  "speakers": [{ "part": 1, "name": "Alex" }, { "part": 2, "name": "Sam" }],
  "recording": { "chunkMs": 5000, "bitrate": 128000, "countdownMs": 3000, "processing": false }
}
```

- `speakers` may also carry `id` (matches `scene.speaker`). Without them: `DECK.speakers` in `src/deck/config.ts` (part = position + 1), else the deck's manifest, else speaker names of the scenes in order of first appearance.
- `title`: else `DECK.title`.
- `mediaDir`: the folder `/media/*` is served from (videos of the video-scene module), relative to the deck project; default `media/`. Order: `MEDIA_DIR` env (Docker sets `/app/media`) > `mediaDir` > `media/`. With Docker, `start.py` mounts the real folder through `MEDIA_HOST_DIR` (default `../media`), because a git checkout on Windows turns a `media` symlink into a text file and Docker cannot mount a file; point `mediaDir` at a real folder there.
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

HTTP: `POST /upload?k&session&part&take&seq&ext&mime&t0&off&rtt` (body = one MediaRecorder chunk). 200 `{next, bytes}`, duplicate → 200 `{dup:true}`, gap → 409 `{next}`, unknown session → 410. Appends to `recordings/<session>/<speaker>[-n].<webm|m4a|ogg>`.

`timeline.json`: `{version, session, title, startedAt, countdownMs, beepAt, stoppedAt, speakers, tracks: [{part, name, take, file, mime, startedAt (server ms = phone t0 + offset), phoneStartedAt, clockOffsetMs, rttMs, firstChunkAt, lastChunkAt, chunks, bytes}], events: [{at, t, type: start|beep|scene|gap|stop, …}]}`. Server clock, ms since epoch; `t` = ms since `startedAt`.

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
> - Mix with `python remote/mix.py recordings/<session> --video <obs.mkv>`; then speed up talk parts to 1.5x, keep the demo at 1x. Give the user `remote/RECORDING.md`.
> - Test before the day: one full take with every phone, then mix it and listen.

## Tests (headless Linux, no real phones or OBS)

- `node --check` on all JS; scripts inside `remote.html`/`preflight.html` checked too. `python -m py_compile start.py qr.py mix.py`.
- `MIX_TEST=1 node test/test-server.mjs`: 19 groups pass — keys, overlay injection, scene chunks, pre-flight auth, Range (start-end, open, suffix, 416, HEAD), traversal, roles + lead check, state relay + follower sync, lead cmd filter (next/jump not forwarded), late join, phone cmds (lead-only target, part rule, debounce, replay, watchers, no media control, video gate), level relay, ping/pong, heartbeat drop, console status, REC countdown + beep, uploads (order, dup, 409, takes, auth, 410, bad take), timeline.json, and mix.py on real Opus tones + an ffmpeg-made "OBS" video (onsets within 30 ms of the expected 2.0/3.5 s and 1.5/2.5/4.0 s).
- `node test/test-parse.mjs <starter>`: starter format, tricky literals, deck manifest; the real starter parses to cover=1/1, results=2/3, backup-method=0/1.
- `start.py`: `--dry-run`, and `--local --mode node` → `--links` → `--stop` lifecycle in a fixture; OBS files generated and parsed.
- Headless Chromium smoke test (fake mic, mobile viewport): phone page shows "Your turn", own note + next line, Next reaches the lead; setup checks; pre-flight lists checks and speakers; REC countdown on the phone, REC badge with "saved N s ago", 4 chunks of real Opus saved, timeline written; no page errors. Screenshots looked right (phone 390x844, pre-flight 1200 wide).
- Multi-file `dist/`: index with the key, `assets/*` without it, traversal 404.
- QR: OpenCV decodes most codes; the matrices are bit-identical to the `qrcode` library (all 8 masks, 150 random inputs incl. UTF-8), so OpenCV misses on masks 4–6 are its own.

## Open issues

- Not run here: Docker (no daemon in the sandbox; `docker compose config` validates), cloudflared (not installed), a real phone (MediaRecorder on iOS Safari, wake lock, vibration, background behaviour), OBS import of the generated scene collection and profile (format of OBS 30/31, written from memory of its JSON/ini keys: `browser_source` `reroute_audio`, `fps_custom`; `mixers` bitmask; `AdvOut RecFormat2/RecTracks`).
- Chrome records Opus as 2 channels even with `channelCount: 1` (same signal twice); `mix.py` downmixes to mono.
- Upload queue lives in memory: a page reload during REC loses chunks not yet uploaded (at most ~5 s); the new take continues in a new file.
- iOS Safari stops the microphone when the screen locks or another app takes audio; the page cannot prevent it, only detect it on return (gap marker + new take).
- Alignment accuracy is the clock offset (half the best RTT, usually < 50 ms over a tunnel) plus MediaRecorder start latency; check the beep visually in the editor if lips must match.
- `/media/*` and deck assets are served without the key (the `<video>` and the multi-file build cannot add it); the tunnel host name is random.
- The OBS scene collection must be re-imported (or the URL edited) after each start, because the key changes; `--key` keeps a key.

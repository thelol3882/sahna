# Module: embedded video scene

A screen recording or product video played inside the deck: an intro that hands over to the video on the exact
frame, a player bar, deck keys taken over while it plays, an outro (the intro backwards), state for the presenter
and the phones, a fallback when the file is missing, and a poster + chapters page in the export. Generalised from
the reference `DemoVideo.tsx` (both versions; the 18 Nov GitHub version's emits are ported). No brand names or
colours: theme tokens only.

## Files

```
src/video-scene/          copy this folder to the deck's src/
  VideoScene.tsx          <VideoScene {...config} /> and makeVideoScene(config)
  frames.tsx              Caption, BrowserFrame, PhoneFrame (stills around the video, ported from the reference ui.tsx)
  engine.ts               the one import of the engine ("../deck"; works as-is in the starter)
  geometry.ts             video px -> stage px (cover/contain), clip helpers, layout rect of a card
  exportMode.ts           export/print detection (class on <html>), reduced motion
  video-scene.css         plain CSS, prefixed vs-; token mapping at the top
  index.ts
tools/make-test-video.sh  20 s 1280x720 test clip: chapters 0/2/6/10/14/17, fake logo 560,280 160x160, timestamp, tone
tools/measure-rect.py     the logo rect in a frame (for intro.target), plus the video size
tests/drive.py            Playwright test of a built deck (28 checks); `starter` or `ref` engine
example/TestScenes.tsx    the test scenes (card, morph, missing file), how to configure each intro
shots/                    contact sheets from the last run (starter engine)
```

## Use it in the starter

1. Copy `src/video-scene/` to `src/video-scene/`. `engine.ts` imports from `"../deck"`, which is the starter's
   public API (`SceneRoot, useScene, useSceneActive, useDeckControl, deckRuntime`, types `Hold, MediaState`).
2. Put the video in `public/media/` (`media/demo.mp4` ends up next to `index.html` in `dist/` and `dist-single/`).
   Never `import` the mp4: the single-file build would inline it as base64. Import the poster (small jpg, inlined),
   so the export and the missing-file card work without `media/`.
3. Scene:
   ```tsx
   import { makeVideoScene } from "../video-scene";
   import poster from "../assets/demo-poster.jpg";
   export const Demo = makeVideoScene({
     src: "media/demo.mp4", poster, videoSize: { w: 1920, h: 1080 }, duration: 171.3, startAt: 0.8,
     chapters: [{ t: 0, title: "Intro" }, { t: 4.5, title: "Sign in" }, /* … */],
     intro: { kind: "morph", mark: <Mark />, markLanded: <Mark onLight />, target: { x: 764, y: 357, w: 96, h: 96 },
              reveal: `url(${firstFrameWithoutLogo})`, eyebrow: "Demo · sound on" },
     outro: { at: 168.6, text: "example.com" },
   });
   ```
   Meta in `src/scenes/index.ts`: `{ id: "demo", steps: 0, full: true, twoPage: true, notes: ["Do not speak: …"], Component: Demo }`.
   `twoPage` gives the export its two pages (poster, then chapters).
4. Transition into it (`DECK.enter`): none for `kind: "card"` (the soft fade is part of the effect). For morph/fade
   the scene starts on the dark backdrop, so a dark-friendly kind (or none) fits.

## Config (VideoSceneProps)

| prop | default | meaning |
|---|---|---|
| `src` | — | URL relative to the HTML (`media/x.mp4`) |
| `poster` | — | imported image; shown before load, in export, in the fallback |
| `chapters` | one untitled | `[{ t, title }]`, seconds |
| `videoSize`, `fit` | 1920x1080, `"cover"` | needed before the metadata loads, to place the morph target |
| `duration` | from metadata | shown until the metadata arrives |
| `startAt` | 0 | video time the intro lands on; playback starts there |
| `intro` | `{ kind: "fade" }` | `morph`, `card`, `fade` (below). Reduced motion always uses a short fade |
| `outro` | `{}` = at the end | `{ at?, text? }`: the intro backwards from video time `at`; `false` = none (the last frame stays) |
| `audio` | `{ volume: .9, fadeIn: 1.6, fadeOut: 2.4 }` | `false` = muted video |
| `skipConfirm` | true | Next asks once, skips on a second press within 2.6 s |
| `keys` | K / J / L | `KeyboardEvent.code` of toggle / previous / next chapter |
| `labels` | English | every UI string (toast, fallback, export page) |

Intros:
- `morph`: `mark` builds on the backdrop at `from` (default: 260 px box in the middle), a circular hole opens from it
  into `reveal`, and the mark flies onto `target` (VIDEO pixels). `markLanded` cross-fades in during the flight
  (the logo's colours inside the video). `buildMark(tl, el, at) => endTime` replaces the default pop-in (use DrawSVG
  etc.). `lockup` = extra elements positioned in stage px (a wordmark), fading in after landing. The video takes over
  0.3–0.7 s after landing and the overlay fades out over 0.4 s.
- `card`: the video opens from a card of the previous scene (`from`: selector or stage rect; `radius` defaults to the
  card's border radius) with an expanding `clip-path: inset(...)`. The outro folds it back into that rect.
- `fade`: backdrop with optional `eyebrow` and `title`, fading into the video.

Behaviour (as in the reference): player bar on mouse move, on pause and on every key action (play/pause, scrubber with
time + chapter on hover, chapter ticks and names); a click on the video pauses; while it plays Next asks then skips
(to the outro), Back = previous chapter (or the start of the current one after 2 s), K pause, J/L chapters; after
the outro Next moves on. Seeking back from the outro brings the video back. After the end, Back into the scene shows
the end state; K replays from `startAt`, Next moves on.

## Engine contract

- Hold: registered with `setHold` only while the scene is active and not exporting; released on leave.
- Media state: `setMedia({ playing, t, dur, chapter, ended })` about once a second and on play/pause/seek/end;
  `null` when the scene is left. `ended` turns true when the outro has finished (or at the end without an outro).
- Commands: `media-toggle`, `media-skip`, `media-seek {t}` reach `hold.toggle/skip/seek`. The lead deck emits them
  for its own K/J/L, clicks, scrubbing, the Back chapter step and the confirmed skip (the 18 Nov reference: followers
  follow the lead's state, not its key presses). Followers ignore their own keys and clicks.
- Side effects: the video starts only from the `tl.call` at the handoff, and only if the scene is active and
  `deckRuntime.seeking/exporting/print` are all false, and `<html>` has no `export-mode`/`print-mode` class.
  So Back into the scene, jumps, `__deck.show` and export never start it.
- Leaving the scene: volume fades to 0 and the video pauses; a running outro is finished at once; the HUD hides.

## Export and print

The scene timeline ends its entrance at `s0`, then has one more tween (`s0 + 0.05`) that shows a chapters page.
Live, the deck never plays past `s0` (steps = 0), so that page is only reached by seeking to the end:
- `__deck.show(i, 0)` seeks to `s0`: the overlay is gone and the export class shows the poster over the frame (page 1);
- `__deck.show(i, "end")` seeks to `tl.duration()`: the chapters page over the dimmed poster (page 2);
- `#print` (`jumpTl(tl, duration)`) prints the chapters page.
`setExport(true)` (class `export-mode`) pauses the video, drops any outro state (so page 1 is the poster even if the
video was watched before), hides the HUD, toast and fallback card. With `scripts/export.py` mark the scene `twoPage`.
If the file is missing, the export still works (poster), but the starter's export prints the browser's
`ERR_FILE_NOT_FOUND` console error as a page error.

## Aligning the morph with the logo in the video

1. Choose `startAt`: a frame where the video shows its logo still (the reference: logo faded in by 0.7 s, start 0.8).
2. Measure: `python3 tools/measure-rect.py public/media/demo.mp4 0.8 --region 600,250,500,400 --out /tmp/check.png`.
   It prints `videoSize` and the bounding box of everything that differs from the background in the region, and
   draws it into the check image. Narrow the region to the tile you want to land on (on the reference video it
   returns x 764, y 357, the reference's hard-coded position; the box is 136x143 because the pin sticks out of the
   96 px tile; the mark's box must cover the same thing the mark draws).
3. `target` = that rect in VIDEO pixels; set `videoSize` and `fit` to match. The module maps it to the stage
   (1280x720 with cover -> x1.5; the test asserts the mark box lands on 840,420,240,240 exactly).
4. Make the mark's SVG fill its box with the same padding as the logo in the video (viewBox = the logo's bounds).
5. `reveal`: a still of the first frame WITHOUT the logo (`url(...)`) or its background colour; `"video"` only when
   the `startAt` frame has no logo yet, otherwise the logo is doubled while the mark flies.
6. Check the handoff: screenshot just before and after the takeover; nothing should jump. For the outro, the video
   at `outro.at` must show the logo in the same place again (or use `outro: { at }` before the video's own ending).

## Gotchas

- Laser key: the starter holds L for the laser dot (`DECK.laserKey`). The module keeps J/K/L (YouTube convention)
  and takes them in the capture phase with `stopImmediatePropagation` only while its video runs, so the laser does
  not fire then. The starter's laser key is X for this reason.
- Keys typed into an input (the search palette) are ignored by the player.
- The phone rule of the 18 Nov reference (the demo belongs to the lead laptop) lives in the remote server and the
  phone page, not in the scene: the server drops phone `next`/`prev` while `state.media` is set and not `ended`,
  phones have no pause/skip buttons, and phone commands go only to the lead (followers follow its state). The
  starter has no remote server yet; port this when it gets one:
  ```js
  // server.mjs, phone messages
  const md = lastState?.state?.media;
  if ((m.cmd === "next" || m.cmd === "prev") && md && !md.ended) return;
  // LEAD_CMDS = ["replay", "media-toggle", "media-skip", "media-seek"]   (no next/prev: followers follow state)
  ```
  The presenter window is on the lead laptop, so its K (media-toggle) stays allowed.
- Autoplay: the handoff comes after key presses, so sound normally plays. Opened directly on the video (no gesture),
  Chrome refuses unmuted play: the video plays muted with the toast "Sound is off: press Next or K"; the next Next,
  K or click unmutes (Next is consumed for that). If even muted play is refused, a big play button shows.
- Headless Chromium lets sound autoplay and Playwright's `evaluate()` counts as a user gesture, so the test emulates
  Chrome's policy with a `play()` stub that tracks trusted key/pointer events.
- `preload="auto"`: every video scene starts loading when the deck opens (all scenes are mounted). Fine for one
  demo; for several large videos switch to `metadata`.
- Card intro: the card is measured by layout (offset chain up to `.stage`), not `getBoundingClientRect`, so an
  entrance transform or the stage scale do not change it. Use a poster/still that matches the `startAt` frame, or
  the card visibly changes picture when it opens. The module makes its scene root transparent for this kind (the
  starter gives `.scene` an opaque canvas colour).
- The hole of the morph is a CSS mask with a tweened custom property (`--vs-hole`); tested in Chromium only.
- Reduced motion: GSAP runs 25x faster globally and the intro becomes a short fade; the video plays at normal speed.
- Never put Tailwind `scale-*`/`translate-*` classes on module elements: the CSS is plain on purpose.

## Tests (integration, merged starter)

Fresh copy of assets/starter + `src/video-scene/`, `example/TestScenes.tsx`, `example/index.test.ts` as
`src/scenes/index.ts`, `bash tools/make-test-video.sh public/media/test.mp4 src/assets/test-poster.jpg`, `build:single`,
then `python3 -I tests/drive.py $PWD/dist-single/index.html shots starter`: 28/28. The test now waits for the deck's
waiting cue before pressing ← (the merged transition grammar plays longer transitions than the old starter's fade,
and a press during a transition is ignored by design). The "logo at the target after the handoff" pixel check is
timing-sensitive under load (it passed in the final runs; one earlier run caught the next chapter's colour).
Transition into a video scene: give it `enter: "fade"` in the scene meta (or none for `card`); the style's default
grammar would otherwise pick rise/wipe.

## Tests (19 Nov, module author)

`tsc -b`, `build`, `build:single` pass in three scratch decks: the old reference engine, the 18 Nov reference engine
and a copy of the starter. `tests/drive.py`
on `dist-single/index.html` from file://: 28/28 checks on each engine:
card intro, playback from `startAt`, music fade-in, L/J/Back chapters, media state on the BroadcastChannel,
remote `media-toggle`/`media-seek`, skip confirmation, card outro -> ended, video paused when leaving, morph lands on
the exact rect, video logo in the same place after the handoff, natural outro at `outro.at`, Next after the outro,
missing-file card with the full file:// path, Next past it, Back into a finished scene stays paused, export
(no video plays, poster + chapters pages), no page errors, muted autoplay fallback + unmute, reduced motion.
The starter's `scripts/export.py` also exported the test deck (poster + chapters pages for each video scene).

## SKILL.md recipe draft: "Embedded video scene"

```markdown
### Embedded video scene (demo, screen recording)

Use the `video-scene` module (`src/video-scene/`); do not write a player per deck.
- Put the video in `public/media/` and pass `src: "media/x.mp4"`. Never import it (the single file would inline it).
  Import a small poster instead. Ship `media/` next to the HTML and say so in the README.
- Pick one intro: `morph` (the brand mark builds, the video's first frame opens from it, the mark lands on the logo
  in the video), `card` (the video opens from a card of the previous scene), or `fade`. Outro = the intro backwards.
- Morph: choose `startAt` on a still logo frame, measure the logo with `tools/measure-rect.py`, pass it as `target`
  in video pixels with `videoSize`; `reveal` = that frame without the logo. Check frames just before and after the
  handoff: nothing may jump.
- Meta: `steps: 0, full: true, twoPage: true`. Notes: "Do not speak; Next twice skips; Back = previous chapter".
- While it plays the scene owns the keys: Next asks then skips to the outro, Back = previous chapter, K pause, J/L
  chapters. After the outro, Next moves on. The video starts only when the deck plays forward (never on seek, jump,
  export or print).
- Phones only show the video state: the remote server ignores phone Next/Back until `media.ended`; the lead laptop
  runs the video.
- Export: page 1 poster, page 2 chapter list. A missing file shows a card with the expected path; Next continues.
- Verify: open `dist-single/index.html` from file:// with and without `media/`; run `tests/drive.py`.
```

## Open issues

- The phone gate above is implemented in modules/remote (server drops phone next/prev while `state.media` plays).
- Not tested in Safari/Firefox (the CSS mask hole, `color-mix`) or with a real 50 MB file over the remote server
  (range requests are the server's job).
- One video per scene; no subtitles track support (captions are expected to be burned into the video).
- The morph recolours the mark only by cross-fading two marks (`markLanded`).

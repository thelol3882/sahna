# Recording the talk

OBS records the deck itself (no screen share), and every speaker's voice is recorded on their own phone, then mixed under the video. The call (Meet, Zoom, Discord) is only for hearing each other. It is never recorded.

## Once, before the first take (lead, about 5 minutes)

1. **OBS 28 or newer: the first `npm run record` asks** "Use OBS automation? [Y/n]". Say yes, then in OBS: Tools → WebSocket Server Settings → tick *Enable WebSocket server* → Apply → *Show Connect Info*, and paste the Server Password into the terminal. It checks the password against OBS and saves it to `remote/config.local.json` (git ignores it). Change it any time with `npm run obs`. Windows may ask to let OBS through the firewall: allow it, because Docker reaches OBS through it.
2. Run `npm run record` once, then in OBS: **Profile → Import** → `remote/obs-profile` (switch to it) and **Scene Collection → Import** → `remote/obs-scene-collection.json` (switch to it). You never re-import: every start writes the new deck link into the *Deck (browser)* source by itself.
3. ffmpeg must be installed for the automatic mix: `winget install Gyan.FFmpeg` (macOS: `brew install ffmpeg`).

Without step 1 everything still works: the control page says *OBS not found*, and you start and stop the OBS recording by hand.

## The take

```bash
npm run record
```

It starts everything (Docker if it runs, else node + cloudflared), opens **the control page** and **the lead deck** in your browser, and copies the team message with the phone links to your clipboard. Paste it into the team chat. Running it again reuses the running remote (same links). If a previous run got stuck, it is cleaned up first.

1. Teammates open their link and tap **I'm ready**. Their row on the control page turns green.
2. When the control page says **READY**, press **Start recording**. OBS starts recording, then every phone counts 3-2-1, then the OBS deck beeps and flashes once (the sync clap). Stay quiet for it. **Ctrl+R** in the lead deck does the same.
3. Present. On the control page, a red row means that phone stopped saving: look at it or ask the person.
4. Press **Stop** twice (the second press confirms). In the lead deck: Ctrl+R twice. The phones stop, then OBS stops, then the mix runs by itself: **MIXING…**, then **DONE** with the path and an *Open folder* button.

Give the control page its own window next to the lead deck (drag the tab out), so you can see both at once.

Result in `recordings/<session>/`: `final.mp4` (the OBS video with the voices, each normalised to -16 LUFS, plus the deck sound), `voices.wav` (the voices alone, on the same timeline), the phone files and `timeline.json`.

```bash
npm run links    # the links and the team message again
npm run mix      # mix the latest take again (finds the OBS file itself)
npm run mix -- --video "D:\Videos\take.mkv"             # another OBS file
npm run mix -- --beep-at 4.2                            # if the beep is not found
npm run stop     # stop everything at the end (a running take is stopped and mixed first)
```

**Every take starts on the cover.** Start jumps every deck (lead, OBS, viewers) to the cover for the countdown, and the intro plays right after the sync beep, so each take opens the same way. `"startFromCover": false` under `recording` turns it off.

**Lead deck closed?** The control page says LEAD DECK CLOSED with an *Open the lead deck* button (during a take, a red bar with the same button). It opens on the slide the talk is on and does not pull the other decks back. A lead deck in a background tab keeps working; a window of its own is safer, because Chrome's Memory Saver can unload background tabs (or add the site under chrome://settings/performance → *Always keep these sites active*).

**Mic and camera, as in Meet.** Each phone has a round mic button and a camera button (with your own picture) next to Back and Next, and a small chip per teammate: their face or initials, a crossed red mic when muted, an orange ring on whose turn it is, a green ring while they talk. A phone mutes itself when its speaker's part ends and unmutes when it starts, so nobody records silence by forgetting; tap the mic any time to override until the next change of turn. Muted means the chip does not light up and the voice stays out of the mix; the recording keeps running, so the tracks stay in sync. `"autoMute": false` turns the automatic part off.

**Faces on the slides.** With `"camera": true` under `recording`, the speaker chip on every deck turns into the speaker's live face (and anyone else who talks gets one too). The OBS deck shows it as well, so the faces are in the recording; `npm run mix` delays the voices by the measured camera delay so lips and words match. Each phone sends about 15 small frames a second (about 1 Mbit/s); `"camera": { "fps": 10, "size": 160 }` makes it lighter on a weak connection. Camera off on the phone = the initials again. The control page says whose camera is blocked, stopped or sends no picture (yellow dot); it never blocks Start, because the deck falls back to the initials.

## Rules for every speaker

- The call runs on the laptop, not on the phone with the remote. Headphones on.
- Keep the remote page open with the screen on until the lead stops. If you leave it, the page shows a red card when you come back, records again, and `timeline.json` marks the gap.
- Phone on a charger or above 30%.

## For the team chat (the lead pastes this; `npm run record` also copies it, with the links)

> 1. Join the call on your laptop (not on the phone) and put headphones on.
> 2. Open your link on your phone: Chrome on Android, Safari on iPhone.
> 3. Tap "I'm ready" and allow the microphone (and the camera, if your deck shows faces).
> 4. Keep that page open with the screen on until the lead says stop.
> 5. Your Next button lights up on your part: press it when the slide stops moving.
> 6. If a red bar says the microphone stopped, tap it.

## Edit

Speed up the talk parts to 1.5x and keep the demo video at 1x, so the music stays right. Cut the countdown and the white flash at the start.

## Live online talk instead of a recording

`npm run remote` (no recording). Viewers open the "Watch the deck" link from the team message, click once (for video sound) and press F. Their decks follow the lead's slide and step.

## When something goes wrong

- **OBS not found** on the control page: OBS closed, or its WebSocket server is off. Start the OBS recording by hand before Start and stop it after Stop; the mix still finds the newest video in your Videos folder.
- **OBS asks for a password / wrong password**: `npm run obs` and paste it again (Show Connect Info → Copy), then `npm run record -- --fresh`.
- **MIX FAILED**: the reason is on the control page (often: ffmpeg not installed). Fix it, then `npm run mix`.
- Anything stuck: `npm run stop`, then `npm run record`.

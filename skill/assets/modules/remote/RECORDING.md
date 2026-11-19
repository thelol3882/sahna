# Recording the talk

OBS records the deck itself (no screen share), and every speaker's voice is recorded on their own phone, then mixed under the video. The call (Meet, Zoom, Discord) is only for hearing each other. It is never recorded.

## Once, before the first take (lead, about 5 minutes)

1. **OBS 28 or newer: turn on the WebSocket server.** Tools → WebSocket Server Settings → tick *Enable WebSocket server* → *Show Connect Info* → copy the password into `remote/config.local.json` (create it; git ignores it, so the password never reaches GitHub):
   ```json
   { "obs": { "password": "paste-it-here" } }
   ```
   (Or untick *Enable Authentication* and leave the password empty.) Windows may ask to let OBS through the firewall: allow it, because Docker reaches OBS through it.
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

## Rules for every speaker

- The call runs on the laptop, not on the phone with the remote. Headphones on.
- Keep the remote page open with the screen on until the lead stops. If you leave it, the page shows a red card when you come back, records again, and `timeline.json` marks the gap.
- Phone on a charger or above 30%.

## For the team chat (the lead pastes this; `npm run record` also copies it, with the links)

> 1. Join the call on your laptop (not on the phone) and put headphones on.
> 2. Open your link on your phone: Chrome on Android, Safari on iPhone.
> 3. Tap "I'm ready" and allow the microphone.
> 4. Keep that page open with the screen on until the lead says stop.
> 5. Your Next button lights up on your part: press it when the slide stops moving.
> 6. If a red bar says the microphone stopped, tap it.

## Edit

Speed up the talk parts to 1.5x and keep the demo video at 1x, so the music stays right. Cut the countdown and the white flash at the start.

## Live online talk instead of a recording

`npm run remote` (no recording). Viewers open the "Watch the deck" link from the team message, click once (for video sound) and press F. Their decks follow the lead's slide and step.

## When something goes wrong

- **OBS not found** on the control page: OBS closed, or its WebSocket server is off. Start the OBS recording by hand before Start and stop it after Stop; the mix still finds the newest video in your Videos folder.
- **OBS asks for a password / wrong password**: copy it again from Show Connect Info into `remote/config.local.json`, then `npm run record -- --fresh`.
- **MIX FAILED**: the reason is on the control page (often: ffmpeg not installed). Fix it, then `npm run mix`.
- Anything stuck: `npm run stop`, then `npm run record`.

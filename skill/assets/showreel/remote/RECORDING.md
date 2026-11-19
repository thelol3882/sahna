# Recording the talk

Meet screen sharing drops frames, and a voice that goes through a call loses quality. The setup below avoids both: OBS draws the deck itself, and the voices are recorded on each speaker's phone, then mixed under the video.

Everyone talks on any call (Meet, Zoom, Discord) to hear each other, but the call is never recorded. If you are all in the same room, you can skip the call.

## One command

```bash
npm run record          # = python remote/start.py --record
```

It builds the deck if needed, starts the remote (Docker if it runs, else node + cloudflared), waits for the tunnel and prints:

1. the **lead link**: open it on your laptop; your keys move every deck;
2. the **OBS link**;
3. the **pre-flight link** (REC control, lead only);
4. a team message with every speaker's phone link, ready to paste, and a QR code for the phone link.

It also writes `remote/obs-scene-collection.json` and `remote/obs-profile/`.

## Rules for every speaker

- **The call runs on the laptop, not on the phone with the remote.** Phones often give the microphone to one app only; a call on the same phone takes it from the recording.
- **Headphones on.** Phone processing is off for a clean voice, so other voices from the laptop speakers would get into your track.
- Open your phone link, tap **Mic**, allow the microphone, tick the two checks. The lead speaks into his own phone remote too, like everyone else.
- **Keep the remote page open with the screen on** until the lead stops. The page holds a wake lock, but if you switch apps or lock the phone, the browser stops the recorder: the page shows a red warning when you come back, records again as a new take, and `timeline.json` marks the gap.
- Phone on a charger or above 30%.

## OBS (Studio 30 or newer)

1. **Profile → Import** → `remote/obs-profile`, then switch to it.
2. **Scene Collection → Import** → `remote/obs-scene-collection.json`, then switch to it. It has:
   - **Deck (browser)**: the OBS link, 1920×1080, 60 fps, *Control audio via OBS* on, audio track 1 (deck sound and demo music);
   - **Backup mic**: the laptop's default microphone on track 2 only, so it is not in the main mix. It is a rough fallback if a phone track fails.
3. The key changes at every start: re-import the collection, or edit the URL in the Browser source.
4. Check these profile settings once (if the profile import did not take, set them by hand):
   - Settings → Video: base and output 1920×1080, 60 FPS;
   - Settings → Output → Advanced → Recording: format **mkv**, audio tracks **1 and 2**;
   - encoder: x264 CRF 18 is in the profile; pick a hardware encoder (NVENC, QuickSync, Apple VT) if you have one;
   - Settings → Audio: 48 kHz.

To press a key inside the OBS deck (R for the intro), right-click the source → **Interact**.

## The take

1. Open the lead link in Chrome on your laptop and the pre-flight page next to it.
2. Wait for **READY**: every phone connected, microphones on, headphones confirmed, lead and OBS decks connected, media files reachable. Battery and viewer count only warn.
3. Start the OBS recording, then press **Start REC for everyone**. Phones count down 3-2-1, then the OBS deck beeps and flashes white once: this is the sync clap. Stay quiet for it.
4. Present. During the take the pre-flight page shows per speaker *saved N s ago*: a chunk arrives every 5 s, so red (over 12 s) means that phone stopped uploading. Look at the phone or ask the person.
5. Press **Stop**, then stop OBS. Then `python remote/start.py --stop`.

Files: `recordings/<session>/<speaker>.webm` (`.m4a` from iPhones; `-2`, `-3` for takes after a gap) and `timeline.json` (start, beep, every scene and step, gaps, clock offsets).

## Mix

```bash
python remote/mix.py recordings/<session> --video "<obs file>.mkv"
```

It finds the beep in the OBS audio, places each phone take by its measured start, normalises each voice to -16 LUFS, mixes them with the deck audio and copies the video into `final.mp4`. If the beep is not found, listen for it and pass `--beep-at 4.20`. Without `--video` you get `voices.wav` only. Remux the mkv first (File → Remux Recordings) if your editor needs mp4.

## Edit

Speed up the talk parts to 1.5x and keep the demo video at 1x, so the music stays right. Cut the countdown and the white flash at the start.

## Live online talk instead of a recording

`python remote/start.py` (no `--record`). Viewers open the "Watch the deck" link from the team message in their own browser, click once (for video sound) and press F. Their decks follow the lead's slide and step; their keys do nothing, and a late joiner lands on the current slide. Phones move only the lead deck.

# Recording a talk

A recorded group talk used to be a screen share in a call: the deck dropped frames and the call compressed the voices. Now each part is recorded where it is best.

- **The deck** is recorded by OBS on the lead laptop, from a Browser source at 1920×1080 and 60 fps.
- **Each voice** is recorded by the speaker's own phone. The phone page records in chunks and uploads one every 5 s to `recordings/<session>/`, so a dead phone or a lost connection costs at most 5 s.
- **The call** (Meet or anything else) is only for hearing each other.

The lead deck sends its scene and step to the remote server, and every other deck copies that state. Followers do not replay key presses: a press that only finished an animation on the lead used to move a follower on. A viewer who joins late lands on the current step.

Start on the control page (or Ctrl+R in the lead deck) starts OBS over obs-websocket, counts 3-2-1 on every phone and plays a sync beep. Stop stops the phones, then OBS, then mixes: each voice track is aligned by the beep and the clock offsets measured during the take, loudness-normalised and laid under the OBS video as `final.mp4`.

The user only runs npm commands: `npm run record`, `stop`, `mix`, `links` (or `npx sahna record` …). The server runs in Docker when it is available, else in Node, behind a Cloudflare quick tunnel.

This was tested with simulated phones and a fake OBS; do one short take with real phones and real OBS the day before.

"""Mix the phone recordings of one session into one voice track, under the OBS video.

    npm run mix                                   # the latest session; finds the OBS file itself
    npm run mix -- 20261127-181500                # one session (a folder in recordings/)
    npm run mix -- --video "C:/Videos/2026-11-27 18-15-02.mkv"
    npm run mix -- --beep-at 4.20                 # if the beep is not found in the OBS audio
    npm run mix -- --no-video                     # voices.wav only

After Stop on the control page this runs by itself (the helper started by npm run record).

What it does:
  1. reads timeline.json (written by server.mjs during the take);
  2. places every phone take on one timeline: the take's start in server time (the phone clock plus
     the offset measured by ping/pong) minus the moment of the sync beep;
  3. normalises the loudness of each voice (ffmpeg loudnorm, -16 LUFS) and mixes them (amix);
  4. with the OBS video (timeline.json "obs.outputPath" from obs-websocket, else the newest video in
     ~/Videos, ~/Movies or ~ written during the take): finds the 1 kHz sync beep in the OBS audio, puts the
     voices at the same place, mixes them with the deck audio (track 1) and copies the video stream untouched.

Standard library + the ffmpeg CLI on PATH. Writes <session>/voices.wav (aligned to the video when there is
one) and <session>/final.mp4. Nothing is sped up: do the 1.5x talk / 1x demo edit afterwards in your editor.
"""

import sys as _sys
for _stream in (_sys.stdout, _sys.stderr):  # a Windows console in cp1252 must not crash on arrows or Kazakh text
    try:
        _stream.reconfigure(errors="replace")
    except Exception:
        pass
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
VIDEO_EXT = (".mkv", ".mp4", ".mov", ".flv")


class MixError(Exception):
    pass


def die(msg):
    sys.exit("mix: " + msg)


def ffmpeg_hint():
    if sys.platform == "win32":
        return "ffmpeg is not installed: winget install Gyan.FFmpeg (then open a new terminal and run npm run mix)"
    if sys.platform == "darwin":
        return "ffmpeg is not installed: brew install ffmpeg (then npm run mix)"
    return "ffmpeg is not installed: sudo apt install ffmpeg (then npm run mix)"


def recordings_dir():
    return os.environ.get("RECORDINGS_DIR") or os.path.join(ROOT, "recordings")


def find_session(name=None):
    """A session folder: a path, a name in recordings/, or (None) the newest one with timeline.json."""
    if name:
        for p in (name, os.path.join(recordings_dir(), name)):
            if os.path.isfile(os.path.join(p, "timeline.json")):
                return os.path.abspath(p)
        raise MixError(f"no recording {name} (no timeline.json in it)")
    base = recordings_dir()
    try:
        names = sorted(d for d in os.listdir(base) if os.path.isfile(os.path.join(base, d, "timeline.json")))
    except OSError:
        names = []
    if not names:
        raise MixError(f"no recordings yet in {base}")
    return os.path.join(base, names[-1])


def video_dirs():
    home = os.path.expanduser("~")
    if os.environ.get("OBS_VIDEO_DIRS") is not None:   # tests: only these folders
        return [d for d in os.environ["OBS_VIDEO_DIRS"].split(os.pathsep) if d]
    extra = []
    try:
        with open(os.path.join(HERE, "config.json"), encoding="utf-8") as f:
            folder = (json.load(f).get("obs") or {}).get("folder")
            if folder:
                extra.append(os.path.expanduser(folder))
    except (OSError, ValueError, AttributeError):
        pass
    return extra + [os.path.join(home, "Videos"), os.path.join(home, "Movies"), home]


def guess_video(tl):
    """The newest video file written during the take, in the usual OBS folders, or None."""
    since = (tl.get("startedAt") or 0) / 1000.0
    best = None
    for d in video_dirs():
        try:
            names = os.listdir(d)
        except OSError:
            continue
        for n in names:
            if not n.lower().endswith(VIDEO_EXT):
                continue
            p = os.path.join(d, n)
            try:
                st = os.stat(p)
            except OSError:
                continue
            if st.st_size > 0 and st.st_mtime >= since and (best is None or st.st_mtime > best[0]):
                best = (st.st_mtime, p)
    return best[1] if best else None


def wait_stable(path, seconds=3.0, timeout=120.0, note=None):
    """OBS finishes writing the file after it stops: wait until its size does not change for a few seconds."""
    deadline = time.time() + timeout
    last, since = -1, time.time()
    while time.time() < deadline:
        try:
            size = os.path.getsize(path)
        except OSError:
            size = -1
        if size != last:
            last, since = size, time.time()
        elif size > 0 and time.time() - since >= seconds:
            return True
        time.sleep(0.5)
    return last > 0


def obs_video(tl, wait=0.0, note=None):
    """The OBS file of this take: from timeline.json (obs-websocket), else a guess; waits up to `wait` s."""
    deadline = time.time() + wait
    while True:
        path = (tl.get("obs") or {}).get("outputPath")
        if path and os.path.exists(path):
            return path
        guess = guess_video(tl)
        if guess:
            return guess
        if time.time() >= deadline:
            if path:
                print(f"Note: OBS saved {path}, but that file is not on this computer.")
            return None
        if note:
            note("waiting for the OBS file (stop the OBS recording if it still runs)")
        time.sleep(2)


def find_beep(video, track, search=180.0):
    """Seconds from the start of the video to the onset of the 1 kHz sync beep, or None."""
    cmd = ["ffmpeg", "-hide_banner", "-nostats", "-t", str(search), "-i", video, "-map", f"0:a:{track}",
           "-af", "bandpass=f=1000:width_type=q:w=8,volume=6,silencedetect=noise=-28dB:d=0.08", "-f", "null", "-"]
    out = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", out.stderr)]
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", out.stderr)]
    # the beep is about 0.2 s of tone: the first silence end whose next silence starts within ~0.5 s
    for e in ends:
        nxt = [s for s in starts if s > e]
        if nxt and nxt[0] - e < 0.6:
            return e
    return ends[0] if ends else None


def mix(session, video=None, beep_at=None, deck_track=0, deck_volume=1.0, lufs=-16.0, out=None, dry_run=False,
        use_video=True, wait_video=0.0, note=None):
    """Mix one session. Returns {"voices": path, "final": path or None, "video": path or None}."""
    say = note or (lambda text: None)
    if not shutil.which("ffmpeg"):
        raise MixError(ffmpeg_hint())
    tl_file = os.path.join(session, "timeline.json")
    if not os.path.exists(tl_file):
        raise MixError(f"no timeline.json in {session}")
    with open(tl_file, encoding="utf-8") as f:
        tl = json.load(f)

    ref = tl.get("beepAt") or tl.get("startedAt")
    if not tl.get("beepAt"):
        print("Note: no beep in this session (stopped during the countdown?): aligning to the REC start.")
    tracks = []
    for t in tl.get("tracks", []):
        path = os.path.join(session, t["file"])
        if not os.path.exists(path) or os.path.getsize(path) == 0:
            print(f"Skip {t['file']}: missing or empty")
            continue
        start = t.get("startedAt")
        how = "phone clock + offset"
        if start is None or t.get("clockOffsetMs") is None:
            # no clock: the first chunk arrives about one chunk length after the start
            start = (t.get("firstChunkAt") or ref) - 5000
            how = "first chunk time (rough)"
        tracks.append({**t, "path": path, "offset": (start - ref) / 1000.0, "how": how})
    if not tracks:
        raise MixError("no phone recordings in this session")

    gaps = [e for e in tl.get("events", []) if e.get("type") == "gap" and e.get("state") == "hidden"]
    for g in gaps:
        name = next((s["name"] for s in tl.get("speakers", []) if s["part"] == g.get("part")), g.get("part"))
        print(f"Warning: {name} left the remote page {g['t'] / 1000:.1f} s after REC: check that part of the take.")

    if use_video and not video:
        video = obs_video(tl, wait_video, say)
        if video:
            print(f"OBS video: {video}")
        else:
            print("No OBS video found: voices.wav only (npm run mix -- --video <file> to add it).")
    if video:
        if not os.path.exists(video):
            raise MixError(f"no such video: {video}")
        say("waiting for OBS to finish the file")
        wait_stable(video)
        beep = beep_at if beep_at is not None else find_beep(video, deck_track)
        if beep is None:
            raise MixError("the sync beep was not found in the video; listen for it and run npm run mix -- --beep-at SECONDS")
        print(f"Sync beep in the video at {beep:.3f} s")
        zero = beep
    else:
        zero = -min(t["offset"] for t in tracks)  # the earliest take starts at 0

    # phone cameras on the deck arrive a little after the voice: delay the voices by the same, so lips match
    lag = tl.get("cameraLagMs")
    if video and isinstance(lag, (int, float)) and lag > 20:
        lag = min(lag, 800) / 1000.0
        print(f"Camera bubbles: voices {lag * 1000:.0f} ms later, to match the faces")
        zero += lag
    for t in tracks:
        t["pos"] = zero + t["offset"]
        print(f"  {t['name']:<20} {t['file']:<24} at {t['pos']:+8.3f} s  ({t['how']}, rtt {t.get('rttMs')} ms)")

    voices = os.path.join(session, "voices.wav")
    final = (out or os.path.join(session, "final.mp4")) if video else None
    if out and not video:
        voices = out
    cmd = ["ffmpeg", "-hide_banner", "-y"]
    if video:
        cmd += ["-i", video]
    first = 1 if video else 0
    for t in tracks:
        cmd += ["-i", t["path"]]

    parts, labels = [], []
    for i, t in enumerate(tracks):
        chain = f"[{first + i}:a]aformat=channel_layouts=mono,aresample=48000,loudnorm=I={lufs}:TP=-1.5:LRA=11,aresample=48000"
        if t["pos"] >= 0:
            chain += f",adelay=delays={int(round(t['pos'] * 1000))}:all=1"
        else:
            chain += f",atrim=start={-t['pos']:.3f},asetpts=PTS-STARTPTS"
        parts.append(chain + f"[v{i}]")
        labels.append(f"[v{i}]")
    n = len(labels)
    voice_mix = f"{''.join(labels)}amix=inputs={n}:normalize=0:duration=longest"
    if video:
        # one ffmpeg run, two files: the voices alone (voices.wav, on the video's timeline) and the final video
        parts.append(voice_mix + ",asplit=2[vw][vm]")
        parts.append("[vw]alimiter=limit=0.95[voices]")
        if deck_volume > 0:
            parts.append(f"[0:a:{deck_track}]aresample=48000,aformat=channel_layouts=stereo,volume={deck_volume}[deck]")
            parts.append("[vm][deck]amix=inputs=2:normalize=0:duration=longest,alimiter=limit=0.95[mix]")
        else:
            parts.append("[vm]alimiter=limit=0.95[mix]")
        cmd += ["-filter_complex", ";".join(parts)]
        cmd += ["-map", "0:v:0", "-c:v", "copy", "-map", "[mix]", "-c:a", "aac", "-b:a", "192k", "-shortest", final]
        cmd += ["-map", "[voices]", "-ac", "1", "-c:a", "pcm_s16le", voices]
    else:
        parts.append(voice_mix + ",alimiter=limit=0.95[mix]")
        cmd += ["-filter_complex", ";".join(parts)]
        cmd += ["-map", "[mix]", "-ac", "1", "-c:a", "pcm_s16le", voices]

    if dry_run:
        print(" ".join(f'"{x}"' if " " in x or ";" in x else x for x in cmd))
        return {"voices": voices, "final": final, "video": video}
    say("mixing")
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        print(r.stderr[-3000:])
        raise MixError("ffmpeg failed (details above)")
    print(f"Done: {final or voices}")
    if final:
        print(f"      {voices}")
    return {"voices": voices, "final": final, "video": video}


def main(argv=None):
    ap = argparse.ArgumentParser(prog="npm run mix --", description="Align, normalise and mix the phone recordings of a session.")
    ap.add_argument("session", nargs="?", help="the session (a folder in recordings/); default: the latest")
    ap.add_argument("--video", help="the OBS recording (mkv or mp4); default: found from timeline.json or the OBS folder")
    ap.add_argument("--no-video", action="store_true", help="voices.wav only")
    ap.add_argument("--beep-at", type=float, help="seconds into the video where the sync beep starts (skip the search)")
    ap.add_argument("--deck-track", type=int, default=0, help="audio track of the video with the deck sound (0 = first)")
    ap.add_argument("--deck-volume", type=float, default=1.0, help="volume of the deck audio in the final mix (0 to drop it)")
    ap.add_argument("--lufs", type=float, default=-16.0, help="loudness target of each voice")
    ap.add_argument("--out", help="output file (default: <session>/final.mp4, or <session>/voices.wav without video)")
    ap.add_argument("--dry-run", action="store_true", help="print the ffmpeg command, do not run it")
    a = ap.parse_args(argv)
    try:
        session = find_session(a.session)
        print(f"Session: {session}")
        mix(session, video=a.video, beep_at=a.beep_at, deck_track=a.deck_track, deck_volume=a.deck_volume, lufs=a.lufs,
            out=a.out, dry_run=a.dry_run, use_video=not a.no_video)
    except MixError as e:
        die(str(e))


if __name__ == "__main__":
    main()

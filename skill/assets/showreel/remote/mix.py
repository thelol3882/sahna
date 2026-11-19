"""Mix the phone recordings of one session into one voice track, optionally under the OBS video.

    python remote/mix.py recordings/20261127-181500
    python remote/mix.py recordings/20261127-181500 --video "C:/Videos/2026-11-27 18-15-02.mkv"
    python remote/mix.py recordings/<session> --video obs.mkv --beep-at 4.20   # if the beep is not found

What it does:
  1. reads timeline.json (written by server.mjs during the take);
  2. places every phone take on one timeline: the take's start in server time (the phone clock plus
     the offset measured by ping/pong) minus the moment of the sync beep;
  3. normalises the loudness of each voice (ffmpeg loudnorm, -16 LUFS) and mixes them (amix);
  4. with --video: finds the 1 kHz sync beep in the OBS audio, puts the voices at the same place,
     mixes them with the deck audio (track 1: demo music) and copies the video stream untouched.

Standard library + the ffmpeg CLI on PATH. Writes <session>/voices.wav and, with --video, <session>/final.mp4
(or --out). Nothing is sped up: do the 1.5x talk / 1x demo edit afterwards in your editor.
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


def die(msg):
    sys.exit("mix.py: " + msg)


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


def main():
    ap = argparse.ArgumentParser(description="Align, normalise and mix the phone recordings of a session.")
    ap.add_argument("session", help="the folder recordings/<session> with timeline.json")
    ap.add_argument("--video", help="the OBS recording (mkv or mp4) to put the voices under")
    ap.add_argument("--beep-at", type=float, help="seconds into the video where the sync beep starts (skip the search)")
    ap.add_argument("--deck-track", type=int, default=0, help="audio track of the video with the deck sound (0 = first)")
    ap.add_argument("--deck-volume", type=float, default=1.0, help="volume of the deck audio in the final mix (0 to drop it)")
    ap.add_argument("--lufs", type=float, default=-16.0, help="loudness target of each voice")
    ap.add_argument("--out", help="output file (default: <session>/final.mp4 with --video, else <session>/voices.wav)")
    ap.add_argument("--dry-run", action="store_true", help="print the ffmpeg command, do not run it")
    a = ap.parse_args()

    if not shutil.which("ffmpeg"):
        die("ffmpeg is not on PATH (https://ffmpeg.org/download.html)")
    tl_file = os.path.join(a.session, "timeline.json")
    if not os.path.exists(tl_file):
        die(f"no timeline.json in {a.session}")
    with open(tl_file, encoding="utf-8") as f:
        tl = json.load(f)

    ref = tl.get("beepAt") or tl.get("startedAt")
    if not tl.get("beepAt"):
        print("Note: no beep in this session (stopped during the countdown?): aligning to the REC start.")
    tracks = []
    for t in tl.get("tracks", []):
        path = os.path.join(a.session, t["file"])
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
        die("no recordings to mix")

    gaps = [e for e in tl.get("events", []) if e.get("type") == "gap" and e.get("state") == "hidden"]
    for g in gaps:
        name = next((s["name"] for s in tl.get("speakers", []) if s["part"] == g.get("part")), g.get("part"))
        print(f"Warning: {name} left the remote page {g['t'] / 1000:.1f} s after REC: check that part of the take.")

    zero = 0.0
    if a.video:
        if not os.path.exists(a.video):
            die(f"no such video: {a.video}")
        beep = a.beep_at if a.beep_at is not None else find_beep(a.video, a.deck_track)
        if beep is None:
            die("the sync beep was not found in the video; listen for it and pass --beep-at SECONDS")
        print(f"Sync beep in the video at {beep:.3f} s")
        zero = beep
    else:
        zero = -min(t["offset"] for t in tracks)  # the earliest take starts at 0

    for t in tracks:
        t["pos"] = zero + t["offset"]
        print(f"  {t['name']:<20} {t['file']:<24} at {t['pos']:+8.3f} s  ({t['how']}, rtt {t.get('rttMs')} ms)")

    out = a.out or os.path.join(a.session, "final.mp4" if a.video else "voices.wav")
    cmd = ["ffmpeg", "-hide_banner", "-y"]
    if a.video:
        cmd += ["-i", a.video]
    first = 1 if a.video else 0
    for t in tracks:
        cmd += ["-i", t["path"]]

    parts, labels = [], []
    for i, t in enumerate(tracks):
        chain = f"[{first + i}:a]aformat=channel_layouts=mono,aresample=48000,loudnorm=I={a.lufs}:TP=-1.5:LRA=11,aresample=48000"
        if t["pos"] >= 0:
            chain += f",adelay=delays={int(round(t['pos'] * 1000))}:all=1"
        else:
            chain += f",atrim=start={-t['pos']:.3f},asetpts=PTS-STARTPTS"
        parts.append(chain + f"[v{i}]")
        labels.append(f"[v{i}]")
    if a.video and a.deck_volume > 0:
        parts.append(f"[0:a:{a.deck_track}]aresample=48000,aformat=channel_layouts=stereo,volume={a.deck_volume}[deck]")
        labels.append("[deck]")
    n = len(labels)
    parts.append(f"{''.join(labels)}amix=inputs={n}:normalize=0:duration=longest,alimiter=limit=0.95[mix]")
    cmd += ["-filter_complex", ";".join(parts)]
    if a.video:
        cmd += ["-map", "0:v:0", "-c:v", "copy", "-map", "[mix]", "-c:a", "aac", "-b:a", "192k", "-shortest", out]
    else:
        cmd += ["-map", "[mix]", "-ac", "1", "-c:a", "pcm_s16le", out]

    if a.dry_run:
        print(" ".join(f'"{x}"' if " " in x or ";" in x else x for x in cmd))
        return
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        print(r.stderr[-3000:])
        die("ffmpeg failed")
    print(f"Done: {out}")


if __name__ == "__main__":
    main()

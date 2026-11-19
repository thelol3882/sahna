"""
Measure the logo rect in a video frame (for intro.target of the morph intro).

  python3 tools/measure-rect.py media/demo.mp4 0.8            # frame at 0.8 s (= startAt)
  python3 tools/measure-rect.py media/demo.mp4 0.8 --region 600,250,700,500   # only look inside x,y,w,h
  python3 tools/measure-rect.py media/demo.mp4 0.8 --bg EDE6D8 --tol 24

Finds the bounding box of every pixel that differs from the background colour (default: the colour of the
top-left pixel of the region) by more than --tol, prints it in VIDEO pixels, and writes <video>.frame.png with
the box drawn (in the current folder, or --out), so you can check it. Exclude captions, timestamps or a second logo with --region.
Also prints the video size (videoSize in the config). Needs ffmpeg + Pillow.
"""
import sys as _sys
for _stream in (_sys.stdout, _sys.stderr):  # a Windows console in cp1252 must not crash on arrows or Kazakh text
    try:
        _stream.reconfigure(errors="replace")
    except Exception:
        pass
import argparse, json, subprocess, sys, tempfile, os
from PIL import Image, ImageDraw

ap = argparse.ArgumentParser()
ap.add_argument("video"); ap.add_argument("t", type=float)
ap.add_argument("--region"); ap.add_argument("--bg"); ap.add_argument("--tol", type=int, default=24)
ap.add_argument("--out", default="measure-frame.png")
a = ap.parse_args()

tmp = os.path.join(tempfile.mkdtemp(), "f.png")
subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(a.t), "-i", a.video, "-frames:v", "1", tmp], check=True)
im = Image.open(tmp).convert("RGB")
W, H = im.size
rx, ry, rw, rh = map(int, a.region.split(",")) if a.region else (0, 0, W, H)
bg = tuple(int(a.bg[i:i + 2], 16) for i in (0, 2, 4)) if a.bg else im.getpixel((rx, ry))
px = im.load()
xs, ys = [], []
for y in range(ry, min(ry + rh, H)):
    for x in range(rx, min(rx + rw, W)):
        p = px[x, y]
        if max(abs(p[0] - bg[0]), abs(p[1] - bg[1]), abs(p[2] - bg[2])) > a.tol:
            xs.append(x); ys.append(y)
if not xs:
    sys.exit("nothing differs from the background in that region; check --bg/--region/--tol")
r = {"x": min(xs), "y": min(ys), "w": max(xs) - min(xs) + 1, "h": max(ys) - min(ys) + 1}
d = ImageDraw.Draw(im)
d.rectangle([r["x"] - 1, r["y"] - 1, r["x"] + r["w"], r["y"] + r["h"]], outline=(255, 0, 255), width=2)
out = a.out  # never next to the video: the media folder may be read-only or shipped
im.save(out)
print(json.dumps({"videoSize": {"w": W, "h": H}, "target": r, "bg": "#%02X%02X%02X" % bg}))
print("checked frame with the box:", out)

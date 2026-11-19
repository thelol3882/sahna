"""Data-viz screenshots: every scene at every step label, in each dial style, plus contact sheets.

  python scripts/viz_shots.py [dist-single/index.html] [--out shots] [--styles academic,balanced,showcase] [--lang en]

Writes shots/<style>/<scene>-s<k>.png, shots/sheet-<scene>.png (rows = styles, columns = steps) and
shots/sheet-<style>.png (every step of every scene). Exit 1 on page errors.
"""
from __future__ import annotations

import sys as _sys
for _stream in (_sys.stdout, _sys.stderr):  # a Windows console in cp1252 must not crash on arrows or Kazakh text
    try:
        _stream.reconfigure(errors="replace")
    except Exception:
        pass
import argparse
import asyncio
import pathlib
import sys

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from deckpage import deck_info, deck_url, open_deck, show  # noqa: E402

TW, TH = 640, 360


def font(size: int):
    for p in ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/dejavu/DejaVuSans.ttf"]:
        if pathlib.Path(p).exists():
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def sheet(cells: list[list[tuple[pathlib.Path | None, str]]], path: pathlib.Path, title: str) -> None:
    rows, cols = len(cells), max(len(r) for r in cells)
    pad, lab, head = 16, 30, 50
    W = cols * (TW + pad) + pad
    H = head + rows * (TH + lab + pad) + pad
    img = Image.new("RGB", (W, H), (236, 236, 232))
    d = ImageDraw.Draw(img)
    d.text((pad, 14), title, fill=(20, 20, 20), font=font(24))
    for r, row in enumerate(cells):
        for c, (p, label) in enumerate(row):
            x, y = pad + c * (TW + pad), head + r * (TH + lab + pad)
            d.text((x, y + 4), label, fill=(40, 40, 40), font=font(18))
            if p and p.exists():
                img.paste(Image.open(p).convert("RGB").resize((TW, TH), Image.LANCZOS), (x, y + lab))
    img.save(path)


async def run(target: str | None, out: pathlib.Path, styles: list[str], lang: str, motion: list[tuple[str, int]] | None = None) -> int:
    errors: list[str] = []
    shots: dict[str, dict[str, list[pathlib.Path]]] = {}
    info = None
    for st in styles:
        url = deck_url(target, f"style={st}&lang={lang}")
        async with open_deck(url, errors) as pg:
            info = await deck_info(pg)
            await pg.evaluate("__deck.setExport(true)")
            (out / st).mkdir(parents=True, exist_ok=True)
            shots[st] = {}
            for i in info["order"]:
                sid = info["ids"][i]
                shots[st][sid] = []
                for k in range(info["steps"][i] + 1):
                    await show(pg, i, k, 350)
                    p = out / st / f"{sid}-s{k}.png"
                    await pg.screenshot(path=str(p))
                    shots[st][sid].append(p)
    assert info
    for i in info["order"]:
        sid = info["ids"][i]
        n = info["steps"][i] + 1
        sheet([[(shots[st][sid][k], f"{st} · s{k}") for k in range(n)] for st in styles], out / f"sheet-{sid}.png", f"{sid} — steps × styles")
    for st in styles:
        cells = [[(p, f"{sid} s{k}") for k, p in enumerate(shots[st][sid])] for sid in shots[st]]
        sheet(cells, out / f"sheet-{st}.png", f"{st} — every scene, every step")
    # motion frames: the effects that only exist in motion (beams, particles, pings, odometer roll)
    if motion:
        st = styles[-1]
        async with open_deck(deck_url(target, f"style={st}&lang={lang}"), errors) as pg:
            info = await deck_info(pg)
            rows = []
            for sid, k in motion:
                i = info["ids"].index(sid)
                await show(pg, i, k - 1, 300)
                row = []
                for _ in range(6):
                    await pg.keyboard.press("ArrowRight")
                    try:
                        await pg.wait_for_function(f"__deck.state().step === {k}", timeout=1200)
                        break
                    except Exception:
                        pass
                for f in range(6):
                    await pg.wait_for_timeout(330)
                    p = out / st / f"motion-{sid}-s{k}-{f}.png"
                    await pg.screenshot(path=str(p))
                    row.append((p, f"{sid} → s{k} +{(f + 1) * 330} ms"))
                rows.append(row)
            sheet(rows, out / f"sheet-motion-{st}.png", f"{st} — frames during steps (beams, particles, pings)")
    for e in errors:
        print("ERROR", e)
    print(f"{sum(len(v) for s in shots.values() for v in s.values())} shots, {len(errors)} page errors → {out}")
    return 1 if errors else 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("target", nargs="?")
    ap.add_argument("--out", default="shots")
    ap.add_argument("--styles", default="academic,balanced,showcase")
    ap.add_argument("--lang", default="en")
    ap.add_argument("--motion", default="launch:1,growth:2,speed:1,convert:1,kz-map:2,kz-map:3", help="scene:step pairs filmed in the last style")
    a = ap.parse_args()
    mo = [(x.split(":")[0], int(x.split(":")[1])) for x in a.motion.split(",") if x]
    sys.exit(asyncio.run(run(a.target, pathlib.Path(a.out), a.styles.split(","), a.lang, mo)))

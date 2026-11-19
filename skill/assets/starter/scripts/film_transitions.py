"""Film every forward transition of the main flow as a contact sheet (SKILL §11), per style.

    npm run build:single
    python scripts/film_transitions.py                       # all three styles → shots/transitions-<style>.png
    python scripts/film_transitions.py --style showcase --times 0.15,0.45,0.75,1.05,1.4
    python scripts/film_transitions.py --tr "end:sweep"      # try a kind without editing the deck (?tr=)
    python scripts/film_transitions.py --style showcase --only results --kinds curtain,wipe,liquid   # one row per kind

Each row = one transition (from the end of the previous scene), each column = a moment after the press.
The GSAP clock is stopped and stepped (__deck.clock), so every frame is exactly at the asked time.
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

from PIL import Image, ImageDraw

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from deckpage import ROOT, deck_url, open_deck  # noqa: E402



async def film(target: str | None, style: str, times: list[float], out: pathlib.Path, tr: str, only: str, tag: str = "") -> tuple[list, list[str]]:
    errors: list[str] = []
    q = f"style={style}&gl=force" + (f"&tr={tr}" if tr else "")  # gl=force: SwiftShader fails the GPU budget
    rows: list[tuple[str, list[pathlib.Path]]] = []
    tmp = out / f"_frames-{style}{tag}"
    tmp.mkdir(parents=True, exist_ok=True)
    for old in tmp.glob("*.png"):
        old.unlink()
    async with open_deck(deck_url(target, q), errors) as pg:
        plans = await pg.evaluate("__deck.transitions")
        order = await pg.evaluate("__deck.order")
        appx = await pg.evaluate("__deck.appendix")
        main = [i for i in order if not appx[i]]
        for p in plans:
            if only and p["into"] not in only.split(","):
                continue
            prev = main[main.index(p["index"]) - 1]
            await pg.evaluate(f"__deck.show({prev}, 'end')")
            await pg.wait_for_timeout(500)
            await pg.evaluate("__deck.clock(0)")
            await pg.keyboard.press("ArrowRight")
            run = await pg.evaluate("__deck.lastTransition()")
            frames = []
            for t in times:
                await pg.evaluate(f"__deck.clock({t})")
                await pg.wait_for_timeout(60)
                path = tmp / f"{p['into']}-{t:.2f}.png"
                await pg.screenshot(path=str(path))
                frames.append(path)
            await pg.evaluate("__deck.clock(null)")
            await pg.wait_for_function("!__deck.state().busy", timeout=20_000)
            kind = run["kind"] + (f" {run['through']}" if run["through"] else "") + (f" + shared {','.join(run['shared'])}" if run["shared"] else "")
            if p["why"] not in ("as asked", ""):
                kind += f"   ({p['why']})"
            rows.append((f"→ {p['into']}: {kind}", frames))
    return rows, errors


def sheet(rows, times, path: pathlib.Path, style: str) -> None:
    tw, th, head, lab = 384, 216, 40, 34
    W = tw * len(times)
    img = Image.new("RGB", (W, head + len(rows) * (th + lab)), "white")
    d = ImageDraw.Draw(img)
    d.text((8, 12), f"style={style}   columns: " + "  ".join(f"{t:.2f}s" for t in times), fill="black")
    for r, (label, frames) in enumerate(rows):
        y = head + r * (th + lab)
        d.text((8, y + 10), label, fill="black")
        for c, f in enumerate(frames):
            img.paste(Image.open(f).convert("RGB").resize((tw, th)), (c * tw, y + lab))
    img.save(path)
    print(f"sheet: {path}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--html")
    ap.add_argument("--style", default="academic,balanced,showcase")
    ap.add_argument("--times", default="0.15,0.45,0.75,1.05,1.4")
    ap.add_argument("--tr", default="", help="?tr= override, e.g. end:sweep,results:curtain")
    ap.add_argument("--only", default="", help="comma-separated scene ids (transitions INTO them)")
    ap.add_argument("--kinds", default="", help="with --only <id>: film each kind into that scene, one row each")
    ap.add_argument("--sheet", default="", help="file name prefix for --kinds sheets")
    ap.add_argument("--out", default=str(ROOT / "shots"))
    a = ap.parse_args()
    out = pathlib.Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    times = [float(t) for t in a.times.split(",")]
    errs: list[str] = []
    for s in a.style.split(","):
        if a.kinds:  # one row per kind, all into the same scene (--only)
            rows: list = []
            for k in a.kinds.split(","):
                r, e = asyncio.run(film(a.html, s, times, out, f"{a.only}:{k}", a.only, f"-{k}"))
                rows += r
                errs += e
            sheet(rows, times, out / f"{a.sheet or 'kinds'}-{s}-into-{a.only}.png", s)
            continue
        rows, e = asyncio.run(film(a.html, s, times, out, a.tr, a.only))
        errs += e
        sheet(rows, times, out / f"transitions-{s}{'-' + a.only.replace(',', '+') if a.only else ''}{'-tr' if a.tr else ''}.png", s)
    for e in errs:
        print(e)
    raise SystemExit(1 if errs else 0)


if __name__ == "__main__":
    main()

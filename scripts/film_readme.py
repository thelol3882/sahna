"""Films the README animations from a built deck: the GSAP clock is stopped and stepped, so every frame is exact.

    python scripts/film_readme.py <deck.html> <out-dir> --query "style=showcase&gl=force" --plan "show:0:0,key:r:3.2,hold:1,key:ArrowRight:2.6"

Plan items: show:<scene>:<step|end> (instant), key:<key>:<seconds> (press, then film), hold:<seconds> (repeat the last frame).
Frames are written as out-dir/00000.png … at --fps; make a GIF or WebP from them with ffmpeg.
Needs Playwright with Chromium (the deck scripts' requirements).
"""
from __future__ import annotations

import argparse
import asyncio
import json
import pathlib
import shutil

from playwright.async_api import async_playwright

GL_ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("html")
    ap.add_argument("out")
    ap.add_argument("--query", default="style=showcase&gl=force")
    ap.add_argument("--plan", required=True)
    ap.add_argument("--fps", type=float, default=15)
    ap.add_argument("--width", type=int, default=1920)
    ap.add_argument("--height", type=int, default=1080)
    a = ap.parse_args()
    out = pathlib.Path(a.out)
    shutil.rmtree(out, ignore_errors=True)
    out.mkdir(parents=True)
    url = pathlib.Path(a.html).resolve().as_uri() + ("?" + a.query if a.query else "")
    n = 0
    errors: list[str] = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=GL_ARGS)
        pg = await browser.new_page(viewport={"width": a.width, "height": a.height}, device_scale_factor=1)
        pg.on("pageerror", lambda e: errors.append(str(e)))
        await pg.goto(url)
        await pg.wait_for_function("window.__deck && window.__deck.ready()", timeout=60_000)
        await pg.wait_for_timeout(1500)
        last: pathlib.Path | None = None
        for item in a.plan.split(","):
            kind, *args = item.split(":")
            if kind == "show":
                await pg.evaluate("__deck.clock(null)")
                k = args[1] if args[1] == "end" else int(args[1])
                await pg.evaluate(f"__deck.show({int(args[0])}, {json.dumps(k)})")
                await pg.wait_for_timeout(700)
            elif kind == "key":
                await pg.evaluate("__deck.clock(null)")
                await pg.wait_for_timeout(300)
                await pg.evaluate("__deck.clock(0)")
                await pg.keyboard.press(args[0])
                frames = round(float(args[1]) * a.fps)
                for f in range(1, frames + 1):
                    await pg.evaluate(f"__deck.clock({f / a.fps})")
                    await pg.wait_for_timeout(30)
                    last = out / f"{n:05d}.png"
                    await pg.screenshot(path=str(last))
                    n += 1
            elif kind == "hold":
                if last is None:
                    last = out / f"{n:05d}.png"
                    await pg.screenshot(path=str(last))
                    n += 1
                for _ in range(round(float(args[0]) * a.fps)):
                    shutil.copy(last, out / f"{n:05d}.png")
                    n += 1
            else:
                raise SystemExit(f"unknown plan item {item}")
        await browser.close()
    print(f"{n} frames in {out}" + (f"; page errors: {errors}" if errors else ""))


asyncio.run(main())

"""Frame times during world flights, real time (no pausing), per flight and per configuration.

    python scripts/world_perf.py [--html dist-single/index.html] [--runs 2] [--configs "style=showcase,style=showcase&gl=0,style=balanced"]

Headless Chromium renders on the CPU (SwiftShader for WebGL, software compositing), so absolute numbers are far
worse than a laptop GPU; compare configurations against each other.
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

import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from deckpage import deck_url, open_deck  # noqa: E402


async def walk(html, q):
    errors: list[str] = []
    async with open_deck(deck_url(html, q), errors) as pg:
        rest = "__deck.state().waiting && !__deck.state().busy && !(window.__world && __world.flight)"
        await pg.wait_for_function(rest, timeout=30000)
        last = await pg.evaluate("__deck.order.filter(i => !__deck.appendix[i]).slice(-1)[0]")
        while (await pg.evaluate("__deck.state().index")) != last:
            await pg.keyboard.press("ArrowRight")
            await pg.wait_for_function(rest, timeout=30000)
        await pg.keyboard.press("KeyO")
        await pg.wait_for_function("!__world.flight", timeout=15000)
        await pg.keyboard.press("Escape")
        await pg.wait_for_function(rest, timeout=30000)
        stats = await pg.evaluate("__world.stats.map(f => ({name: f.name, frames: f.frames.slice(1)}))")
    return stats, errors


async def main_async(a):
    for q in a.configs.split(","):
        allf: list[float] = []
        per: dict[str, list[float]] = {}
        for _ in range(a.runs):
            stats, errors = await walk(a.html, q)
            for f in stats:
                per.setdefault(f["name"], []).extend(f["frames"])
                allf.extend(f["frames"])
        p = lambda xs, k: float(np.percentile(xs, k)) if xs else 0.0  # noqa: E731
        print(f"{q:32s} all: n={len(allf):4d} p50={p(allf, 50):6.1f} ms p95={p(allf, 95):6.1f} ms  errors={len(errors)}")
        for name, xs in per.items():
            print(f"    {name:14s} n={len(xs):3d} p50={p(xs, 50):6.1f} p95={p(xs, 95):6.1f} max={max(xs) if xs else 0:6.1f}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--html")
    ap.add_argument("--runs", type=int, default=2)
    ap.add_argument("--configs", default="style=showcase,style=showcase&gl=0,style=balanced")
    asyncio.run(main_async(ap.parse_args()))


if __name__ == "__main__":
    main()

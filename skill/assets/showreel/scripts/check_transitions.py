"""Transition checks (creative transitions module) and frame-time measurement.

    npm run build:single
    python scripts/check_transitions.py [--style showcase] [--html dist-single/index.html]

1. ← at the start of a scene is the plain fade: no cover, no WebGL canvas, no flying clones, never busy.
2. A forward transition killed half-way by __deck.show (export, jumps) leaves no clones, plate or canvas behind.
3. Frame times (rAF deltas, real time) while a shader transition and a through-zoom play, plus an idle baseline:
   p50 / p95 / max in ms. Headless Chromium renders WebGL with SwiftShader (CPU): its load-time benchmark turns
   the shaders off (overlay fallbacks play); --gl force measures the shaders anyway, as a CPU worst case.
Fails (exit 1) on a broken rule or a page error.
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

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from deckpage import deck_url, open_deck  # noqa: E402

FRAMES = """(ms) => new Promise((res) => { const d = []; let last = performance.now(); const t0 = last;
  const f = (now) => { d.push(now - last); last = now; if (now - t0 < ms) requestAnimationFrame(f); else res(d); };
  requestAnimationFrame(f); })"""
LEFTOVERS = """(() => ({ flights: document.querySelectorAll('[data-flight]').length,
  canvas: [...document.querySelectorAll('canvas')].filter(c => !c.closest('[data-scene]')).some(c => getComputedStyle(c).visibility === 'visible'),
  cover: getComputedStyle(document.querySelector('.tr-part')?.parentElement ?? document.body).visibility === 'visible' }))()"""


def stats(d: list[float]) -> str:
    d = sorted(d[1:]) or [0]
    pick = lambda q: d[min(len(d) - 1, int(q * len(d)))]  # noqa: E731
    return f"n={len(d)} p50={pick(0.5):.1f} p95={pick(0.95):.1f} max={d[-1]:.1f} ms"


async def run(target: str | None, style: str, gl: str) -> int:
    fails: list[str] = []
    errors: list[str] = []

    def check(ok: bool, what: str) -> None:
        print(f"{'ok  ' if ok else 'FAIL'}  {what}")
        if not ok:
            fails.append(what)

    async with open_deck(deck_url(target, f"style={style}" + (f"&gl={gl}" if gl else "")), errors) as pg:
        plans = await pg.evaluate("__deck.transitions")
        print("webgl:", await pg.evaluate("__deck.gl()"))
        await pg.wait_for_timeout(300)
        # 1. back = fade
        for p in plans:
            await pg.evaluate(f"__deck.show({p['index']}, 0)")
            await pg.wait_for_timeout(300)
            await pg.keyboard.press("ArrowLeft")
            seen = {"busy": False, "flights": 0, "canvas": False, "cover": False}
            for _ in range(6):
                await pg.wait_for_timeout(70)
                st = await pg.evaluate("__deck.state()")
                lo = await pg.evaluate(LEFTOVERS)
                seen["busy"] |= st["busy"]
                seen["flights"] = max(seen["flights"], lo["flights"])
                seen["canvas"] |= lo["canvas"]
                seen["cover"] |= lo["cover"]
            st = await pg.evaluate("__deck.state()")
            moved = st["index"] != p["index"]
            check(moved and not any(seen.values()), f"← from {p['into']} is a plain fade {'' if not any(seen.values()) else seen}")
        # 2. kill mid-way
        for p in plans:
            prev = (await pg.evaluate("__deck.order")).index(p["index"]) - 1
            await pg.evaluate(f"__deck.show(__deck.order[{prev}], 'end')")
            await pg.wait_for_timeout(300)
            await pg.keyboard.press("ArrowRight")
            await pg.wait_for_timeout(450)
            await pg.evaluate(f"__deck.show({p['index']}, 'end')")
            await pg.wait_for_timeout(200)
            lo = await pg.evaluate(LEFTOVERS)
            vis = await pg.evaluate("[...document.querySelectorAll('[data-scene]')].filter(e => getComputedStyle(e).visibility === 'visible').map(e => e.dataset.scene)")
            check(lo == {"flights": 0, "canvas": False, "cover": False} and vis == [p["into"]], f"show() during → {p['into']} leaves nothing behind {lo} {vis}")
        # 3. frame times
        print(f"idle baseline           {stats(await pg.evaluate(FRAMES, 1500))}")
        for p in plans:
            prev = (await pg.evaluate("__deck.order")).index(p["index"]) - 1
            await pg.evaluate(f"__deck.show(__deck.order[{prev}], 'end')")
            await pg.wait_for_timeout(400)
            await pg.keyboard.press("ArrowRight")
            run = await pg.evaluate("__deck.lastTransition()")
            d = await pg.evaluate(FRAMES, 1500)
            await pg.wait_for_function("!__deck.state().busy", timeout=20_000)
            label = run["kind"] + (f" {run['through']}" if run["through"] else "")
            print(f"→ {p['into']:<13} {label:<22} {stats(d)}")
    for e in errors:
        if "GL Driver" not in e:
            print(e)
            fails.append("page error")
    print("PASS" if not fails else f"{len(fails)} FAILED")
    return 1 if fails else 0


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--html")
    ap.add_argument("--style", default="showcase")
    ap.add_argument("--gl", default="", help="force (keep shaders even when the load-time benchmark says the GPU is too slow) | off")
    a = ap.parse_args()
    raise SystemExit(asyncio.run(run(a.html, a.style, a.gl)))


if __name__ == "__main__":
    main()

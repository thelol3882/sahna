"""Diagram module checks (Playwright, Chromium) on dist-single/index.html.

  python scripts/diagram_check.py shots   [--styles academic,balanced,showcase]   → shots/<style>/*.png + shots/sheet-<style>.png
  python scripts/diagram_check.py seek                                            → forward / back / jump frames identical at labels
  python scripts/diagram_check.py text                                            → node text fits (scrollWidth ≤ clientWidth), font ≥ 18 px
  python scripts/diagram_check.py perf                                            → frame time p95 while live loops run
  python scripts/diagram_check.py all
Exit 1 on any failure. Page errors fail every mode.
"""
from __future__ import annotations

import sys as _sys
for _stream in (_sys.stdout, _sys.stderr):  # a Windows console in cp1252 must not crash on arrows or Kazakh text
    try:
        _stream.reconfigure(errors="replace")
    except Exception:
        pass
import asyncio
import json
import pathlib
import sys

from deckpage import open_deck, deck_url, deck_info, ROOT  # type: ignore

STYLES = ["academic", "balanced", "showcase"]
SHOTS = ROOT / "shots"


def sheet(paths: list[pathlib.Path], out: pathlib.Path, cols: int = 4, w: int = 640, label=True):
    from PIL import Image, ImageDraw
    h = w * 1080 // 1920
    rows = (len(paths) + cols - 1) // cols
    img = Image.new("RGB", (cols * w + (cols + 1) * 8, rows * (h + 30) + 8), (40, 40, 44))
    d = ImageDraw.Draw(img)
    for i, p in enumerate(paths):
        im = Image.open(p).convert("RGB").resize((w, h))
        x = 8 + (i % cols) * (w + 8)
        y = 8 + (i // cols) * (h + 30)
        img.paste(im, (x, y))
        if label:
            d.text((x + 4, y + h + 6), p.stem, fill=(230, 230, 230))
    img.save(out)


async def shots(styles: list[str]) -> list[str]:
    fails: list[str] = []
    for st in styles:
        errors: list[str] = []
        out = SHOTS / st
        out.mkdir(parents=True, exist_ok=True)
        async with open_deck(deck_url(None, f"style={st}"), errors) as pg:
            info = await deck_info(pg)
            await pg.evaluate("__deck.setExport(true)")
            paths = []
            for i, sid in enumerate(info["ids"]):
                for k in range(info["steps"][i] + 1):
                    await pg.evaluate(f"__deck.show({i}, {k})")
                    await pg.wait_for_timeout(250)
                    p = out / f"{i + 1:02d}-{sid}-{k}.png"
                    await pg.screenshot(path=str(p))
                    paths.append(p)
            sheet(paths, SHOTS / f"sheet-{st}.png")
        fails += [f"{st}: {e}" for e in errors]
        print(f"shots {st}: {len(paths)} frames, {len(errors)} page errors")
    return fails


async def seek() -> list[str]:
    """For every scene and step: (a) jump with __deck.show, (b) play forward with → from step 0, (c) come back with ←
    from the last step. Screenshots in export mode (live loops off) must match within a small tolerance."""
    from PIL import Image, ImageChops
    import io
    fails: list[str] = []
    errors: list[str] = []
    async with open_deck(deck_url(None, "style=balanced"), errors) as pg:
        info = await deck_info(pg)

        async def snap():
            await pg.evaluate("__deck.setExport(true)")
            await pg.wait_for_timeout(200)
            b = await pg.screenshot()
            await pg.evaluate("__deck.setExport(false)")
            await pg.wait_for_timeout(150)
            return Image.open(io.BytesIO(b)).convert("RGB")

        async def wait_rest():
            for _ in range(200):
                s = await pg.evaluate("__deck.state()")
                if s.get("waiting") or (not s.get("busy") and s.get("waiting") is None):
                    break
                await pg.wait_for_timeout(100)
            await pg.wait_for_timeout(150)

        def diff(a, b):
            d = ImageChops.difference(a, b).convert("L")
            hist = d.histogram()
            bad = sum(hist[24:])  # pixels that differ by more than ~10 %
            return bad

        for i, sid in enumerate(info["ids"]):
            n = info["steps"][i]
            jumps = []
            for k in range(n + 1):
                await pg.evaluate(f"__deck.show({i}, {k})")
                await pg.wait_for_timeout(150)
                jumps.append(await snap())
            # forward: from step 0 press → and wait each part out
            await pg.evaluate(f"__deck.show({i}, 0)")
            await pg.wait_for_timeout(200)
            fwd = [await snap()]
            for k in range(1, n + 1):
                await pg.keyboard.press("ArrowRight")
                await pg.wait_for_function(f"__deck.state().step === {k}", timeout=5000)
                await pg.wait_for_function("__deck.state().waiting === true", timeout=20000)
                await pg.wait_for_timeout(300)
                fwd.append(await snap())
            # back: from the last step press ←
            back = {n: jumps[n]}
            await pg.evaluate(f"__deck.show({i}, {n})")
            await pg.wait_for_timeout(200)
            for k in range(n - 1, -1, -1):
                await pg.keyboard.press("ArrowLeft")
                await pg.wait_for_timeout(900)
                back[k] = await snap()
            for k in range(n + 1):
                a, b, c = jumps[k], fwd[k], back[k]
                dfw, dbk = diff(a, b), diff(a, c)
                ok = dfw < 400 and dbk < 400
                print(f"seek {sid} s{k}: jump~forward {dfw} px, jump~back {dbk} px {'ok' if ok else 'FAIL'}")
                if not ok:
                    fails.append(f"seek {sid} s{k}: forward {dfw} px / back {dbk} px differ")
                    (SHOTS / "seek").mkdir(parents=True, exist_ok=True)
                    a.save(SHOTS / "seek" / f"{sid}-{k}-jump.png"); b.save(SHOTS / "seek" / f"{sid}-{k}-fwd.png"); c.save(SHOTS / "seek" / f"{sid}-{k}-back.png")
    return fails + errors


TEXT_JS = """
() => {
  const out = { overflow: [], small: [] };
  const vis = (el) => { const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false;
    for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.05) return false; } return true; };
  for (const t of document.querySelectorAll('.dg-n .dg-txt')) {
    if (!vis(t)) continue;
    for (const el of [t, ...t.children]) if (el.scrollWidth > el.clientWidth + 1) out.overflow.push(`${t.closest('.dg-n').dataset.node}: "${el.textContent}" ${el.scrollWidth}>${el.clientWidth}`);
  }
  const sel = '.dg-title, .dg-sub, .dg-gt, .dg-lb, .dg-st, .dgp-title, .dgp-eyebrow, .rt, .qg, .fn, .hud, .wf, .tk, .dg-cap';
  for (const el of document.querySelectorAll(sel)) {
    for (const node of [el, ...el.querySelectorAll('*')]) {
      if (![...node.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())) continue;
      if (!vis(node)) continue;
      const fs = parseFloat(getComputedStyle(node).fontSize);
      const k = node.getBoundingClientRect().width / (node.offsetWidth || 1);
      const eff = fs * (node.offsetWidth ? k : 1);
      if (eff < 17.5) out.small.push(`${node.textContent.trim().slice(0, 30)} ${eff.toFixed(1)}px`);
    }
  }
  return out;
}
"""


async def text() -> list[str]:
    fails: list[str] = []
    for st in STYLES:
        errors: list[str] = []
        async with open_deck(deck_url(None, f"style={st}"), errors) as pg:
            info = await deck_info(pg)
            await pg.evaluate("__deck.setExport(true)")
            for i, sid in enumerate(info["ids"]):
                for k in range(info["steps"][i] + 1):
                    await pg.evaluate(f"__deck.show({i}, {k})")
                    await pg.wait_for_timeout(120)
                    r = await pg.evaluate(TEXT_JS)
                    for o in r["overflow"]:
                        fails.append(f"{st} {sid} s{k}: overflow {o}")
                    for s in sorted(set(r["small"])):
                        fails.append(f"{st} {sid} s{k}: small text {s}")
        fails += [f"{st}: {e}" for e in errors]
    print(f"text: {len(fails)} problems")
    for f in fails[:60]:
        print("  ", f)
    return fails


PERF_JS = """
(ms) => new Promise((res) => { const d = []; let last = performance.now(); const t0 = last;
  const f = (now) => { d.push(now - last); last = now; if (now - t0 < ms) requestAnimationFrame(f); else res(d); };
  requestAnimationFrame(f); })
"""


async def perf() -> list[str]:
    fails: list[str] = []
    rows = []
    for st in STYLES:
        errors: list[str] = []
        async with open_deck(deck_url(None, f"style={st}"), errors) as pg:
            info = await deck_info(pg)
            for i, sid in enumerate(info["ids"]):
                n = info["steps"][i]
                await pg.evaluate(f"__deck.show({i}, 0)")
                await pg.wait_for_timeout(200)
                await pg.keyboard.press("ArrowRight")   # step 1 plays forward (scene timeline) ...
                a = sorted((await pg.evaluate(PERF_JS, 2500))[3:])
                await pg.wait_for_function("__deck.state().waiting === true", timeout=20000)
                b = sorted((await pg.evaluate(PERF_JS, 3000))[3:])   # ... then its live loop runs
                rows.append((st, sid, a[int(len(a) * 0.95) - 1], b[int(len(b) * 0.95) - 1], sum(b) / len(b)))
        fails += [f"{st}: {e}" for e in errors]
    for st, sid, pa, pb, avg in rows:
        print(f"perf {st:9s} {sid:9s} step p95 {pa:5.1f} ms | live loop p95 {pb:5.1f} ms avg {avg:5.1f} ms")
    return fails, rows


async def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "all"
    styles = STYLES
    if "--styles" in sys.argv:
        styles = sys.argv[sys.argv.index("--styles") + 1].split(",")
    fails: list[str] = []
    if mode in ("shots", "all"):
        fails += await shots(styles)
    if mode in ("seek", "all"):
        fails += await seek()
    if mode in ("text", "all"):
        fails += await text()
    if mode in ("perf", "all"):
        f, rows = await perf()
        fails += f
        (SHOTS).mkdir(exist_ok=True)
        (SHOTS / "perf.json").write_text(json.dumps(rows, indent=1), encoding="utf-8")
    if fails:
        print(f"\n{len(fails)} FAIL")
        for f in fails[:80]:
            print(" -", f)
        sys.exit(1)
    print("\nall ok")


if __name__ == "__main__":
    asyncio.run(main())

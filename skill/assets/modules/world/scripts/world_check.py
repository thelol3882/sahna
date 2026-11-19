"""Spatial world checks (src/world): flights, rest crispness, ←, overview, export, frame times.

    npm run build:single
    python scripts/world_check.py [--html dist-single/index.html] [--out world-shots/] [--styles showcase,balanced,academic]

Per style (?style=):
  1. flights: walk → through the deck; for every scene change the flight is paused and seeked to
     10/25/40/55/70/85 % (one contact sheet per flight) and the rest frame is kept (rest sheet).
  2. crispness (world styles): every rest frame after a flight vs the same scene shown flat (?world=off, same style)
     → mean abs diff and share of pixels off by > 8 levels; must be ~0.
  3. ← quick reverse from the ring and from the room, O overview (out, rest, back), digit jump from the overview.
  4. export: every scene via __deck.show(i, "end") + the overview "map of the talk" page.
  5. real-time walk (no pausing): frame times during flights (p50/p95; headless CPU + SwiftShader, so pessimistic)
     and the peak turn rate (deg/s) per flight vs the comfort limit.
Fails (exit 1) on page errors, a crispness diff, a wrong landing or a turn-rate breach.
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
import json
import pathlib
import statistics
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from deckpage import ROOT, deck_url, open_deck  # noqa: E402

FRACS = [0.10, 0.25, 0.40, 0.55, 0.70, 0.85]


class Check:
    def __init__(self) -> None:
        self.fails: list[str] = []
        self.notes: list[str] = []

    def ok(self, cond: bool, what: str) -> None:
        print(f"{'ok  ' if cond else 'FAIL'}  {what}")
        if not cond:
            self.fails.append(what)

    def note(self, what: str) -> None:
        print(f"      {what}")
        self.notes.append(what)


def sheet(frames: list[tuple[pathlib.Path, str]], path: pathlib.Path, cols: int = 4, tw: int = 480) -> None:
    if not frames:
        return
    th, pad = tw * 9 // 16, 30
    rows = (len(frames) + cols - 1) // cols
    img = Image.new("RGB", (cols * tw, rows * (th + pad)), "white")
    d = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("DejaVuSans.ttf", 15)
    except OSError:
        font = ImageFont.load_default()
    for n, (p, label) in enumerate(frames):
        x, y = (n % cols) * tw, (n // cols) * (th + pad)
        img.paste(Image.open(p).convert("RGB").resize((tw, th)), (x, y))
        d.text((x + 6, y + th + 6), label, fill="black", font=font)
    img.save(path)


def diff(a: pathlib.Path, b: pathlib.Path) -> tuple[float, float]:
    x = np.asarray(Image.open(a).convert("RGB"), dtype=np.int16)
    y = np.asarray(Image.open(b).convert("RGB"), dtype=np.int16)
    dd = np.abs(x - y).max(axis=2)
    return float(dd.mean()), float((dd > 8).mean() * 100)


async def st(pg) -> dict:
    return await pg.evaluate("({...__deck.state(), world: __deck.world()})")


async def wait_rest(pg, timeout: int = 30_000) -> bool:
    try:
        await pg.wait_for_function("__deck.state().waiting && !__deck.state().busy && !(window.__world && __world.flight)", timeout=timeout)
        await pg.wait_for_timeout(150)
        return True
    except Exception:
        return False


async def shoot(pg, path: pathlib.Path) -> pathlib.Path:
    await pg.screenshot(path=str(path))
    return path


async def paused_flight(pg, out: pathlib.Path, tag: str, key: str) -> list[tuple[pathlib.Path, str]]:
    """Press a key, pause the flight it starts, seek it to FRACS, screenshot; then let it finish."""
    await pg.keyboard.press(key)
    has = await pg.evaluate("""() => new Promise((res) => { let n = 0; const f = () => {
        if (window.__world && __world.flight) { __world.flight.pause(); res(true); }
        else if (++n > 20) res(false); else requestAnimationFrame(f); }; f(); })""")
    frames: list[tuple[pathlib.Path, str]] = []
    if has:
        for f in FRACS:
            await pg.evaluate(f"void (__world.flight && __world.flight.progress({f}))")
            await pg.wait_for_timeout(140)
            frames.append((await shoot(pg, out / f"{tag}-{int(f * 100):02d}.png"), f"{tag} {int(f * 100)}%"))
        await pg.evaluate("void (__world.flight && __world.flight.progress(1))")
    else:  # no world flight (academic or a fade): real-time frames
        for ms in (120, 250, 400, 600):
            await pg.wait_for_timeout(ms - (0 if ms == 120 else [120, 250, 400, 600][[120, 250, 400, 600].index(ms) - 1]))
            frames.append((await shoot(pg, out / f"{tag}-{ms}ms.png"), f"{tag} {ms} ms"))
    return frames


async def run_style(html: str | None, style: str, out: pathlib.Path, c: Check) -> dict:
    out.mkdir(parents=True, exist_ok=True)
    errors: list[str] = []
    result: dict = {"style": style}
    world_on = style != "academic"

    # ---------------------------------------------------------------- 1+2: paused flights, rest frames
    rest: dict[int, pathlib.Path] = {}
    flights: list[list[tuple[pathlib.Path, str]]] = []
    url = deck_url(html, f"style={style}")
    async with open_deck(url, errors) as pg:
        info = await pg.evaluate("({ids: __deck.ids, main: __deck.order.filter(i => !__deck.appendix[i]), steps: __deck.steps,"
                                 " backup: __deck.order.filter(i => __deck.appendix[i]).map(i => __deck.titles[i])})")
        ids, main = info["ids"], info["main"]
        # the opening shot (already running): pause + seek
        if world_on:
            got = await pg.evaluate("window.__world && __world.flight ? (__world.flight.pause(), true) : false")
            fr = []
            c.ok(got, f"[{style}] opening shot is running after ready()")
            for f in FRACS if got else []:
                await pg.evaluate(f"void (__world.flight && __world.flight.progress({f}))")
                await pg.wait_for_timeout(140)
                fr.append((await shoot(pg, out / f"f00-intro-{int(f * 100):02d}.png"), f"intro {int(f * 100)}%"))
            await pg.evaluate("void (__world.flight && __world.flight.progress(1))")
            flights.append(fr)
        c.ok(await wait_rest(pg), f"[{style}] cover at rest")
        rest[main[0]] = await shoot(pg, out / f"rest-{ids[main[0]]}.png")
        n = 0
        while True:
            s = await st(pg)
            i = s["index"]
            if s["step"] < info["steps"][i]:
                await pg.keyboard.press("ArrowRight")
                c.ok(await wait_rest(pg), f"[{style}] {ids[i]} step {s['step'] + 1}")
                continue
            if main.index(i) == len(main) - 1:
                break
            n += 1
            nxt = main[main.index(i) + 1]
            fr = await paused_flight(pg, out, f"f{n:02d}-{ids[i]}-{ids[nxt]}", "ArrowRight")
            flights.append(fr)
            c.ok(await wait_rest(pg), f"[{style}] landed on {ids[nxt]}")
            s2 = await st(pg)
            c.ok(s2["index"] == nxt and s2["step"] == 0, f"[{style}] index {s2['index']} step {s2['step']} == {nxt} 0")
            if world_on:
                c.ok(s2["world"]["settled"] == ids[nxt], f"[{style}] world settled on {ids[nxt]}")
                tr = await pg.evaluate(f"getComputedStyle(document.querySelector('[data-wpanel=\"{ids[nxt]}\"]')).transform")
                c.ok(tr == "none", f"[{style}] {ids[nxt]} panel has no transform at rest ({tr})")
            await pg.evaluate("__deck.setExport(true)")
            await pg.wait_for_timeout(250)
            rest[nxt] = await shoot(pg, out / f"rest-{ids[nxt]}.png")
            await pg.evaluate("__deck.setExport(false)")
            await pg.wait_for_timeout(100)

        # ---------------------------------------------------------------- 3: ←, overview, digit jump
        extra: list[tuple[pathlib.Path, str]] = []
        idx = {sid: k for k, sid in enumerate(ids)}
        for sid in ("risk", "inside"):
            if sid not in idx:
                continue
            await pg.evaluate(f"__deck.show({idx[sid]}, 0)")
            await pg.wait_for_timeout(300)
            fr = await paused_flight(pg, out, f"back-{sid}", "ArrowLeft")
            flights.append(fr)
            ok = await wait_rest(pg)
            s = await st(pg)
            prev = main[main.index(idx[sid]) - 1]
            c.ok(ok and s["index"] == prev and s["step"] == info["steps"][prev], f"[{style}] ← from {sid} lands on {ids[prev]} at its last step")
            extra.append((await shoot(pg, out / f"back-{sid}-rest.png"), f"← {sid} → {ids[prev]} rest"))
        # overview from the ledger
        if "ledger" in idx:
            await pg.evaluate(f"__deck.show({idx['ledger']}, 'end')")
            await pg.wait_for_timeout(300)
            fr = await paused_flight(pg, out, "overview-out", "KeyO")
            flights.append(fr)
            await pg.wait_for_timeout(400)
            s = await st(pg)
            c.ok(not world_on or s["world"]["overview"], f"[{style}] O opens the overview")
            extra.append((await shoot(pg, out / "overview-rest.png"), "overview at rest"))
            if world_on:
                # label size on screen
                fs = await pg.evaluate("Math.min(...[...document.querySelectorAll('.hud-label .hud-t')].map(e => parseFloat(getComputedStyle(e).fontSize) * document.querySelector('.world').getBoundingClientRect().width / 1920))")
                c.ok(fs >= 18, f"[{style}] overview labels {fs:.1f} px on screen (≥ 18)")
                fr = await paused_flight(pg, out, "overview-back", "Escape")
                flights.append(fr)
                ok = await wait_rest(pg)
                s = await st(pg)
                c.ok(ok and s["index"] == idx["ledger"] and not s["world"]["overview"], f"[{style}] Esc returns from the overview to the ledger")
                # O, then digit 2 flies to scene 2
                await pg.keyboard.press("KeyO")
                await pg.wait_for_function("!__world.flight", timeout=15000)
                await pg.keyboard.press("Digit2")
                ok = await wait_rest(pg)
                s = await st(pg)
                c.ok(ok and s["index"] == main[1], f"[{style}] overview + 2 flies to {ids[main[1]]}")
                # → during a flight is ignored
                await pg.keyboard.press("ArrowRight")
                await pg.wait_for_timeout(200)
                await pg.keyboard.press("ArrowRight")
                s = await st(pg)
                c.ok(s["index"] in main[1:3], f"[{style}] a press during a flight does not skip a scene")
                await wait_rest(pg)
        # backup slide and return (flat fade over the world); decks with fewer scenes use their last main scene,
        # and the search types the first word of the first backup slide's title (as walk.py does)
        here = main[min(3, len(main) - 1)]
        if info["backup"]:
            await pg.evaluate(f"__deck.show({here}, 0)")
            await pg.wait_for_timeout(300)
            await pg.keyboard.press("Slash")
            await pg.keyboard.type((info["backup"][0].split() or ["x"])[0].lower()[:4])
            await pg.keyboard.press("Enter")
            await pg.wait_for_timeout(900)
            extra.append((await shoot(pg, out / "backup.png"), "backup slide (flat fade)"))
            await pg.keyboard.press("Escape")
            ok = await wait_rest(pg)
            s = await st(pg)
            c.ok(ok and s["index"] == here, f"[{style}] Esc from the backup returns to {ids[here]}")
            extra.append((await shoot(pg, out / "backup-return.png"), "after Esc"))
        sheet(extra, out / "sheet-extra.png", cols=3)
    for k, fr in enumerate(flights):
        sheet(fr, out / f"sheet-flight-{k:02d}.png", cols=6, tw=400)
    sheet([(p, ids[i]) for i, p in sorted(rest.items(), key=lambda x: main.index(x[0]))], out / "sheet-rest.png", cols=4)
    c.ok(not errors, f"[{style}] no page errors ({len(errors)})")
    for e in errors[:8]:
        c.note(e)

    # ---------------------------------------------------------------- 2: crispness vs flat
    if world_on:
        flat_dir = out / "flat"
        flat_dir.mkdir(exist_ok=True)
        rows = []
        async with open_deck(deck_url(html, f"style={style}&world=off"), errors) as pg:
            await pg.evaluate("__deck.setExport(true)")
            for i, p in rest.items():
                if i == main[0]:
                    continue  # the cover rest frame was taken with step bars
                await pg.evaluate(f"__deck.show({i}, 0)")
                await pg.wait_for_timeout(400)
                q = await shoot(pg, flat_dir / f"{ids[i]}.png")
                m, share = diff(p, q)
                rows.append((ids[i], m, share))
                c.ok(m < 0.05 and share < 0.01, f"[{style}] crisp at rest: {ids[i]} mean diff {m:.4f}, {share:.4f} % px > 8")
        result["crisp"] = rows

    # ---------------------------------------------------------------- 4: export pages incl. the overview
    async with open_deck(deck_url(html, f"style={style}"), errors) as pg:
        await pg.evaluate("__deck.setExport(true)")
        exp = out / "export"
        exp.mkdir(exist_ok=True)
        pages = []
        order = await pg.evaluate("__deck.order")
        for i in order:
            await pg.evaluate(f"__deck.show({i}, 'end')")
            await pg.wait_for_timeout(350)
            pages.append((await shoot(pg, exp / f"{len(pages):02d}-{ids[i]}.png"), ids[i]))
        has = await pg.evaluate("__deck.hasOverview && __deck.hasOverview()")
        if has:
            await pg.evaluate(f"__deck.show({main[-1]}, 'end')")
            await pg.evaluate("__deck.overview(true)")
            await pg.wait_for_timeout(500)
            pages.append((await shoot(pg, exp / f"{len(pages):02d}-map.png"), "map of the talk"))
            await pg.evaluate("__deck.overview(false)")
        c.ok(has == world_on, f"[{style}] export overview page {'present' if has else 'absent'}")
        sheet(pages, out / "sheet-export.png", cols=4)

    # ---------------------------------------------------------------- 5: real-time walk: frame times, turn rate
    if world_on:
        async with open_deck(deck_url(html, f"style={style}"), errors) as pg:
            await wait_rest(pg)
            while True:
                s = await st(pg)
                if s["index"] == main[-1]:
                    break
                await pg.keyboard.press("ArrowRight")
                if not await wait_rest(pg):
                    break
            await pg.keyboard.press("KeyO")
            await pg.wait_for_function("!__world.flight", timeout=15000)
            await pg.keyboard.press("Escape")
            await wait_rest(pg)
            stats = await pg.evaluate("__world.stats.map(f => ({name: f.name, duration: f.duration, peakTurn: f.peakTurn, frames: f.frames}))")
            limit = await pg.evaluate("__world.comfort.maxTurn")
        allf = [x for f in stats for x in f["frames"][1:]]
        p50 = statistics.median(allf) if allf else 0
        p95 = float(np.percentile(allf, 95)) if allf else 0
        result["frames"] = {"n": len(allf), "p50": p50, "p95": p95}
        c.note(f"[{style}] flight frame time p50 {p50:.1f} ms, p95 {p95:.1f} ms over {len(allf)} frames (headless SwiftShader)")
        result["flights"] = [{"name": f["name"], "duration": round(f["duration"], 2), "peakTurn": round(f["peakTurn"], 1)} for f in stats]
        for f in stats:
            c.ok(f["peakTurn"] <= limit * 1.15 + 1, f"[{style}] {f['name']}: {f['duration']:.2f} s, peak turn {f['peakTurn']:.0f}°/s (limit {limit})")
    return result


async def main_async(a) -> int:
    out = pathlib.Path(a.out)
    c = Check()
    results = []
    for style in a.styles.split(","):
        results.append(await run_style(a.html, style, out / style, c))
    (out / "results.json").write_text(json.dumps(results, indent=1), encoding="utf-8")
    print(f"\n{len(c.fails)} failure(s)")
    for f in c.fails:
        print("  FAIL", f)
    return 1 if c.fails else 0


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--html")
    ap.add_argument("--out", default=str(ROOT / "world-shots"))
    ap.add_argument("--styles", default="showcase,balanced,academic")
    raise SystemExit(asyncio.run(main_async(ap.parse_args())))


if __name__ == "__main__":
    main()

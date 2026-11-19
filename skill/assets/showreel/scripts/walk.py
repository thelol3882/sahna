"""Walk the deck like a presenter and check the input rules (SKILL §11).

    python scripts/walk.py [--html dist-single/index.html] [--out walk/]

1. A press during the cover entrance is ignored; Shift+→ finishes it; a stage click and the wheel do not advance.
2. → through every main scene, waiting for the waiting cue between presses; frames at 250/500/750 ms after each
   press and at the cue go to walk/contact.png. The last main scene never runs into the backup slides.
3. Presenting tools and backup slides: B + → lifts the black screen without moving; D draws, Backspace undoes,
   Esc leaves; / opens the palette, Enter jumps to a backup slide, Esc returns to the same scene AND step.
4. In a ?remote link N does not show the notes.
Fails (exit 1) on any page error or broken rule.
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
from deckpage import ROOT, deck_info, deck_url, open_deck, state  # noqa: E402


class Walk:
    def __init__(self) -> None:
        self.fails: list[str] = []
        self.frames: list[tuple[pathlib.Path, str]] = []

    def check(self, ok: bool, what: str) -> None:
        print(f"{'ok  ' if ok else 'FAIL'}  {what}")
        if not ok:
            self.fails.append(what)


async def wait_cue(pg, timeout: int = 20_000) -> bool:
    try:
        await pg.wait_for_function("__deck.state().waiting && !__deck.state().busy", timeout=timeout)
        return True
    except Exception:
        return False


async def frame(pg, w: Walk, out: pathlib.Path, label: str) -> None:
    path = out / f"{len(w.frames):03d}.png"
    await pg.screenshot(path=str(path))
    w.frames.append((path, label))


def contact_sheet(frames: list[tuple[pathlib.Path, str]], path: pathlib.Path, cols: int = 4) -> None:
    if not frames:
        return
    tw, th, pad = 480, 270, 28
    rows = (len(frames) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * tw, rows * (th + pad)), "white")
    draw = ImageDraw.Draw(sheet)
    for n, (p, label) in enumerate(frames):
        x, y = (n % cols) * tw, (n // cols) * (th + pad)
        sheet.paste(Image.open(p).convert("RGB").resize((tw, th)), (x, y))
        draw.text((x + 6, y + th + 6), label, fill="black")
    sheet.save(path)


async def run(target: str | None, out: pathlib.Path) -> int:
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob("*.png"):
        old.unlink()
    w = Walk()
    errors: list[str] = []
    async with open_deck(deck_url(target), errors) as pg:
        info = await deck_info(pg)
        main = [i for i in info["order"] if not info["appendix"][i]]
        appx = [i for i in info["order"] if info["appendix"][i]]

        # 1. input rules during the first entrance
        s0 = await state(pg)
        w.check(not s0["waiting"], "the cover entrance is running after load")
        await pg.keyboard.press("ArrowRight")
        await pg.wait_for_timeout(200)
        s1 = await state(pg)
        w.check((s1["index"], s1["step"], s1["waiting"]) == (s0["index"], s0["step"], False), "→ during the entrance is ignored")
        await pg.mouse.click(960, 540)
        await pg.wait_for_timeout(200)
        s2 = await state(pg)
        w.check((s2["index"], s2["step"]) == (s0["index"], s0["step"]), "a click on the stage does not advance")
        await pg.keyboard.press("Shift+ArrowRight")
        await pg.wait_for_timeout(700)
        s3 = await state(pg)
        w.check(s3["waiting"] and s3["index"] == s0["index"], "Shift+→ finishes the entrance without leaving the scene")
        await pg.mouse.wheel(0, 600)
        await pg.wait_for_timeout(400)
        s4 = await state(pg)
        w.check((s4["index"], s4["step"]) == (s0["index"], s0["step"]), "the mouse wheel does not step (DECK.wheel off)")
        await frame(pg, w, out, f"{info['ids'][s0['index']]} s{s0['step']} cue")

        # 2. walk with → until the end of the main flow
        for _ in range(sum(info["steps"][i] + 1 for i in main) + 2):
            before = await state(pg)
            await pg.keyboard.press("ArrowRight")
            for ms in (250, 250, 250):
                await pg.wait_for_timeout(ms)
                st = await state(pg)
                await frame(pg, w, out, f"{info['ids'][st['index']]} s{st['step']} +{ms}")
            after = await state(pg)
            if (after["index"], after["step"]) == (before["index"], before["step"]):
                break
            w.check(await wait_cue(pg), f"waiting cue on {info['ids'][after['index']]} step {after['step']}")
            await frame(pg, w, out, f"{info['ids'][after['index']]} s{after['step']} cue")
        end = await state(pg)
        w.check(end["index"] == main[-1] and end["step"] == info["steps"][main[-1]], "reached the last step of the last main scene")
        w.check(not info["appendix"][end["index"]], "→ after the last main scene does not enter the backup slides")

        # 3. presenting tools
        await pg.keyboard.press("b")
        w.check((await state(pg))["blank"] == "black", "B shows the black screen")
        await pg.keyboard.press("ArrowLeft")
        st = await state(pg)
        w.check(st["blank"] == "" and (st["index"], st["step"]) == (end["index"], end["step"]), "a nav key lifts the black screen without moving")
        await pg.keyboard.press("d")
        await pg.mouse.move(600, 600)
        await pg.mouse.down()
        for x in range(600, 1100, 25):
            await pg.mouse.move(x, 600 + (x - 600) // 5)
        await pg.mouse.up()
        st = await state(pg)
        w.check(st["drawing"] and st["strokes"] == 1, "D draws a stroke")
        await frame(pg, w, out, "draw")
        await pg.keyboard.press("Backspace")
        st = await state(pg)
        w.check(st["strokes"] == 0 and st["index"] == end["index"], "Backspace undoes the stroke (and does not go back)")
        await pg.keyboard.press("Escape")
        w.check(not (await state(pg))["drawing"], "Esc leaves draw mode")
        await pg.keyboard.down("x")
        w.check((await state(pg))["laser"], "holding X shows the laser")
        await pg.keyboard.up("x")
        w.check(not (await state(pg))["laser"], "releasing X hides the laser")

        # 4. backup slides: go back one step first, so the return target is not trivial
        await pg.keyboard.press("ArrowLeft")
        await wait_cue(pg)
        here = await state(pg)
        if appx:
            await pg.keyboard.press("Slash")
            w.check((await state(pg))["palette"], "/ opens the search palette")
            first_tag = (info["titles"][appx[0]].split() or ["x"])[0]
            await pg.keyboard.type(first_tag.lower()[:4])
            await frame(pg, w, out, "palette")
            await pg.keyboard.press("Enter")
            await pg.wait_for_timeout(200)
            st = await state(pg)
            w.check(info["appendix"][st["index"]], "Enter jumps to a backup slide")
            w.check(st["returnTo"] == {"index": here["index"], "step": here["step"]}, "the return point is the scene and step we left")
            await wait_cue(pg)
            await frame(pg, w, out, f"backup {info['ids'][st['index']]}")
            await pg.keyboard.press("ArrowRight")
            await pg.wait_for_timeout(300)
            w.check(info["appendix"][(await state(pg))["index"]], "→ on a backup slide does not run on into the main flow")
            await pg.keyboard.press("Escape")
            await pg.wait_for_timeout(600)
            st = await state(pg)
            w.check((st["index"], st["step"]) == (here["index"], here["step"]) and st["returnTo"] is None, "Esc returns to the same scene and step")
            await frame(pg, w, out, "returned")
        else:
            print("skip  no backup slides")

    # 5. recording link: N never shows the notes
    async with open_deck(deck_url(target, "remote"), errors) as pg:
        await pg.keyboard.press("n")
        w.check(not (await state(pg))["notes"], "N does nothing in a ?remote link")

    contact_sheet(w.frames, out / "contact.png")
    print(f"contact sheet: {out / 'contact.png'} ({len(w.frames)} frames)")
    for e in errors:
        print(e)
    if errors:
        w.fails.append("page errors")
    print("PASS" if not w.fails else f"{len(w.fails)} FAILED")
    return 1 if w.fails else 0


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--html")
    ap.add_argument("--out", default=str(ROOT / "walk"))
    a = ap.parse_args()
    raise SystemExit(asyncio.run(run(a.html, pathlib.Path(a.out))))


if __name__ == "__main__":
    main()

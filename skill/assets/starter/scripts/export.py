"""PDF + PPTX export of the deck (SKILL §10).

    npm run build:single
    python scripts/export.py                       # → export/deck.pdf, export/deck.pptx, export/png/
    python scripts/export.py --two-page results,quiz --name my-talk --theme dark
    python scripts/export.py --formats pdf          # only the PDF (default: pdf,pptx)

Every main scene at its end state (two pages: start and end for TWO_PAGE scenes), then an
"Appendix" divider and the backup slides. PPTX slides are full-bleed images with the speaker notes
(`[→ k]` marks the k-th press). Needs: playwright, img2pdf, python-pptx.
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
from deckpage import ROOT, deck_info, deck_url, open_deck, show  # noqa: E402

# scenes that get a start page and an end page (question → answer, scroll scenes); meta `twoPage: true` adds to it
TWO_PAGE_SCENES: set[str] = set()


def notes_text(notes: list[str], upto: int | None = None) -> str:
    parts = notes if upto is None else notes[: upto + 1]
    return "\n".join(n if k == 0 else f"[→ {k}] {n}" for k, n in enumerate(parts))


async def capture(url: str, out: pathlib.Path, two_page: set[str]) -> list[tuple[pathlib.Path, str]]:
    errors: list[str] = []
    pages: list[tuple[pathlib.Path, str]] = []
    png = out / "png"
    png.mkdir(parents=True, exist_ok=True)
    for old in png.glob("*.png"):
        old.unlink()
    async with open_deck(url, errors) as pg:
        info = await deck_info(pg)
        await pg.evaluate("__deck.setExport(true)")
        n = 0
        has_map = await pg.evaluate("!!(__deck.hasOverview && __deck.hasOverview())")
        map_done = not has_map

        async def map_page() -> None:
            # spatial world: one "map of the talk" page (the overview with every scene labelled)
            nonlocal n
            main_last = [j for j in info["order"] if not info["appendix"][j]][-1]
            await show(pg, main_last, "end")
            await pg.evaluate("void __deck.overview(true)")
            await pg.wait_for_timeout(500)
            n += 1
            path = png / f"{n:03d}-map.png"
            await pg.screenshot(path=str(path))
            pages.append((path, "Map of the talk: every scene in the world."))
            await pg.evaluate("void __deck.overview(false)")

        for i in info["order"]:
            sid = info["ids"][i]
            if not map_done and info["appendix"][i]:
                await map_page()
                map_done = True
            if info["appendix"][i] and not any(info["appendix"][j] for j in info["order"][: info["order"].index(i)]):
                await show(pg, i, "end")
                await pg.evaluate("__deck.divider(true)")
                await pg.wait_for_timeout(300)
                n += 1
                path = png / f"{n:03d}-appendix.png"
                await pg.screenshot(path=str(path))
                pages.append((path, "Appendix: backup slides for questions."))
            frames: list[int | str] = [0, "end"] if (sid in two_page or info["twoPage"][i]) else ["end"]
            for k in frames:
                await show(pg, i, k)
                n += 1
                path = png / f"{n:03d}-{sid}{'-start' if k == 0 and len(frames) > 1 else ''}.png"
                await pg.screenshot(path=str(path))
                notes = info["notes"][i]
                pages.append((path, notes_text(notes, 0 if k == 0 and len(frames) > 1 else None)))
        if not map_done:
            await map_page()
    if errors:
        print("Page errors during export:\n  " + "\n  ".join(errors), file=sys.stderr)
        raise SystemExit(1)
    return pages


def write_pdf(pages: list[tuple[pathlib.Path, str]], path: pathlib.Path) -> None:
    import img2pdf
    path.write_bytes(img2pdf.convert([str(p) for p, _ in pages]))


def write_pptx(pages: list[tuple[pathlib.Path, str]], path: pathlib.Path) -> None:
    from pptx import Presentation
    from pptx.util import Emu
    prs = Presentation()
    prs.slide_width, prs.slide_height = Emu(12192000), Emu(6858000)  # 16:9
    blank = prs.slide_layouts[6]
    for img, notes in pages:
        slide = prs.slides.add_slide(blank)
        slide.shapes.add_picture(str(img), 0, 0, prs.slide_width, prs.slide_height)
        slide.notes_slide.notes_text_frame.text = notes
    prs.save(str(path))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--html", help="deck file or URL (default dist-single/index.html)")
    ap.add_argument("--out", default=str(ROOT / "export"))
    ap.add_argument("--name", default="deck")
    ap.add_argument("--two-page", default="", help="comma-separated scene ids with a start and an end page")
    ap.add_argument("--theme", choices=["light", "dark"], default="light")
    ap.add_argument("--formats", default="pdf,pptx", help="comma list of pdf, pptx (default both)")
    a = ap.parse_args()
    formats = {f.strip() for f in a.formats.split(",") if f.strip()}
    if not formats or formats - {"pdf", "pptx"}:
        ap.error("--formats takes pdf, pptx or pdf,pptx")
    out = pathlib.Path(a.out)
    two = TWO_PAGE_SCENES | {s for s in a.two_page.split(",") if s}
    url = deck_url(a.html, "theme=dark" if a.theme == "dark" else "")
    pages = asyncio.run(capture(url, out, two))
    files = []
    if "pdf" in formats:
        write_pdf(pages, out / f"{a.name}.pdf")
        files.append(out / f"{a.name}.pdf")
    if "pptx" in formats:
        write_pptx(pages, out / f"{a.name}.pptx")
        files.append(out / f"{a.name}.pptx")
    print(f"{len(pages)} pages → {' and '.join(str(f) for f in files)}")
    if "pptx" in formats:
        print("Note: PPTX slides are images (good for viewing and presenting, not editable text).")


if __name__ == "__main__":
    main()

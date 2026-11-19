"""Drive deck + presenter with ?rehearse: S, walk through, S, V report; export localStorage runs to JSON."""
import sys as _sys
for _stream in (_sys.stdout, _sys.stderr):  # a Windows console in cp1252 must not crash on arrows or Kazakh text
    try:
        _stream.reconfigure(errors="replace")
    except Exception:
        pass
import asyncio, json, sys, pathlib
from playwright.async_api import async_playwright
URL = sys.argv[1]; OUT = pathlib.Path(sys.argv[2]); OUT.mkdir(parents=True, exist_ok=True)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 1920, "height": 1080})
        deck = await ctx.new_page()
        errs = []
        deck.on("pageerror", lambda e: errs.append(str(e)))
        await deck.goto(URL + "?rehearse")
        await deck.wait_for_function("window.__deck && __deck.ready()")
        pres = await ctx.new_page()
        pres.on("pageerror", lambda e: errs.append(str(e)))
        await pres.set_viewport_size({"width": 1600, "height": 1000})
        await pres.goto(URL + "?rehearse#presenter")
        await pres.wait_for_selector("[data-rehearsal]")
        await pres.wait_for_timeout(500)
        await pres.keyboard.press("s")
        for n in range(6):
            await deck.wait_for_function("__deck.state().waiting && !__deck.state().busy", timeout=20000)
            await deck.wait_for_timeout(1200 + 400 * n)
            await deck.keyboard.press("ArrowRight")
        await deck.wait_for_timeout(1500)
        await pres.screenshot(path=str(OUT / "presenter-rec.png"))
        # audience screen must show nothing of it
        aud = await deck.evaluate("document.body.innerText.includes('REHEARSAL') || !!document.querySelector('[data-rehearsal]')")
        await pres.keyboard.press("s")
        await pres.keyboard.press("v")
        await pres.wait_for_selector("[data-rehearsal-report]")
        await pres.wait_for_timeout(300)
        await pres.screenshot(path=str(OUT / "presenter-report.png"))
        data = await pres.evaluate("""() => { const k = Object.keys(localStorage).find(k => k.startsWith('awd-rehearsals:'));
          return { key: k, runs: JSON.parse(localStorage.getItem(k) || '[]') }; }""")
        # build the same export the button makes
        exp = await pres.evaluate("""() => { return null }""")
        print("runs:", len(data["runs"]), "segs:", [ (g["id"], g["step"], g["ready"] is not None) for g in data["runs"][-1]["segs"]])
        print("audience shows rehearsal UI:", aud, "errors:", errs)
        (OUT / "runs.json").write_text(json.dumps(data["runs"]), encoding="utf-8")
        # click Export JSON and capture the download
        async with pres.expect_download() as dl:
            await pres.click("text=Export JSON")
        d = await dl.value
        await d.save_as(str(OUT / "export.json"))
        await b.close()
        sys.exit(1 if aud or errs or not data["runs"] else 0)
asyncio.run(main())

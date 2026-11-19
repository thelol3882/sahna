"""
Drives the video-scene test deck (scratch project, dist-single/index.html opened from file://) with Playwright.

Expects the test deck order: 0 start (has .vt-card) · 1 vcard (card intro, outro at 17.2) · 2 vmorph (morph intro,
target 560,280 160x160 in a 1280x720 video, outro at 17.5) · 3 vmissing (src does not exist, fade intro) · 4 finish.
Video = tools/make-test-video.sh (chapters 0/2/6/10/14/17).

usage: python3 -I tests/drive.py /abs/path/dist-single/index.html /abs/out/dir [starter|ref]
  starter (default): the animated-web-deck starter engine (channel "animated-web-deck", {id, m, from} envelopes)
  ref: the older single-file engine (channel "legacy-deck", bare messages) with the test __deck shim
Writes frames + contact sheets to the out dir and prints PASS/FAIL lines.
"""
import sys as _sys
for _stream in (_sys.stdout, _sys.stderr):  # a Windows console in cp1252 must not crash on arrows or Kazakh text
    try:
        _stream.reconfigure(errors="replace")
    except Exception:
        pass
import asyncio, json, sys, os
from playwright.async_api import async_playwright
from PIL import Image

HTML, OUT = sys.argv[1], sys.argv[2]
ENGINE = sys.argv[3] if len(sys.argv) > 3 else "starter"
os.makedirs(OUT, exist_ok=True)
URL = "file://" + HTML
results = []

def check(name, ok, info=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{info}]" if info else ""), flush=True)

def sheet(paths, out, cols=4, w=480):
    ims = [Image.open(p).convert("RGB") for p in paths]
    h = int(w * 9 / 16)
    rows = (len(ims) + cols - 1) // cols
    s = Image.new("RGB", (cols * w, rows * h), "white")
    for k, im in enumerate(ims):
        s.paste(im.resize((w, h)), ((k % cols) * w, (k // cols) * h))
    s.save(out)

# a second BroadcastChannel in the page sees what the deck sends to the presenter / remote
INIT = {
  # the starter wraps messages ({id, m, from}); commands are taken from a "presenter" window
  "starter": """
window.__states = [];
try { const bc = new BroadcastChannel('animated-web-deck'); let n = 0;
      bc.onmessage = (e) => { const m = e.data && e.data.m; if (m && m.type === 'state') window.__states.push(m.state); };
      window.__cmd = (cmd, extra) => bc.postMessage({ id: 'test-' + (++n) + '-' + Math.random(), from: 'presenter', m: Object.assign({ type: 'cmd', cmd }, extra || {}) }); } catch (e) {}
""",
  "ref": """
window.__states = [];
try { const bc = new BroadcastChannel('legacy-deck'); bc.onmessage = (e) => { if (e.data && e.data.type === 'state') window.__states.push(e.data.state); };
      window.__cmd = (cmd, extra) => bc.postMessage(Object.assign({ type: 'cmd', cmd }, extra || {})); } catch (e) {}
"""}[ENGINE]

VID = """(k) => { const s = document.querySelectorAll('.stage > .scene')[k]; const v = s && s.querySelector('video');
  return v ? { t: v.currentTime, paused: v.paused, muted: v.muted, vol: v.volume, ended: v.ended, err: !!v.error } : null; }"""
TOAST = "(k) => { const e = document.querySelectorAll('.stage > .scene')[k].querySelector('.vs-toast'); return e ? e.textContent : ''; }"
POS = "() => (__deck.pos ? __deck.pos() : __deck.state())"
MEDIA = "() => { const s = window.__states.filter(x => 'media' in x); return s.length ? s[s.length - 1].media : undefined; }"

async def frames(pg, name, times_ms, t0=None):
    """screenshots at the given ms after t0 (a monotonic ms from the page); returns paths"""
    paths = []
    start = t0 if t0 is not None else await pg.evaluate("performance.now()")
    for ms in times_ms:
        now = await pg.evaluate("performance.now()")
        if start + ms > now:
            await pg.wait_for_timeout(start + ms - now)
        p = f"{OUT}/{name}-{ms:05d}.png"
        await pg.screenshot(path=p)
        paths.append(p)
    sheet(paths, f"{OUT}/sheet-{name}.png")
    return paths

async def wait_for(pg, js, arg=None, timeout=15000):
    await pg.wait_for_function(js, arg=arg, timeout=timeout)

async def main_run(p):
    b = await p.chromium.launch()
    ctx = await b.new_context(viewport={"width": 1920, "height": 1080})
    await ctx.add_init_script(INIT)
    pg = await ctx.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    await pg.goto(URL + "#start")
    await wait_for(pg, "() => window.__deck && window.__deck.ready()")
    await pg.wait_for_timeout(1500)

    # --- card intro
    t0 = await pg.evaluate("performance.now()")
    await pg.keyboard.press("ArrowRight")
    await frames(pg, "card-intro", [150, 400, 700, 1100, 1600], t0)
    await wait_for(pg, f"() => ({VID})(1) && !({VID})(1).paused")
    v = await pg.evaluate(VID, 1)
    check("card: video plays after the intro, from startAt", not v["paused"] and v["t"] >= 2.1, json.dumps(v))
    check("card: audio not muted (key press = gesture)", not v["muted"], json.dumps(v))
    await pg.wait_for_timeout(1800)
    v = await pg.evaluate(VID, 1)
    check("card: music faded in", v["vol"] > 0.8, f"vol={v['vol']:.2f}")

    # --- chapters
    await pg.keyboard.press("l")
    await pg.wait_for_timeout(400)
    v = await pg.evaluate(VID, 1)
    check("L jumps to the next chapter (6 s)", 6 <= v["t"] < 7, f"t={v['t']:.2f}")
    await pg.keyboard.press("l")
    await pg.wait_for_timeout(300)
    await pg.keyboard.press("j")
    await pg.wait_for_timeout(300)
    v = await pg.evaluate(VID, 1)
    check("L then J: back to the previous chapter (6 s)", 6 <= v["t"] < 7, f"t={v['t']:.2f}")
    await pg.wait_for_timeout(2600)  # > 2 s into the chapter
    await pg.keyboard.press("ArrowLeft")
    await pg.wait_for_timeout(300)
    v = await pg.evaluate(VID, 1)
    check("Back after 2 s: restart of the same chapter (6 s)", 6 <= v["t"] < 7, f"t={v['t']:.2f}")
    check("Back did not leave the scene", (await pg.evaluate(POS))["index"] == 1)
    await pg.mouse.move(900, 900)
    await pg.mouse.move(960, 1000)
    await pg.wait_for_timeout(450)
    await pg.screenshot(path=f"{OUT}/hud.png")
    m = await pg.evaluate(MEDIA)
    check("media state reported (playing, chapter)", m and m["playing"] and m["chapter"] == "Green" and abs(m["dur"] - 20) < 0.2, json.dumps(m))

    # --- remote commands (as the phone / presenter sends them)
    await pg.evaluate("__cmd('media-toggle')")
    await pg.wait_for_timeout(600)
    v = await pg.evaluate(VID, 1)
    check("media-toggle from the remote pauses", v["paused"])
    await pg.screenshot(path=f"{OUT}/paused.png")
    await pg.evaluate("__cmd('media-seek', { t: 10.5 })")
    await pg.wait_for_timeout(500)
    v = await pg.evaluate(VID, 1)
    check("media-seek from the remote seeks and plays", 10.4 <= v["t"] < 11.5 and not v["paused"], json.dumps(v))
    m = await pg.evaluate(MEDIA)
    check("media state after seek: chapter Blue", m and m["chapter"] == "Blue", json.dumps(m))

    # --- skip confirmation
    await pg.keyboard.press("ArrowRight")
    await pg.wait_for_timeout(300)
    toast = await pg.evaluate(TOAST, 1)
    check("Next asks once", "again" in toast and (await pg.evaluate(POS))["index"] == 1, toast)
    await pg.screenshot(path=f"{OUT}/skip-ask.png")
    t0 = await pg.evaluate("performance.now()")
    await pg.keyboard.press("ArrowRight")
    await frames(pg, "card-outro", [300, 800, 1300, 1800, 2400], t0)
    m = await pg.evaluate(MEDIA)
    check("second Next skips to the outro, which ends the video", m and m["ended"], json.dumps(m))
    check("still on the video scene after the outro", (await pg.evaluate(POS))["index"] == 1)

    # --- next scene: morph intro; the card scene's video must stop
    t0 = await pg.evaluate("performance.now()")
    await pg.keyboard.press("ArrowRight")
    await frames(pg, "morph-intro", [200, 500, 900, 1300, 1700, 2100, 2500, 2900, 3300, 3700], t0)
    v1 = await pg.evaluate(VID, 1)
    check("leaving the scene pauses its video", v1["paused"])
    # alignment: where the mark box ended, vs the logo in the 1280x720 video scaled to the stage (x1.5)
    r = await pg.evaluate("""() => { const e = document.querySelectorAll('.stage > .scene')[2].querySelector('.vs-markbox');
      const b = e.getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; }""")
    exp = [840, 420, 240, 240]
    check("morph lands on the video's logo rect (840,420,240,240)", all(abs(a - b) < 1.5 for a, b in zip(r, exp)), str([round(x, 1) for x in r]))
    await wait_for(pg, f"() => !({VID})(2).paused")
    # the handoff frame: the overlay is gone, the video shows its own logo in the same place
    await pg.wait_for_timeout(300)
    await pg.screenshot(path=f"{OUT}/morph-after-handoff.png")
    im = Image.open(f"{OUT}/morph-after-handoff.png").convert("RGB")
    logo = im.getpixel((850, 430)); inner = im.getpixel((960, 540)); bg = im.getpixel((700, 300))
    check("after handoff: video logo at the target (orange edge, white centre, cream around)",
          logo[0] > 180 and logo[2] < 120 and min(inner) > 230 and bg[0] > 200 and bg[2] > 180, f"{logo} {inner} {bg}")

    # --- natural outro at 17.5
    await pg.keyboard.press("l"); await pg.wait_for_timeout(150)
    for _ in range(4):
        await pg.keyboard.press("l"); await pg.wait_for_timeout(150)
    v = await pg.evaluate(VID, 2)
    check("L to the last chapter (17 s)", 17 <= v["t"] < 17.5, f"t={v['t']:.2f}")
    await wait_for(pg, f"() => ({VID})(2).t >= 17.5")
    t0 = await pg.evaluate("performance.now()")
    await frames(pg, "morph-outro", [100, 500, 900, 1300, 1700, 2100, 2500, 3000], t0)
    await wait_for(pg, "() => { const m = (" + MEDIA + ")(); return m && m.ended; }")
    check("morph outro ends the scene state", True)
    await pg.keyboard.press("ArrowRight")
    await pg.wait_for_timeout(600)
    check("Next after the outro goes on", (await pg.evaluate(POS))["index"] == 3)

    # --- missing file
    await pg.wait_for_timeout(2600)
    await pg.screenshot(path=f"{OUT}/missing.png")
    txt = await pg.evaluate("() => document.querySelectorAll('.stage > .scene')[3].querySelector('.vs-fallback')?.innerText || ''")
    check("missing file: fallback card with the expected path", "missing.mp4" in txt and "file://" in txt, txt.replace("\n", " | ")[:160])
    await pg.keyboard.press("ArrowRight")
    await pg.wait_for_timeout(700)
    check("missing file: Next continues", (await pg.evaluate(POS))["index"] == 4)

    # --- back into a finished video scene from the next one: shows the end state, Next goes on
    # (a press during a running transition/entrance is ignored by design: wait for the deck's waiting cue)
    await pg.wait_for_function("__deck.state().waiting && !__deck.state().busy", timeout=10000)
    await pg.keyboard.press("ArrowLeft"); await pg.wait_for_timeout(600)
    await pg.keyboard.press("ArrowLeft"); await pg.wait_for_timeout(800)
    await pg.screenshot(path=f"{OUT}/back-into-morph.png")
    v = await pg.evaluate(VID, 2)
    check("Back into the video scene: video stays paused", v["paused"] and (await pg.evaluate(POS))["index"] == 2, json.dumps(v))

    # --- export
    await pg.evaluate("__deck.setExport(true)")
    shots = []
    for i, k in [(1, 0), (1, "end"), (2, 0), (2, "end"), (3, 0), (3, "end")]:
        await pg.evaluate(f"__deck.show({i}, {json.dumps(k)})")
        await pg.wait_for_timeout(400)
        p = f"{OUT}/export-{i}-{k}.png"
        await pg.screenshot(path=p)
        shots.append(p)
    sheet(shots, f"{OUT}/sheet-export.png", cols=2)
    vs = await pg.evaluate("() => [...document.querySelectorAll('video')].map(v => v.paused)")
    check("export: no video plays", all(vs), str(vs))
    check("no page errors", not errors, "; ".join(errors)[:300])
    await b.close()

async def autoplay_run(p):
    """No user gesture at all (deck opened directly on the video, strict autoplay policy)."""
    b = await p.chromium.launch()
    ctx = await b.new_context(viewport={"width": 1920, "height": 1080})
    # headless Chromium lets sound autoplay; emulate Chrome's desktop policy: unmuted play() needs a user gesture.
    # (navigator.userActivation is useless here: Playwright's evaluate() counts as a gesture.)
    await ctx.add_init_script("""
      let gesture = false;
      for (const ev of ["keydown", "pointerdown"]) addEventListener(ev, (e) => { if (e.isTrusted) gesture = true; }, true);
      const orig = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        if (!this.muted && !gesture)
          return Promise.reject(new DOMException("play() failed because the user didn't interact with the document first.", "NotAllowedError"));
        return orig.call(this);
      };""")
    pg = await ctx.new_page()
    await pg.goto(URL + "#vmorph")
    await wait_for(pg, "() => window.__deck && window.__deck.ready()")
    await pg.wait_for_timeout(4500)
    v = await pg.evaluate(VID, 2)
    toast = await pg.evaluate(TOAST, 2)
    await pg.screenshot(path=f"{OUT}/autoplay-muted.png")
    check("autoplay refused: plays muted with a hint", v and not v["paused"] and v["muted"] and "Sound" in toast, json.dumps(v) + " " + toast)
    await pg.keyboard.press("ArrowRight")
    await pg.wait_for_timeout(1000)
    v = await pg.evaluate(VID, 2)
    check("first Next unmutes (and does not leave)", not v["muted"] and v["vol"] > 0.3 and (await pg.evaluate(POS))["index"] == 2, json.dumps(v))
    await b.close()

async def reduced_run(p):
    b = await p.chromium.launch()
    ctx = await b.new_context(viewport={"width": 1920, "height": 1080}, reduced_motion="reduce")
    pg = await ctx.new_page()
    await pg.goto(URL + "#start")
    await wait_for(pg, "() => window.__deck && window.__deck.ready()")
    await pg.wait_for_timeout(500)
    await pg.keyboard.press("ArrowRight")
    await pg.wait_for_timeout(900)
    v = await pg.evaluate(VID, 1)
    await pg.screenshot(path=f"{OUT}/reduced.png")
    has_card_clip = await pg.evaluate("() => getComputedStyle(document.querySelectorAll('.stage > .scene')[1].querySelector('.vs-frame')).clipPath")
    check("reduced motion: short fade instead of the card expand, video plays", v and not v["paused"] and has_card_clip == "none", json.dumps(v) + " " + has_card_clip)
    await b.close()

async def main():
    async with async_playwright() as p:
        await main_run(p)
        await autoplay_run(p)
        await reduced_run(p)
    bad = [n for n, ok in results if not ok]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed" + (": FAILED " + ", ".join(bad) if bad else ""))

asyncio.run(main())

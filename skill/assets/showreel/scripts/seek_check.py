"""Seek checks for every scene (SKILL §2: seek WITH events; counters exact in export).

For every main scene after the first and every step label k, in each style:
  JUMP     __deck.show(i, k)
  FORWARD  the real deck: previous scene at its end, → into the scene, → per step, waiting for the cue
  BACK     __deck.show(i, "end"), then ← per step (the engine's short reverse tween)
compares a DOM signature of the scene (opacity, visibility, transforms, dash, clip-path, svg attrs, text) and
requires FORWARD == JUMP == BACK at every label. Then, at "end" (export state) and in #print, every element
with data-final must SHOW its final value (text counters by textContent, odometers by the digit each column
is rolled to). Exit 1 on any failure or page error.

Elements owned by live loops (beams, diagram halos/packets, anything under [data-loop]) are skipped: loops run
only live and never in export, so they legitimately differ between a live press and a jump.

  python scripts/seek_check.py [dist-single/index.html] [--styles academic,balanced,showcase] [--scenes a,b]
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
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from deckpage import deck_info, deck_url, open_deck, show  # noqa: E402

SIG_JS = r"""
(id) => {
  const root = document.querySelector(`[data-scene="${id}"]`);
  const out = [];
  const r1 = (s) => (s || "").replace(/-?\d+\.?\d*(e-?\d+)?/g, (m) => String(Math.round(parseFloat(m) * 2) / 2));
  const hidden = (el) => {
    for (let n = el; n && n !== root.parentElement; n = n.parentElement) {
      const c = getComputedStyle(n);
      if (c.visibility === "hidden" || parseFloat(c.opacity) < 0.005 || c.display === "none") return true;
    }
    return false;
  };
  // owned by live loops (beams, diagram halos/packets) or different by design live vs export (the protagonist's
  // static copy is an export-only stand-in for the live object)
  const LOOP = ".fx-beam, .fx-beam-path, [data-loop], .dg-halo, .dg-pk, [class*='dg-bm'], .fx-pstatic";
  const tf = (t) => (/^matrix\(1, -?0, -?0, 1, -?0, -?0\)$/.test(t) ? "none" : t);  // identity (after rounding) = none
  root.querySelectorAll("*").forEach((el, i) => {
    if (el.closest(LOOP)) return;
    const cs = getComputedStyle(el);
    if (hidden(el)) { out.push(el.tagName + "|HIDDEN"); return; }
    const parts = [el.tagName, r1(cs.opacity), cs.visibility, tf(r1(cs.transform)), r1(cs.clipPath)];
    if (el instanceof SVGElement) {
      parts.push(r1(el.getAttribute("transform")), r1(cs.strokeDasharray), r1(cs.strokeDashoffset), r1(el.getAttribute("width")));
    }
    if (el.childNodes.length && [...el.childNodes].every((n) => n.nodeType === 3)) parts.push(el.textContent);
    out.push(parts.join("|"));
  });
  return out;
}
"""

READ_JS = r"""
(sel) => {
  const norm = (s) => (s || "").replace(/[\s  ]/g, " ");
  const read = (odo) => [...odo.children].map((c) => {
    if (!c.classList.contains("fx-odo-col")) return c.textContent;
    const strip = c.firstElementChild;
    const m = new DOMMatrixReadOnly(getComputedStyle(strip).transform);
    const h = strip.firstElementChild.offsetHeight;
    const idx = Math.round(-m.m42 / h);
    return strip.children[idx]?.textContent ?? "?";
  }).join("");
  const bad = [];
  let n = 0;
  document.querySelectorAll(sel).forEach((el) => {
    if (el.closest("[data-measure]")) return;
    n++;
    const want = norm(el.dataset.final);
    const got = norm(el.classList.contains("fx-odo") ? read(el) : el.textContent);
    if (want !== got) bad.push(`${el.className}: want "${want}" got "${got}"`);
  });
  return { n, bad };
}
"""


def diff(a: list[str], b: list[str]) -> list[str]:
    if len(a) != len(b):
        return [f"element count {len(a)} != {len(b)}"]
    out = []
    for i, (x, y) in enumerate(zip(a, b)):
        if x != y:
            nx = re.findall(r"-?\d+\.?\d*", x)
            ny = re.findall(r"-?\d+\.?\d*", y)
            if re.sub(r"-?\d+\.?\d*", "#", x) == re.sub(r"-?\d+\.?\d*", "#", y) and all(abs(float(p) - float(q)) <= 1.0 for p, q in zip(nx, ny)):
                continue
            out.append(f"#{i}: {x[:140]}  ≠  {y[:140]}")
    return out


async def wait_cue(pg, timeout=25_000):
    await pg.wait_for_function("__deck.state().waiting && !__deck.state().busy", timeout=timeout)
    await pg.wait_for_timeout(200)


async def press_until(pg, key: str, cond: str, tries: int = 6) -> None:
    """Press until the deck reacts (a press during a running part is ignored by design, so retry)."""
    for _ in range(tries):
        await pg.keyboard.press(key)
        try:
            await pg.wait_for_function(cond, timeout=1500)
            return
        except Exception:
            continue
    raise RuntimeError(f"{key} never reached {cond}")


async def run(target, styles, only=None) -> int:
    fails: list[str] = []
    checks = 0
    errors: list[str] = []
    for st in styles:
        async with open_deck(deck_url(target, f"style={st}"), errors) as pg:
            info = await deck_info(pg)
            await pg.evaluate("__deck.setExport(true)")
            main = [i for i in info["order"] if not info["appendix"][i]]
            for pos, i in enumerate(main):
                sid, n = info["ids"][i], info["steps"][i]
                if pos == 0 or (only and sid not in only):
                    continue  # the first scene has no previous scene to arrive from
                jump = []
                for k in range(n + 1):
                    await show(pg, i, k, 250)
                    jump.append(await pg.evaluate(SIG_JS, sid))
                # forward through the real deck
                await show(pg, main[pos - 1], "end", 250)
                await pg.evaluate("__deck.setExport(false)")
                await press_until(pg, "ArrowRight", f"__deck.state().index === {i}")
                await wait_cue(pg)
                fwd = [await pg.evaluate(SIG_JS, sid)]
                for k in range(1, n + 1):
                    await press_until(pg, "ArrowRight", f"__deck.state().step === {k}")
                    await wait_cue(pg)
                    fwd.append(await pg.evaluate(SIG_JS, sid))
                # back from the end
                await pg.evaluate("__deck.setExport(true)")
                await show(pg, i, "end", 250)
                await pg.evaluate("__deck.setExport(false)")
                back = {n: await pg.evaluate(SIG_JS, sid)}
                for k in range(n - 1, -1, -1):
                    await press_until(pg, "ArrowLeft", f"__deck.state().step === {k}")
                    await pg.wait_for_timeout(900)
                    back[k] = await pg.evaluate(SIG_JS, sid)
                await pg.evaluate("__deck.setExport(true)")
                for k in range(n + 1):
                    for name, other in (("forward", fwd[k]), ("back", back[k])):
                        checks += 1
                        d = diff(jump[k], other)
                        if d:
                            fails.append(f"[{st}] {sid} s{k}: {name} ≠ jump ({len(d)} elements) e.g. {d[0]}")
                # export state: counters and odometers show exact values
                await show(pg, i, "end", 300)
                r = await pg.evaluate(READ_JS, f'[data-scene="{sid}"] [data-final]')
                checks += 1
                if r["bad"]:
                    fails.append(f"[{st}] {sid} end: {r['n']} counters, wrong: {r['bad'][:4]}")
                print(f"[{st}] {sid}: {n + 1} labels × forward/back/jump, {r['n']} counters exact" if not r["bad"] else f"[{st}] {sid}: FAIL")
    for st in styles:
        from playwright.async_api import async_playwright
        async with async_playwright() as p:
            b = await p.chromium.launch()
            pg = await b.new_page(viewport={"width": 1920, "height": 1080})
            pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
            await pg.goto(deck_url(target, f"style={st}", "print"))
            await pg.wait_for_selector("[data-scene]")
            await pg.wait_for_timeout(1500)
            r = await pg.evaluate(READ_JS, "[data-final]")
            checks += 1
            if r["bad"]:
                fails.append(f"[{st}] #print: {r['bad'][:4]}")
            print(f"[{st}] #print: {r['n']} counters, {len(r['bad'])} wrong")
            await b.close()
    for f in fails:
        print("FAIL", f)
    for e in errors:
        print("ERROR", e)
    print(f"{checks} checks, {len(fails)} failures, {len(errors)} page errors")
    return 1 if fails or errors else 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("target", nargs="?")
    ap.add_argument("--styles", default="academic,balanced,showcase")
    ap.add_argument("--scenes", default="", help="comma-separated scene ids (default: all)")
    a = ap.parse_args()
    sys.exit(asyncio.run(run(a.target, a.styles.split(","), set(filter(None, a.scenes.split(","))) or None)))

"""Rendered contrast + size check for data-viz scenes (WCAG 2.1: 4.5:1 text, 3:1 large text >= 24 px or >= 18.7 px bold).

For every scene at its end state, in each style: every visible text element inside a chart (.viz) or heading;
its colour (SVG: fill) against what is really under it (elementsFromPoint at the text centre: the first opaque
HTML background or SVG fill; an SVG text halo counts as its background). Colours are resolved by painting them on
a canvas, so color-mix()/oklab tokens are measured as rendered. Also flags chart text below 18 px.

  python scripts/viz_contrast.py [dist-single/index.html] [--styles ...] [--lang en]
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
from deckpage import deck_info, deck_url, open_deck, show  # noqa: E402

JS = r"""
(id) => {
  const cv = document.createElement("canvas"); cv.width = cv.height = 1;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  const rgba = (c) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = "#000"; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const over = (top, bot) => { const a = top[3]; return [0, 1, 2].map((i) => top[i] * a + bot[i] * (1 - a)).concat(1); };
  const effOpacity = (el) => { let o = 1; for (let n = el; n; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity); return o; };
  const root = document.querySelector(`[data-scene="${id}"]`);
  const stageBg = rgba(getComputedStyle(root).backgroundColor);
  const out = [];
  const texts = [...root.querySelectorAll(".viz *, .h-title, .h-eyebrow, .h-sub")].filter((el) =>
    [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && !el.closest("[data-measure]"));
  for (const el of texts) {
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || effOpacity(el) < 0.5) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    // clipped away by an overflow viewport (odometer digit strips): not on screen
    let shown = true;
    for (let a = el.parentElement; a && a !== root && shown; a = a.parentElement) {
      const ac = getComputedStyle(a);
      if (ac.overflow === "visible") continue;
      const ar = a.getBoundingClientRect();
      shown = Math.min(r.bottom, ar.bottom) - Math.max(r.top, ar.top) > r.height * 0.5 && Math.min(r.right, ar.right) - Math.max(r.left, ar.left) > 1;
    }
    if (!shown) continue;
    const isSvg = el instanceof SVGElement;
    const fg = rgba(isSvg ? cs.fill : cs.color);
    let bg = null;
    if (isSvg && cs.stroke !== "none" && parseFloat(cs.strokeWidth) >= 4 && cs.paintOrder.startsWith("stroke")) bg = rgba(cs.stroke);
    if (!bg) {
      // the element's own background first, then whatever is painted under it
      const stack = [el, ...document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2).filter((n) => n !== el && !el.contains(n))];
      const layers = [];
      for (const n of stack) {
        const c = getComputedStyle(n);
        if (c.visibility === "hidden") continue;
        const op = effOpacity(n);
        if (op < 0.02) continue;
        let col = null;
        if (n === el && el instanceof SVGElement) continue;
        if (n instanceof SVGGeometryElement && c.fill !== "none" && !(n instanceof SVGTextElement)) col = rgba(c.fill), col[3] *= parseFloat(c.fillOpacity) * op;
        else if (!(n instanceof SVGElement)) { const b = rgba(c.backgroundColor); if (b[3] > 0) col = b, col[3] *= op; else if (c.backgroundImage.includes("gradient")) { const m = c.backgroundImage.match(/(rgba?\([^)]*\)|color\([^)]*\)|oklab\([^)]*\)|#[0-9a-f]+)/gi); if (m) col = rgba(m[m.length - 1]), col[3] *= op; } }
        if (col) { layers.push(col); if (col[3] >= 0.99) break; }
        if (n === root) break;
      }
      bg = layers.reduceRight((acc, l) => over(l, acc), stageBg);
    }
    const size = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight) >= 700;
    const large = size >= 24 || (bold && size >= 18.66);
    const cr = ratio(over(fg, bg), bg);
    const need = large ? 3 : 4.5;
    out.push({ text: el.textContent.trim().slice(0, 40), size, cr: Math.round(cr * 100) / 100, need, small: el.closest(".viz") && size < 18 });
  }
  return out;
}
"""


async def run(target, styles, lang) -> int:
    bad, n, errors = [], 0, []
    for st in styles:
        async with open_deck(deck_url(target, f"style={st}&lang={lang}"), errors) as pg:
            info = await deck_info(pg)
            await pg.evaluate("__deck.setExport(true)")
            for i in info["order"]:
                sid = info["ids"][i]
                await show(pg, i, "end", 300)
                for r in await pg.evaluate(JS, sid):
                    n += 1
                    if r["cr"] < r["need"] or r["small"]:
                        bad.append(f"[{st}] {sid}: \"{r['text']}\" {r['size']:.0f}px contrast {r['cr']} (need {r['need']})" + (" <18px" if r["small"] else ""))
    for b in bad:
        print("FAIL", b)
    for e in errors:
        print("ERROR", e)
    print(f"{n} text elements checked, {len(bad)} failures")
    return 1 if bad or errors else 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("target", nargs="?")
    ap.add_argument("--styles", default="academic,balanced,showcase")
    ap.add_argument("--lang", default="en")
    a = ap.parse_args()
    sys.exit(asyncio.run(run(a.target, a.styles.split(","), a.lang)))

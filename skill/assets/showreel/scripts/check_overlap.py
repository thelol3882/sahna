"""Overlap check (SKILL §11): nothing of a scene may reach below the footer line.

    python scripts/check_overlap.py [--html dist-single/index.html] [--limit 1012]

Per scene at its end state: the bottom of every visible text range (Range rects over text nodes) and of every
visible box with a background or border (full-stage containers skipped). Content clipped by an overflow:hidden
viewport (scroll scenes) is measured after clipping. Also flags anything past the left/right stage edge.
Exit code 1 when something collides.
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

MEASURE = r"""
([id, limit]) => {
  const root = document.querySelector(`.scene[data-scene="${id}"]`);
  if (!root) return [{ kind: "missing", text: "no .scene[data-scene] (use SceneRoot)", bottom: 0 }];
  const sr = document.querySelector(".stage").getBoundingClientRect();
  const k = sr.width / 1920;
  const visible = (el) => {
    for (let a = el; a && a !== root.parentElement; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) < 0.02) return false;
    }
    return true;
  };
  // intersect with every clipping ancestor inside the scene
  const clip = (el, r) => {
    let c = { l: r.left, t: r.top, r: r.right, b: r.bottom };
    for (let a = el.parentElement; a && a !== root; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.overflowX === "visible" && cs.overflowY === "visible" && cs.clipPath === "none") continue;
      const ar = a.getBoundingClientRect();
      c = { l: Math.max(c.l, ar.left), t: Math.max(c.t, ar.top), r: Math.min(c.r, ar.right), b: Math.min(c.b, ar.bottom) };
    }
    return c;
  };
  const out = [];
  const check = (kind, el, r, text) => {
    const c = clip(el, r);
    if (c.b - c.t < 1 || c.r - c.l < 1) return;
    const bottom = (c.b - sr.top) / k, left = (c.l - sr.left) / k, right = (c.r - sr.left) / k;
    if (bottom > limit || left < -1 || right > 1921) out.push({ kind, text, bottom: Math.round(bottom), left: Math.round(left), right: Math.round(right) });
  };
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.textContent.trim();
    if (!text || !visible(n.parentElement)) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) check("text", n.parentElement, r, text.slice(0, 60));
  }
  for (const el of root.querySelectorAll("*")) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    const bg = cs.backgroundColor !== "rgba(0, 0, 0, 0)" || cs.backgroundImage !== "none";
    const border = ["Top", "Bottom", "Left", "Right"].some((s) => parseFloat(cs[`border${s}Width`]) > 0 && cs[`border${s}Style`] !== "none");
    if (!bg && !border) continue;
    const r = el.getBoundingClientRect();
    if (r.width / k >= 1900 && r.height / k >= 1000) continue; // full-stage container
    check("box", el, r, `<${el.tagName.toLowerCase()} class="${String(el.className).slice(0, 50)}">`);
  }
  return out;
}
"""


async def run(url: str, limit: int) -> int:
    errors: list[str] = []
    bad = 0
    async with open_deck(url, errors) as pg:
        info = await deck_info(pg)
        await pg.evaluate("__deck.setExport(true)")
        for i in info["order"]:
            sid = info["ids"][i]
            await show(pg, i, "end", 500)
            hits = await pg.evaluate(MEASURE, [sid, limit])
            if not hits:
                print(f"ok    {sid}")
                continue
            bad += 1
            print(f"FAIL  {sid}")
            for h in hits[:12]:
                print(f"        {h['kind']:4} bottom {h['bottom']:5}  x {h.get('left', 0)}–{h.get('right', 0)}  {h['text']}")
    for e in errors:
        print(e)
    return 1 if bad or errors else 0


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--html")
    ap.add_argument("--limit", type=int, default=1012, help="footer line on the 1920×1080 stage")
    a = ap.parse_args()
    raise SystemExit(asyncio.run(run(deck_url(a.html), a.limit)))


if __name__ == "__main__":
    main()

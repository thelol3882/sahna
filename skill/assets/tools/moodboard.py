"""Mood board for the concept workshop: three static frames per pack (cover, signature scene, data scene) with the
deck's real title and numbers, one comparison sheet per pack and one grid of all chosen packs.

    python moodboard.py --packs midnight,swiss,oyu --content talk.json --out moodboard/ [--style balanced]

No engine and no build: each frame is a static HTML page made from the pack's tokens (theme.css), utilities
(pack.css) and fonts (Fontsource packages fetched into a cache), screenshotted with Playwright at 1920×1080.
--style shows the packs under one dial setting (default: each pack's recommended dial), so a dark-first pack
under "balanced" shows its light content scenes, exactly as the deck would.
Content JSON: see talk.en.json and talk.kk.json next to this script (every field optional).
Outputs: <out>/<pack>/{cover,signature,data}.png, <out>/<pack>.png (sheet), <out>/grid.png (all packs).
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
import html
import json
import pathlib
import re
import sys

from playwright.async_api import async_playwright

HERE = pathlib.Path(__file__).resolve().parent
ASSETS = HERE.parent  # skill assets/: packs/ next to tools/
sys.path.insert(0, str(HERE))
from fonts import pkg_dir  # noqa: E402

DEFAULT = json.loads((HERE / "talk.en.json").read_text(encoding="utf-8"))
E = html.escape


# ---------------------------------------------------------------- CSS

BASE_CSS = """
html, body { margin: 0; width: 1920px; height: 1080px; overflow: hidden; }
body { background: var(--color-canvas); color: var(--color-ink); font-family: var(--font-sans); -webkit-font-smoothing: antialiased; }
.scene { position: absolute; inset: 0; background: var(--color-canvas); overflow: hidden; }
.scene.hero { background: var(--hero-bg, var(--color-hero)); color: var(--color-hero-ink); }
.eyebrow { font-family: var(--font-label); font-size: var(--text-label); font-weight: 500; letter-spacing: var(--text-label--letter-spacing); text-transform: var(--label-case); color: var(--color-primary-ink); }
.hero .eyebrow { color: var(--color-hero-muted); }
.display { font-family: var(--font-display); font-size: var(--text-display); line-height: var(--text-display--line-height); font-weight: var(--text-display--font-weight); letter-spacing: var(--text-display--letter-spacing); text-wrap: balance; margin: 0; }
.h1 { font-family: var(--font-display); font-size: var(--text-h1); line-height: var(--text-h1--line-height); font-weight: var(--text-h1--font-weight); letter-spacing: var(--text-h1--letter-spacing); text-wrap: balance; margin: 0; }
.h2 { font-family: var(--font-display); font-size: var(--text-h2); line-height: var(--text-h2--line-height); font-weight: var(--text-h2--font-weight); letter-spacing: var(--text-h2--letter-spacing); margin: 0; }
.body-l { font-size: var(--text-body-l); line-height: var(--text-body-l--line-height); color: var(--color-ink-2); margin: 0; }
.body-m { font-size: var(--text-body-m); line-height: var(--text-body-m--line-height); color: var(--color-ink-2); margin: 0; }
.hero .body-l, .hero .body-m { color: var(--color-hero-muted); }
.mono { font-family: var(--font-mono); }
.card { background: var(--card-bg); border: var(--card-border); border-top: var(--card-top-rule); border-radius: var(--radius-card); box-shadow: var(--shadow-sm); }
.card.primary { background: var(--color-primary); color: var(--color-on-primary); border: 0; }
.abs { position: absolute; }
.foot { position: absolute; left: 120px; right: 120px; bottom: 40px; display: flex; justify-content: space-between; font-family: var(--font-label);
  font-size: 18px; letter-spacing: 0.04em; color: var(--color-muted); }
.hero .foot { color: var(--color-hero-muted); }
.bars-ui { position: absolute; right: 120px; bottom: 44px; display: flex; gap: 8px; }
.bars-ui i { width: 64px; height: 8px; border-radius: 99px; background: var(--color-track); display: block; }
.bars-ui i.on { background: var(--color-primary); }
.hero .bars-ui i { background: rgb(255 255 255 / 0.16); } .hero .bars-ui i.on { background: var(--color-hero-ink); }
/* the one marked word of a statement */
.sig-mark { color: var(--color-primary); }
[data-pack="brutalist"] .sig-mark { color: inherit; background: var(--color-accent); color: var(--color-on-accent); padding: 0 0.12em; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
[data-pack="paper"] .sig-mark, [data-pack="calm"] .sig-mark { color: inherit; background: linear-gradient(transparent 58%, var(--color-highlight) 58% 92%, transparent 92%); }
[data-pack="aurora"] .sig-mark { color: var(--color-primary); }
[data-pack="midnight"] .sig-mark { color: var(--color-accent); }
[data-pack="oyu"] .sig-mark { color: var(--color-accent); }
.hero .sig-mark { color: var(--color-hero-accent); }
[data-pack="brutalist"] .hero .sig-mark { color: var(--color-on-accent); }
"""

FIT_JS = """
// shrink any [data-fit] element until it fits its max height (long real titles)
for (const el of document.querySelectorAll('[data-fit]')) {
  const max = Number(el.dataset.fit); let fs = parseFloat(getComputedStyle(el).fontSize);
  while (el.scrollHeight > max && fs > 40) { fs -= 4; el.style.fontSize = fs + 'px'; }
}
"""


def theme_to_css(theme: str) -> str:
    """Tailwind's @theme static block → plain :root custom properties."""
    t = re.sub(r"@custom-variant[^;]*;", "", theme)
    return t.replace("@theme static {", ":root {")


def font_links(fonts: dict) -> str:
    out = []
    for f in fonts["faces"].values():
        d = pkg_dir(f["package"].split("/")[-1])
        for w in f["weights"]:
            for s in f["subsets"]:
                css = d / f"{s}-{w}.css"
                if css.exists():
                    out.append(f'<link rel="stylesheet" href="{css.as_uri()}">')
    return "\n".join(dict.fromkeys(out))


# ---------------------------------------------------------------- scenes

def mark(text: str, word: str | None) -> str:
    t = E(text)
    if word and E(word) in t:
        t = t.replace(E(word), f'<span class="sig-mark">{E(word)}</span>', 1)
    return t


def footer(c: dict, n: int, source: str = "") -> str:
    return (f'<div class="foot"><span>{E(source or c.get("footer", ""))}</span><span></span></div>'
            f'<div class="bars-ui"><span class="mono" style="font-size:18px;color:inherit;opacity:.7;margin-right:12px">{n:02d}/14</span><i class="on"></i><i class="on"></i><i></i></div>')


COVER_DECOR = {
    "midnight": """<svg class="abs" style="right:140px;top:200px" width="560" height="560" viewBox="0 0 560 560">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#C0CDFF"/><stop offset=".55" stop-color="#5A6AFF" stop-opacity=".25"/><stop offset="1" stop-color="#FFB86B"/></linearGradient>
      <radialGradient id="r"><stop offset="0" stop-color="#9DB2FF" stop-opacity=".35"/><stop offset="1" stop-color="#9DB2FF" stop-opacity="0"/></radialGradient></defs>
      <circle cx="280" cy="280" r="270" fill="url(#r)"/><circle cx="280" cy="280" r="200" fill="none" stroke="url(#g)" stroke-width="1.5"/>
      <circle cx="280" cy="280" r="140" fill="none" stroke="rgb(255 255 255 / .12)" stroke-width="1"/>
      <circle cx="421" cy="139" r="7" fill="#FFB86B"/><circle cx="421" cy="139" r="22" fill="none" stroke="#FFB86B" stroke-opacity=".35"/></svg>""",
    "swiss": """<div class="abs" style="right:120px;top:120px;width:360px;height:360px;background:var(--color-hero-accent)"></div>
      <div class="abs pk-index" style="right:120px;top:500px;color:var(--color-hero-ink);font-size:28px">01 — 14</div>""",
    "terminal": """<div class="abs mono" style="left:120px;top:900px;font-size:30px;color:var(--color-hero-accent)"><span class="pk-prompt"></span>./present --live<span class="pk-caret" style="margin-left:6px"></span></div>""",
    "paper": """<div class="abs" style="left:120px;top:236px;width:120px;height:3px;background:var(--color-hero-accent)"></div>""",
    "aurora": """<div class="abs" style="left:0;right:0;bottom:0;height:420px;background:linear-gradient(transparent,rgb(5 4 11 / .9))"></div>""",
    "brutalist": """<div class="abs" style="right:120px;top:140px;width:420px;height:420px;border:3px solid var(--color-hero-ink);display:flex;align-items:flex-end;justify-content:flex-end;padding:24px;box-sizing:border-box">
      <span class="mono" style="font-size:120px;font-weight:700;line-height:.8;color:var(--color-hero-accent)">01</span></div>""",
    "calm": """<div class="abs" style="left:120px;top:236px;width:96px;height:6px;border-radius:3px;background:var(--color-hero-accent)"></div>""",
    "oyu": """<div class="abs pk-ornament" style="right:150px;top:200px;width:440px;height:440px;opacity:.9"></div>
      <div class="abs pk-ornament-band" style="left:0;right:0;bottom:120px;opacity:.55"></div>""",
}


COVER_DECOR_RIGHT = {"midnight", "swiss", "brutalist", "oyu"}


def cover(c: dict, p: str) -> str:
    title_top = 300 if p not in ("paper", "calm") else 280
    return f"""<div class="scene hero"><div class="pk-texture"></div>{COVER_DECOR.get(p, "")}
  <div class="abs eyebrow" style="left:120px;top:{title_top - 70}px">{E(c['eyebrow'])}</div>
  <h1 class="abs display" data-fit="420" style="left:120px;top:{title_top}px;width:{1080 if p in COVER_DECOR_RIGHT else 1500}px">{mark(c['title'], c.get('title_mark'))}</h1>
  <div class="abs" style="left:120px;top:{title_top + 440}px;width:1100px;display:flex;flex-direction:column;gap:18px">
    <p class="h2" style="font-weight:500;color:var(--color-hero-ink);opacity:.92">{E(c['subtitle'])}</p>
    <p class="body-l">{E(c['speakers'])}</p></div>
  {footer(c, 1)}</div>"""


def sig_heading(s: dict, top=130, width=1500) -> str:
    return f"""<div class="abs" style="left:120px;top:{top}px;width:{width}px;display:flex;flex-direction:column;gap:18px">
    <span class="eyebrow">{E(s['eyebrow'])}</span><h1 class="h1" data-fit="200">{mark(s['title'], s.get('mark'))}</h1></div>"""


def signature(c: dict, p: str, kind: str, hero: bool) -> str:
    s = c["signature"]
    pts = s["points"][:3]
    if kind == "window":
        rows = "".join(
            f"""<div style="display:flex;gap:28px;align-items:baseline;padding:26px 36px;border-top:1px solid var(--color-line);{'background:var(--color-primary-soft);' if i == len(pts) - 1 else ''}">
              <span class="mono" style="font-size:22px;color:var(--color-primary-ink);width:44px">{E(pt['k'])}</span>
              <div style="display:flex;flex-direction:column;gap:6px"><span class="h2" style="font-size:32px">{E(pt['title'])}</span><span class="body-m">{E(pt['text'])}</span></div>
              {'<span class="mono" style="margin-left:auto;font-size:20px;padding:6px 14px;border-radius:var(--radius-chip);background:var(--color-primary);color:var(--color-on-primary);white-space:nowrap">' + E(s.get('status', 'ok')) + '</span>' if i == len(pts) - 1 else ''}
            </div>""" for i, pt in enumerate(pts))
        return f"""<div class="scene"><div class="pk-texture" style="opacity:.6"></div>{sig_heading(s, width=760)}
          <p class="abs body-l" style="left:120px;top:560px;width:680px">{E(s.get('lead', ''))}</p>
          <div class="abs pk-frame pk-glow pk-hairline" style="left:920px;top:150px;width:880px">
            <div class="pk-frame-bar"><i></i><i></i><i></i><span style="margin-left:12px">{E(s.get('window', 'session'))}</span></div>
            <div class="mono" style="padding:28px 36px;font-size:24px;color:var(--color-ink-2)"><span class="pk-prompt"></span>{E(s.get('command', ''))}</div>
            {rows}</div>{footer(c, 6)}</div>"""
    if kind == "statement":
        cols = "".join(
            f"""<div style="flex:1;display:flex;flex-direction:column;gap:14px;padding-top:28px;border-top:var(--pk-col-rule, 3px solid var(--color-ink))">
              <span class="pk-index mono" style="font-size:26px;font-weight:700;color:var(--color-primary)">{E(pt['k'])}</span>
              <span class="h2">{E(pt['title'])}</span><span class="body-m">{E(pt['text'])}</span></div>""" for pt in pts)
        return f"""<div class="scene"><div class="pk-texture"></div>
          <div class="abs eyebrow" style="left:120px;top:120px">{E(s['eyebrow'])}</div>
          <h1 class="abs display" data-fit="440" style="left:120px;top:180px;width:1680px;font-size:calc(var(--text-display) * 0.82)">{mark(s['title'], s.get('mark'))}</h1>
          <div class="abs" style="left:120px;right:120px;top:660px;display:flex;gap:60px">{cols}</div>{footer(c, 6)}</div>"""
    if kind == "annotated":
        notes = "".join(
            f"""<div style="display:flex;gap:20px;align-items:flex-start"><span class="mono" style="font-size:22px;color:var(--color-accent);padding-top:8px">{E(pt['k'])}</span>
              <div><div class="h2" style="margin-bottom:8px">{E(pt['title'])}</div><div class="body-m">{E(pt['text'])}</div></div></div>""" for pt in pts)
        return f"""<div class="scene"><div class="pk-texture"></div>
          <div class="abs eyebrow" style="left:160px;top:150px">{E(s['eyebrow'])}</div>
          <h1 class="abs display" data-fit="360" style="left:160px;top:210px;width:1020px;font-size:calc(var(--text-display) * 0.86)">{mark(s['title'], s.get('mark'))}</h1>
          <p class="abs" style="left:160px;top:640px;width:980px;font-size:36px;line-height:1.45;color:var(--color-ink-2);margin:0">{mark(s.get('lead', ''), s.get('lead_mark'))}</p>
          <div class="abs" style="left:1250px;top:160px;bottom:160px;width:2px;background:var(--color-line)"></div>
          <div class="abs" style="left:1300px;top:200px;width:500px;display:flex;flex-direction:column;gap:56px">{notes}</div>
          {footer(c, 6, s.get('source', ''))}</div>"""
    if kind == "glass":
        cards = "".join(
            f"""<div class="pk-glass" style="flex:1;padding:40px;display:flex;flex-direction:column;gap:18px;min-height:400px">
              <span style="font-family:var(--font-display);font-weight:300;font-size:96px;line-height:1;letter-spacing:-.04em" class="{'pk-gradient-text' if i == 1 else ''}">{E(pt['k'])}</span>
              <span class="h2">{E(pt['title'])}</span><span class="body-m" style="color:inherit;opacity:.78">{E(pt['text'])}</span></div>""" for i, pt in enumerate(pts))
        cls = "scene hero" if hero else "scene"
        return f"""<div class="{cls}"><div class="pk-texture"></div>{sig_heading(s)}
          <div class="abs" style="left:120px;right:120px;top:470px;display:flex;gap:36px">{cards}</div>{footer(c, 6)}</div>"""
    if kind == "ornament":
        ms = "".join(
            f"""<div style="flex:1;display:flex;flex-direction:column;gap:18px;align-items:flex-start">
              <div style="width:112px;height:112px;border-radius:50%;background:var(--color-canvas);display:grid;place-items:center">
                <div class="pk-ornament" style="width:96px;height:96px;{'' if i == len(pts) - 1 else 'background:var(--color-line-strong)'}"></div></div>
              <span class="eyebrow" style="color:var(--color-accent);margin-top:6px">{E(pt['k'])}</span><span class="h2" style="font-size:48px">{E(pt['title'])}</span>
              <span class="body-l" style="max-width:460px">{E(pt['text'])}</span></div>""" for i, pt in enumerate(pts))
        return f"""<div class="scene"><div class="abs pk-ornament-band" style="left:0;right:0;top:36px"></div>{sig_heading(s, top=140)}
          <p class="abs body-l" style="left:120px;top:330px;width:1300px">{E(s.get('lead', ''))}</p>
          <div class="abs" style="left:120px;right:120px;top:536px;height:2px;background:linear-gradient(90deg,var(--color-accent),var(--color-line) 75%)"></div>
          <div class="abs" style="left:120px;right:120px;top:480px;display:flex;gap:60px">{ms}</div>{footer(c, 6)}</div>"""
    raise ValueError(kind)


def data_scene(c: dict, p: str) -> str:
    d = c["data"]
    bars = d["bars"]
    mx = max(b["value"] for b in bars) or 1
    cols = ["var(--color-line-strong)", "var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-3)"]
    bar_html = "".join(
        f"""<div style="display:flex;flex-direction:column;align-items:center;gap:12px;width:150px">
          <span class="tnum" style="font-family:var(--font-display);font-size:40px;font-weight:600">{b['value']:,}</span>
          <div style="width:100%;height:{int(300 * b['value'] / mx)}px;background:{cols[min(i, 3)] if len(bars) > 2 or i else cols[0]};border-radius:var(--radius-chip) var(--radius-chip) 0 0;border-radius:min(var(--radius-card), 14px) min(var(--radius-card), 14px) 0 0"></div></div>"""
        for i, b in enumerate(bars))
    labels = "".join(f'<span class="body-m" style="width:150px;text-align:center">{E(b["label"])}</span>' for b in bars)
    return f"""<div class="scene">
      <div class="abs" style="left:120px;top:130px;width:1600px;display:flex;flex-direction:column;gap:18px">
        <span class="eyebrow">{E(d['eyebrow'])}</span><h1 class="h1" data-fit="180">{mark(d['title'], d.get('mark'))}</h1></div>
      <div class="abs card" style="left:120px;top:400px;width:520px;height:520px;padding:48px;box-sizing:border-box;display:flex;flex-direction:column;gap:16px">
        <span class="pk-stat" style="font-size:min(var(--text-stat), 150px)">{E(d['stat'])}</span><span class="body-m">{E(d['stat_label'])}</span>
        <span class="pk-kicker" style="margin-top:auto">{E(d.get('kicker', ''))}</span></div>
      <div class="abs card" style="left:680px;top:400px;width:700px;height:520px;padding:40px 56px 28px;box-sizing:border-box;display:flex;flex-direction:column">
        <span class="body-m">{E(d.get('chart_label', ''))}{', ' + E(d['unit']) if d.get('unit') else ''}</span>
        <div style="flex:1;display:flex;align-items:flex-end;justify-content:space-around;border-bottom:2px solid var(--color-line-strong)">{bar_html}</div>
        <div style="display:flex;justify-content:space-around;padding-top:12px">{labels}</div></div>
      <div class="abs card primary" style="left:1420px;top:400px;width:380px;height:520px;padding:40px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:flex-end;gap:14px">
        <span style="font-family:var(--font-display);font-size:30px;line-height:1.3;font-weight:500">{E(d['callout'])}</span></div>
      {footer(c, 9, d.get('source', ''))}</div>"""


def page(pack: pathlib.Path, body: str, dark: bool, style: str, links: str) -> str:
    theme = theme_to_css((pack / "theme.css").read_text(encoding="utf-8"))
    extra = (pack / "pack.css").read_text(encoding="utf-8")
    return f"""<!doctype html><html lang="en" data-pack="{pack.name}" data-style="{style}" class="{'dark' if dark else ''}"><head><meta charset="utf-8">
{links}<style>{theme}\n{BASE_CSS}\n{extra}</style></head><body>{body}<script>{FIT_JS}</script></body></html>"""


# ---------------------------------------------------------------- sheets

def sheet_html(pack: pathlib.Path, meta: dict, fonts: dict, shots: dict[str, pathlib.Path], style: str, content_lang: str) -> str:
    theme = (pack / "theme.css").read_text(encoding="utf-8")
    light = dict(re.findall(r"--color-([\w-]+):\s*([^;]+);", re.split(r"\n(?:/\*[^\n]*\*/\n)?\.dark", theme)[0]))
    sw = "".join(f'<div class="sw"><i style="background:{light[k]}"></i><span>{k}</span></div>'
                 for k in ("canvas", "surface", "ink", "muted", "primary", "accent", "hero", "hero-accent") if k in light)
    fl = "".join(f"<li><b>{E(r)}</b> {E(f['family'])} {'/'.join(map(str, f['weights']))} "
                 f"<span class='ok'>{'kk ✓' if f.get('coverage', {}).get('langs', {}).get('kk') else 'kk ✗'}</span></li>" for r, f in fonts["faces"].items())
    imgs = "".join(f'<figure><img src="{shots[k].as_uri()}"><figcaption>{k}</figcaption></figure>' for k in ("cover", "signature", "data"))
    note = "" if style == meta["dial"] else f"<p class='warn'>shown under DECK.style = {style}; designed for {meta['dial']}</p>"
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
body {{ margin:0; width:2400px; background:#ECECEA; font-family: system-ui, sans-serif; color:#15171C; }}
.wrap {{ display:grid; grid-template-columns: 1fr 520px; gap:40px; padding:48px; }}
.frames {{ display:grid; grid-template-columns: 1fr 1fr; gap:24px; }}
figure {{ margin:0; }} figure:first-child {{ grid-column: span 2; }}
img {{ width:100%; display:block; border-radius:14px; box-shadow: 0 10px 40px rgb(0 0 0 / .14); }}
figcaption {{ font: 500 18px ui-monospace, monospace; color:#6A6E78; padding-top:8px; letter-spacing:.08em; text-transform:uppercase; }}
h1 {{ font-size:52px; margin:0 0 6px; letter-spacing:-.02em; }} .pitch {{ font-size:24px; line-height:1.4; color:#3A3D45; }}
.tag {{ display:inline-block; font: 600 18px ui-monospace, monospace; padding:6px 12px; border-radius:99px; background:#15171C; color:#fff; margin:0 8px 8px 0; }}
.sw {{ display:flex; align-items:center; gap:12px; font: 18px ui-monospace, monospace; margin:6px 0; }} .sw i {{ width:44px; height:28px; border-radius:6px; border:1px solid rgb(0 0 0/.12); display:block; }}
ul {{ padding-left:20px; font-size:20px; line-height:1.5; }} .ok {{ color:#1E8A50; font-family: ui-monospace, monospace; }}
h3 {{ font: 600 18px ui-monospace, monospace; letter-spacing:.1em; text-transform:uppercase; color:#6A6E78; margin:28px 0 8px; }}
.warn {{ color:#A84B05; font-size:20px; }}
</style></head><body><div class="wrap"><div class="frames">{imgs}</div><aside>
<h1>{E(meta['label'])}</h1><p class="pitch">{E(meta['pitch'])}</p>
<span class="tag">dial · {E(meta['dial'])}</span><span class="tag">prefers · {E(meta['prefers'])}</span><span class="tag">lang · {E(content_lang)}</span>{note}
<h3>Colour</h3>{sw}<h3>Type</h3><ul>{fl}</ul>
<h3>Transitions</h3><p class="pitch" style="font-size:20px">{E(meta['transitions']['grammar'])}; speaker changes: {E(', '.join(meta['transitions']['speaker']))}</p>
<h3>Fits</h3><p class="pitch" style="font-size:20px">{E(' · '.join(meta['fits']))}</p>
<h3>Don't</h3><ul style="font-size:18px">{''.join(f'<li>{E(x)}</li>' for x in meta['dont'][:2])}</ul>
</aside></div></body></html>"""


def grid_html(rows: list[tuple[dict, dict[str, pathlib.Path]]]) -> str:
    r = "".join(f"""<div class="row"><div class="lab"><b>{E(m['label'])}</b><span>made for {E(m['dial'])} · shown as {E(m['_shown'])}</span></div>
      {''.join(f'<img src="{s[k].as_uri()}">' for k in ('cover', 'signature', 'data'))}</div>""" for m, s in rows)
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
body {{ margin:0; width:2400px; background:#ECECEA; font-family: system-ui, sans-serif; padding:40px; box-sizing:border-box; }}
.row {{ display:grid; grid-template-columns: 260px 1fr 1fr 1fr; gap:20px; align-items:center; margin-bottom:24px; }}
.lab b {{ display:block; font-size:30px; letter-spacing:-.01em; }} .lab span {{ font: 18px ui-monospace, monospace; color:#6A6E78; }}
img {{ width:100%; border-radius:10px; box-shadow: 0 6px 24px rgb(0 0 0/.14); display:block; }}
</style></head><body>{r}</body></html>"""


def merge(base: dict, over: dict) -> dict:
    out = dict(base)
    for k, v in over.items():
        out[k] = merge(base[k], v) if isinstance(v, dict) and isinstance(base.get(k), dict) else v
    return out


async def render(packs: list[str], content: dict, out: pathlib.Path, style_override: str | None) -> list[pathlib.Path]:
    out.mkdir(parents=True, exist_ok=True)
    made, rows = [], []
    lang = content.get("lang", "en")
    async with async_playwright() as pw:
        br = await pw.chromium.launch()
        pg = await br.new_page(viewport={"width": 1920, "height": 1080}, device_scale_factor=1)
        for name in packs:
            pack = ASSETS / "packs" / name
            meta = json.loads((pack / "pack.json").read_text(encoding="utf-8"))
            fonts = json.loads((pack / "fonts.json").read_text(encoding="utf-8"))
            bad = [f["family"] for f in fonts["faces"].values() if f.get("local_text", True) and not f.get("coverage", {}).get("langs", {}).get(lang, False)]
            if bad:
                print(f"skip {name}: {', '.join(bad)} fail {lang}")
                continue
            style = style_override or meta["dial"]
            links = font_links(fonts)
            dark_content = style == "showcase" and meta["prefers"] == "dark" and meta["darkTheme"]
            d = out / name
            d.mkdir(exist_ok=True)
            frames = {
                "cover": (cover(content, name), dark_content),
                "signature": (signature(content, name, meta["signature"], hero=dark_content), dark_content),
                "data": (data_scene(content, name), dark_content),
            }
            shots = {}
            for k, (body, dark) in frames.items():
                f = d / f"{k}.html"
                f.write_text(page(pack, body, dark, style, links), encoding="utf-8")
                await pg.goto(f.as_uri())
                await pg.evaluate("document.fonts.ready")
                await pg.wait_for_timeout(150)
                await pg.evaluate(FIT_JS)
                shots[k] = d / f"{k}.png"
                await pg.screenshot(path=str(shots[k]))
            sh = out / f"{name}.html"
            sh.write_text(sheet_html(pack, meta, fonts, shots, style, lang), encoding="utf-8")
            sp = await br.new_page(viewport={"width": 2400, "height": 1000}, device_scale_factor=1)
            await sp.goto(sh.as_uri())
            await sp.screenshot(path=str(out / f"{name}.png"), full_page=True)
            await sp.close()
            made.append(out / f"{name}.png")
            rows.append(({**meta, "_shown": style}, shots))
            print(f"ok   {name}: {out / (name + '.png')}")
        if rows:
            g = out / "grid.html"
            g.write_text(grid_html(rows), encoding="utf-8")
            gp = await br.new_page(viewport={"width": 2400, "height": 800}, device_scale_factor=1)
            await gp.goto(g.as_uri())
            await gp.screenshot(path=str(out / "grid.png"), full_page=True)
            made.append(out / "grid.png")
            print(f"ok   grid: {out / 'grid.png'}")
        await br.close()
    return made


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--packs", required=True, help="comma list, 2-3 recommended (or 'all')")
    ap.add_argument("--content", help="JSON with the deck's title, signature points and numbers")
    ap.add_argument("--out", default="moodboard")
    ap.add_argument("--style", choices=["academic", "balanced", "showcase"], help="show every pack under this dial")
    a = ap.parse_args()
    packs = sorted(p.name for p in (ASSETS / "packs").iterdir() if (p / "pack.json").exists()) if a.packs == "all" else a.packs.split(",")
    content = merge(DEFAULT, json.loads(pathlib.Path(a.content).read_text(encoding="utf-8"))) if a.content else DEFAULT
    made = asyncio.run(render(packs, content, pathlib.Path(a.out).resolve(), a.style))
    return 0 if made else 1


if __name__ == "__main__":
    sys.exit(main())

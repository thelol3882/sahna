"""Wow check: find scenes that still look like classic slides, wash out on a projector, or break the dial.

    python wow_check.py [--html dist-single/index.html] [--out wow/] [--thresholds my.json] [--style academic]

Runs on the built deck through the starter's __deck API: every scene (main + backup) at its END state, measured
inside its [data-scene] element (chrome and footer excluded) and on a screenshot. Writes:
  <out>/report.md      per-scene table + reasons + what to do
  <out>/report.json    raw metrics
  <out>/contact.png    contact sheet; red frame = classic-slide look, amber = contrast / dial warnings
Exit 1 if a scene is flagged "classic" (or --strict and any warning).

Heuristics (weights and limits in THRESHOLDS, override with --thresholds JSON):
  bullets       ≥3 stacked short lines (same x and size) starting with a bullet/dash/number or in <li>   hard
  text_stack    ≥4 stacked plain text lines without visuals of their own (not a table row)
  title_list    the biggest text sits in the top band and a bullet list / text stack fills the area below
  words         visible words in the scene (content scenes)
  text_area     % of the stage covered by text boxes
  visuals       distinct visual elements (svg, img, canvas, filled/bordered boxes ≥ 24 px)
  largest_type  biggest font size on the scene (px on the 1920 stage)
  empty_bottom  share of the content area (above the footer line) below the lowest element
  overlap       text boxes of different blocks that intersect (absolute layouts colliding)            warning
  contrast      every text box: computed colour vs the background sampled from the screenshot, WCAG ratio
                normal and after the projector simulation (colors.PROJECTOR)
  dial          DECK.style (html[data-style]): dark content scenes outside showcase, dark hero under academic,
                glass (backdrop-filter), infinite CSS animation or gradient text under academic
A scene is "classic" when the weighted score ≥ THRESHOLDS["classic_score"] or it has a hard flag.
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
import sys
from collections import Counter

from PIL import Image, ImageDraw, ImageFont

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from colors import lum, parse, projected_ratio, ratio  # noqa: E402

THRESHOLDS = {
    "classic_score": 3.0,
    "bullets_min_run": 3,          # lines
    "bullet_line_max_words": 16,
    "stack_min_run": 4,
    "title_top_band": 330,         # px from the top of the stage
    "words_warn": 70,              # content scenes
    "words_high": 110,
    "text_area_warn": 0.22,        # share of the stage
    "visuals_min": 2,
    "largest_type_min": 64,        # px
    "empty_bottom_max": 0.30,
    "footer_line": 1012,           # px: content area ends here
    "contrast_min": 4.5,           # WCAG for text < 24 px (or < 19 px bold)
    "contrast_min_large": 3.0,     # large text
    "projector_min": 3.0,          # after the projector simulation, body text
    "projector_min_large": 2.4,
    "dark_lum": 0.18,
    "dimmed_opacity": 0.6,         # text below this effective opacity is dimmed for focus: skipped by the contrast check
    "overlap_px": 6,               # text boxes of different blocks intersecting by more than this…
    "overlap_share": 0.4,          # …and by this share of the smaller box height (glyph boxes overhang tight line-heights)              # canvas luminance below this = a dark scene
    "weights": {"bullets": 3, "text_stack": 1.5, "title_list": 2, "words_warn": 1, "words_high": 2,
                "text_area": 1, "visuals": 1, "largest_type": 1, "empty_bottom": 1},
}

MEASURE_JS = r"""
(id) => {
  const root = document.querySelector(`[data-scene="${id}"]`);
  const stage = root.closest('.stage') || document.body;
  const sr = stage.getBoundingClientRect();
  const k = sr.width / 1920;
  const rel = (r) => ({ x: (r.left - sr.left) / k, y: (r.top - sr.top) / k, w: r.width / k, h: r.height / k });
  const op = (el) => { let o = 1; for (let e = el; e && e !== stage; e = e.parentElement) { const cs = getComputedStyle(e);
    if (cs.visibility === 'hidden' || cs.display === 'none') return 0; o *= parseFloat(cs.opacity); } return o; };
  const isInline = (cs) => cs.display.startsWith('inline'); // SplitText chars/words (inline-block) belong to their line's block
  const blockOf = (el) => { const odo = el.closest('.fx-odo'); if (odo) return odo; // odometer digit columns = one number
    for (let e = el; e && e !== root; e = e.parentElement) { if (!isInline(getComputedStyle(e))) return e; } return root; };
  // gradient ink (background-clip: text on the element or an ancestor, e.g. SplitText lines): no single colour to test
  const clipText = (el) => { for (let e = el; e && e !== stage; e = e.parentElement) { const c = getComputedStyle(e);
    if (c.backgroundClip === 'text' || c.webkitBackgroundClip === 'text') return true; } return false; };
  // text clipped away by an overflow viewport (odometer strips, scrolled code) is not on screen
  const clipRects = (el) => { const out = []; for (let e = el.parentElement; e && e !== stage; e = e.parentElement) {
    const c = getComputedStyle(e); if (c.overflow !== 'visible' || c.overflowX !== 'visible' || c.overflowY !== 'visible') out.push(rel(e.getBoundingClientRect())); } return out; };
  const clipTo = (r, cs) => { let { x, y } = r, x2 = r.x + r.w, y2 = r.y + r.h;
    for (const c of cs) { x = Math.max(x, c.x); y = Math.max(y, c.y); x2 = Math.min(x2, c.x + c.w); y2 = Math.min(y2, c.y + c.h); }
    return { x, y, w: x2 - x, h: y2 - y }; };
  // glyph boxes (font ascent + descent) overhang tight line-heights: measure the line box instead
  const lineBox = (r, el) => { const lh = parseFloat(getComputedStyle(el).lineHeight);
    return lh > 0 && r.h > lh ? { x: r.x, y: r.y + (r.h - lh) / 2, w: r.w, h: lh } : r; };
  // any CSS colour (oklab, color-mix, color()) → 'rgba(r, g, b, a)' through a 1×1 canvas
  const cv = document.createElement('canvas'); cv.width = cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const toRgb = (c) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data; return `rgba(${d[0]}, ${d[1]}, ${d[2]}, ${(d[3] / 255).toFixed(3)})`; };
  const ownBg = (el, stop) => { for (let e = el; e && e !== root; e = e.parentElement) {
      const c = getComputedStyle(e).backgroundColor;
      if (c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') { const rgb = toRgb(c); if (parseFloat(rgb.split(',')[3]) >= 0.95) return rgb; }
      if (e === stop) break; }
    return null; };
  // ---- text blocks
  const blocks = new Map();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.textContent.replace(/\s+/g, ' ').trim();
    if (!t) continue;
    const el = n.parentElement;
    if (op(el) < 0.05) continue;
    const range = document.createRange(); range.selectNodeContents(n);
    const clips = clipRects(n.parentElement);
    const rects = [...range.getClientRects()].map(rel).map(r => clipTo(lineBox(r, n.parentElement), clips)).filter(r => r.w > 1 && r.h > 1 && r.x < 1920 && r.y < 1080 && r.x + r.w > 0 && r.y + r.h > 0);
    if (!rects.length) continue;
    const b = blockOf(el);
    const cs = getComputedStyle(el);
    // glyph boxes (font ascent + descent) overhang tight line-heights: measure the line box instead
    const lh = parseFloat(cs.lineHeight);
    if (lh > 0) for (const r of rects) if (r.h > lh) { r.y += (r.h - lh) / 2; r.h = lh; }
    if (!blocks.has(b)) blocks.set(b, { text: '', rects: [], size: 0, weight: 400, color: cs.color, li: !!b.closest('li'), el: b, colors: [] });
    const B = blocks.get(b);
    B.text += (B.text ? ' ' : '') + t;
    B.rects.push(...rects);
    const fs = parseFloat(cs.fontSize);
    if (fs > B.size) { B.size = fs; B.weight = parseInt(cs.fontWeight) || 400; B.color = cs.color; B.font = cs.fontFamily.split(',')[0].replace(/"/g, ''); }
    B.colors.push({ color: toRgb(cs.color), size: fs, weight: parseInt(cs.fontWeight) || 400, rects, opacity: op(el),
      gradient: clipText(el),
      // SVG labels with a paint-order halo (map pins, chart labels) sit on their own stroke colour
      // the text's own painted background (badges, chips, highlighted rows) beats the ring sample
      ownBg: ownBg(el, b),
      halo: (el instanceof SVGElement && cs.paintOrder.startsWith('stroke') && parseFloat(cs.strokeWidth) >= 3) ? toRgb(cs.stroke) : null });
  }
  const out = [];
  for (const B of blocks.values()) {
    const xs = B.rects.map(r => r.x), ys = B.rects.map(r => r.y);
    const x = Math.min(...xs), y = Math.min(...ys);
    const x2 = Math.max(...B.rects.map(r => r.x + r.w)), y2 = Math.max(...B.rects.map(r => r.y + r.h));
    B.text = (B.el.innerText || B.text).replace(/\s+/g, ' ').trim(); // SplitText: one text node per char
    const before = getComputedStyle(B.el, '::before').content;
    const marker = B.li || /^[•\-–—·▪►*✓→◦●○■□]\s?/.test(B.text) || /^\d{1,2}[.)]\s/.test(B.text)
      || (before && before !== 'none' && before !== 'normal' && before !== '""' && before.length <= 4);
    const lines = new Set(B.rects.map(r => Math.round(r.y / 4))).size;
    out.push({ text: B.text.slice(0, 120), words: B.text.split(/\s+/).filter(Boolean).length, x, y, w: x2 - x, h: y2 - y,
      size: B.size, weight: B.weight, font: B.font, marker, lines, runs: B.colors });
  }
  // ---- visual elements (own fill, border, shadow, media), deduplicated by nesting
  const visuals = [];
  for (const el of root.querySelectorAll('*')) {
    if (op(el) < 0.05) continue;
    const cs = getComputedStyle(el);
    const r = rel(el.getBoundingClientRect());
    if (r.w < 24 || r.h < 24 || r.x > 1920 || r.y > 1080) continue;
    if (r.w > 1800 && r.h > 1000) continue; // full-stage layers (texture, backgrounds)
    const tag = el.tagName.toLowerCase();
    const media = ['svg', 'img', 'canvas', 'video', 'picture'].includes(tag);
    if (el.closest('svg') && tag !== 'svg') continue;
    const fill = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.backgroundImage !== 'none' || cs.maskImage !== 'none' || (cs.webkitMaskImage && cs.webkitMaskImage !== 'none');
    const border = ['Top', 'Right', 'Bottom', 'Left'].some(s => parseFloat(cs['border' + s + 'Width']) > 0 && !cs['border' + s + 'Color'].endsWith(', 0)'));
    const shadow = cs.boxShadow !== 'none';
    if (media || fill || border || shadow) visuals.push({ tag, ...r, media });
  }
  const distinct = visuals.filter((v, i) => !visuals.some((o, j) => j < i && v.x >= o.x - 1 && v.y >= o.y - 1 && v.x + v.w <= o.x + o.w + 1 && v.y + v.h <= o.y + o.h + 1 && !(o.media) && v.media === false && (v.w * v.h) > 0.8 * (o.w * o.h)));
  // ---- dial signals
  let glass = 0, infinite = 0, gradientText = 0;
  for (const el of root.querySelectorAll('*')) {
    if (op(el) < 0.05) continue;
    const cs = getComputedStyle(el);
    if ((cs.backdropFilter && cs.backdropFilter !== 'none') || (cs.webkitBackdropFilter && cs.webkitBackdropFilter !== 'none')) glass++;
    if (cs.animationName !== 'none' && cs.animationIterationCount === 'infinite') infinite++;
    if (cs.backgroundClip === 'text' || cs.webkitBackgroundClip === 'text') gradientText++;
  }
  const rcs = getComputedStyle(root);
  return { blocks: out, visuals: distinct.map(v => ({ tag: v.tag, x: v.x, y: v.y, w: v.w, h: v.h })), glass, infinite, gradientText,
    hero: root.classList.contains('hero'), bg: rcs.backgroundColor,
    style: document.documentElement.dataset.style || null, pack: document.documentElement.dataset.pack || null,
    dark: document.documentElement.classList.contains('dark') };
}
"""


def sample_bg(img: Image.Image, r: dict, pad: int = 6) -> tuple[int, int, int]:
    """Most common colour on a ring `pad` px around a text box (the text itself is excluded)."""
    x0, y0 = max(0, int(r["x"]) - pad), max(0, int(r["y"]) - pad)
    x1, y1 = min(img.width - 1, int(r["x"] + r["w"]) + pad), min(img.height - 1, int(r["y"] + r["h"]) + pad)
    px = img.load()
    pts = []
    step = max(1, (x1 - x0) // 60)
    for x in range(x0, x1 + 1, step):
        pts += [px[x, y0], px[x, y1]]
    step = max(1, (y1 - y0) // 20)
    for y in range(y0, y1 + 1, step):
        pts += [px[x0, y], px[x1, y]]
    q = Counter((p[0] // 8, p[1] // 8, p[2] // 8) for p in pts)
    (qr, qg, qb), _ = q.most_common(1)[0]
    return (qr * 8 + 4, qg * 8 + 4, qb * 8 + 4)


def analyse(m: dict, img: Image.Image, T: dict, meta: dict, style: str | None) -> dict:
    W = T["weights"]
    blocks = [b for b in m["blocks"] if b["y"] < T["footer_line"]]
    hero = m["hero"]
    reasons, warn, score, hard = [], [], 0.0, False

    # tabular blocks: another block sits on the same row at another x → table/grid, not a list
    def tabular(b):
        cy = b["y"] + b["h"] / 2
        return any(o is not b and abs((o["y"] + o["h"] / 2) - cy) < 10 and abs(o["x"] - b["x"]) > 40 for o in blocks)

    # vertical runs: same left x (±8), same font size (±1), next one starts within 2.6 × size
    runs, cur = [], []
    for b in sorted(blocks, key=lambda b: (round(b["x"] / 8), round(b["size"]), b["y"])):
        if cur and abs(b["x"] - cur[-1]["x"]) <= 8 and abs(b["size"] - cur[-1]["size"]) <= 1 and 0 <= b["y"] - (cur[-1]["y"] + cur[-1]["h"]) <= 2.6 * b["size"]:
            cur.append(b)
        else:
            if len(cur) > 1:
                runs.append(cur)
            cur = [b]
    if len(cur) > 1:
        runs.append(cur)
    bullet_runs = [r for r in runs if len(r) >= T["bullets_min_run"] and sum(b["marker"] for b in r) >= max(2, len(r) // 2 + 1)
                   and all(b["words"] <= T["bullet_line_max_words"] * 2 for b in r)]
    stack_runs = [r for r in runs if r not in bullet_runs and len(r) >= T["stack_min_run"] and not any(tabular(b) for b in r)
                  and all(b["words"] <= T["bullet_line_max_words"] for b in r)]
    if bullet_runs:
        n = max(len(r) for r in bullet_runs)
        reasons.append(f"bullet list ({n} lines)"); score += W["bullets"]; hard = True
    if stack_runs:
        reasons.append(f"stacked text lines ({max(len(r) for r in stack_runs)})"); score += W["text_stack"]

    words = sum(b["words"] for b in blocks)
    largest = max((b["size"] for b in blocks), default=0)
    top = max(blocks, key=lambda b: b["size"], default=None)
    lists = bullet_runs + stack_runs
    if top and top["y"] < T["title_top_band"] and lists and min(r[0]["y"] for r in lists) > top["y"] + top["h"] - 4 and not hero:
        reasons.append("title on top + list below"); score += W["title_list"]
    if not hero and not meta.get("appendix"):
        if words > T["words_high"]:
            reasons.append(f"{words} words"); score += W["words_high"]
        elif words > T["words_warn"]:
            reasons.append(f"{words} words"); score += W["words_warn"]
    area = sum(r["w"] * r["h"] for b in blocks for run in b["runs"] for r in run["rects"]) / (1920 * 1080)
    if area > T["text_area_warn"]:
        reasons.append(f"text covers {area:.0%} of the stage"); score += W["text_area"]
    nvis = len(m["visuals"])
    if not hero and nvis < T["visuals_min"]:
        reasons.append(f"{nvis} visual element(s)"); score += W["visuals"]
    if largest and largest < T["largest_type_min"]:
        reasons.append(f"largest type {largest:.0f} px"); score += W["largest_type"]
    bottoms = [b["y"] + b["h"] for b in blocks] + [v["y"] + v["h"] for v in m["visuals"] if v["y"] + v["h"] <= T["footer_line"] + 4]
    low = max(bottoms, default=0)
    empty = max(0.0, (T["footer_line"] - low) / T["footer_line"])
    if not hero and empty > T["empty_bottom_max"]:
        reasons.append(f"bottom {empty:.0%} empty"); score += W["empty_bottom"]

    # text on text: two different text blocks whose glyph boxes intersect (absolute layouts that collide
    # once a pack's display size wraps a title onto one more line)
    def boxes(b):
        return [r for run in b["runs"] for r in run["rects"]]
    hits = 0
    for ai, A in enumerate(blocks):
        for B in blocks[ai + 1:]:
            if any(min(p["x"] + p["w"], q["x"] + q["w"]) - max(p["x"], q["x"]) > T["overlap_px"] and
                   min(p["y"] + p["h"], q["y"] + q["h"]) - max(p["y"], q["y"]) > max(T["overlap_px"], T["overlap_share"] * min(p["h"], q["h"]))
                   for p in boxes(A) for q in boxes(B)):
                hits += 1
                if hits == 1:
                    first = (A["text"][:24], B["text"][:24])
    if hits:
        warn.append(f"overlap: {hits} text collision(s), e.g. '{first[0]}' × '{first[1]}'")

    # contrast on the screenshot (normal and projector)
    rgbimg = img.convert("RGB")
    worst = None
    low_contrast = []
    dimmed = 0
    for b in blocks:
        for run in b["runs"]:
            if run["gradient"] or not run["rects"]:
                continue
            if run["opacity"] < T["dimmed_opacity"]:
                dimmed += 1  # dimmed on purpose (focus on another part): not a wash-out
                continue
            # sample around the whole block (a ring around one SplitText char lands on its neighbours)
            bg = sample_bg(rgbimg, b)
            if run.get("ownBg"):
                try:
                    bg = parse(run["ownBg"], bg)
                except ValueError:
                    pass
            if run.get("halo"):
                try:
                    bg = parse(run["halo"], bg)
                except ValueError:
                    pass
            try:
                fg = parse(run["color"], bg)
            except ValueError:
                continue
            if ratio(fg, bg) < 1.15:  # the ring still hit glyphs: go wider
                bg = sample_bg(rgbimg, b, 28)
                fg = parse(run["color"], bg)
            if run["opacity"] < 1:
                fg = tuple(run["opacity"] * f + (1 - run["opacity"]) * g for f, g in zip(fg, bg))
            large = run["size"] >= 24 or (run["size"] >= 18.6 and run["weight"] >= 700)
            cr, pr = ratio(fg, bg), projected_ratio(fg, bg)
            need, needp = (T["contrast_min_large"], T["projector_min_large"]) if large else (T["contrast_min"], T["projector_min"])
            if worst is None or pr < worst[1]:
                worst = (cr, pr, b["text"][:40])
            if cr < need or pr < needp:
                low_contrast.append(f"'{b['text'][:30]}' {cr:.1f}:1 → projector {pr:.1f}:1 ({run['size']:.0f}px)")
    if low_contrast:
        warn.append(f"contrast: {len(low_contrast)} text box(es) wash out, e.g. {low_contrast[0]}")

    # dial
    canvas = parse(m["bg"]) if m["bg"] and not m["bg"].endswith(", 0)") else sample_bg(rgbimg, {"x": 4, "y": 4, "w": 40, "h": 40})
    dark = lum(canvas) < T["dark_lum"]
    if style:
        if dark and not hero and style != "showcase":
            warn.append(f"dial: dark content scene under {style} (darkContent is showcase only)")
        if dark and hero and style == "academic":
            warn.append("dial: dark hero under academic")
        if style == "academic":
            if m["glass"]:
                warn.append(f"dial: glass (backdrop-filter) ×{m['glass']} under academic")
            if m["infinite"]:
                warn.append(f"dial: {m['infinite']} endless CSS animation(s) under academic")
            if m["gradientText"]:
                warn.append("dial: gradient text under academic")
        if style == "showcase" and not hero and nvis < 2 and largest < 80:
            warn.append("dial: plain scene under showcase (no visual hook, small type)")

    classic = hard or score >= T["classic_score"]
    return {"classic": classic, "score": round(score, 2), "reasons": reasons, "warnings": warn, "words": words,
            "text_area": round(area, 3), "visuals": nvis, "largest_type": largest, "empty_bottom": round(empty, 3),
            "worst_contrast": worst, "dark": dark, "hero": hero, "bullet_runs": len(bullet_runs), "stack_runs": len(stack_runs)}


def contact(rows: list[dict], path: pathlib.Path, cols: int = 3) -> None:
    tw, th, pad, cap = 640, 360, 24, 120
    n = len(rows)
    r = (n + cols - 1) // cols
    sheet = Image.new("RGB", (cols * (tw + pad) + pad, r * (th + cap + pad) + pad), (236, 236, 234))
    d = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("DejaVuSans.ttf", 17)
        bold = ImageFont.truetype("DejaVuSans-Bold.ttf", 19)
    except OSError:
        font = bold = ImageFont.load_default()
    for i, row in enumerate(rows):
        x = pad + (i % cols) * (tw + pad)
        y = pad + (i // cols) * (th + cap + pad)
        sheet.paste(Image.open(row["png"]).convert("RGB").resize((tw, th)), (x, y))
        a = row["a"]
        col = (214, 40, 40) if a["classic"] else (226, 150, 20) if a["warnings"] else None
        if col:
            d.rectangle([x - 5, y - 5, x + tw + 4, y + th + 4], outline=col, width=8)
        status = "CLASSIC SLIDE" if a["classic"] else "check" if a["warnings"] else "ok"
        d.text((x, y + th + 10), f"{row['n']:02d} {row['id']}  ·  {status}  ·  score {a['score']}", fill=col or (40, 40, 40), font=bold)
        lines = (a["reasons"] + a["warnings"])[:4]
        for k, t in enumerate(lines):
            d.text((x, y + th + 36 + k * 20), ("• " + t)[:72], fill=(60, 60, 60), font=font)
    sheet.save(path)


def report_md(rows: list[dict], T: dict, style: str | None, pack: str | None) -> str:
    out = ["# Wow check", "", f"DECK.style: **{style or 'unknown'}** · pack: **{pack or 'none'}** · thresholds: classic score ≥ {T['classic_score']}", "",
           "| # | scene | verdict | score | words | text % | visuals | largest px | empty bottom | worst contrast (normal → projector) | reasons / warnings |",
           "|---|---|---|---|---|---|---|---|---|---|---|"]
    for r in rows:
        a = r["a"]
        verdict = "**CLASSIC**" if a["classic"] else "check" if a["warnings"] else "ok"
        wc = f"{a['worst_contrast'][0]:.1f} → {a['worst_contrast'][1]:.1f}" if a["worst_contrast"] else "-"
        out.append(f"| {r['n']:02d} | {r['id']}{' (backup)' if r['appendix'] else ''} | {verdict} | {a['score']} | {a['words']} | {a['text_area']:.0%} | {a['visuals']} | "
                   f"{a['largest_type']:.0f} | {a['empty_bottom']:.0%} | {wc} | {'; '.join(a['reasons'] + a['warnings']) or '-'} |")
    flagged = [r for r in rows if r["a"]["classic"]]
    out += ["", f"**{len(flagged)} classic-looking scene(s)**, {sum(bool(r['a']['warnings']) for r in rows)} with warnings.", ""]
    if flagged:
        out += ["## What to do", "",
                "- Bullet list / stacked lines → one statement title + ONE visual that carries the list: cards in a row, a diagram, a timeline, a big number per item; reveal per step.",
                "- Too many words → move them to the speaker notes; keep ≤ 5-7 words per item on the slide.",
                "- Title on top + list below → make the title the image (display size) or split the list over steps/scenes.",
                "- Empty bottom → enlarge the content (type, chart) instead of leaving the lower third empty.",
                "- Contrast → use ink / ink-2 tokens for text; muted only ≥ 4.5:1 after the projector simulation.", ""]
    return "\n".join(out)


async def run(target: str | None, out: pathlib.Path, T: dict, style_override: str | None, only: list[str] | None) -> list[dict]:
    from deckpage import deck_info, deck_url, open_deck, show
    out.mkdir(parents=True, exist_ok=True)
    rows = []
    async with open_deck(deck_url(target)) as pg:
        info = await deck_info(pg)
        await pg.evaluate("__deck.setExport(true)")
        for n, i in enumerate(info["order"], 1):
            sid = info["ids"][i]
            if only and sid not in only:
                continue
            await show(pg, i, "end", 500)
            m = await pg.evaluate(MEASURE_JS, sid)
            png = out / f"{n:02d}-{sid}.png"
            await pg.screenshot(path=str(png))
            style = style_override or m["style"]
            a = analyse(m, Image.open(png), T, {"appendix": info["appendix"][i]}, style)
            rows.append({"n": n, "id": sid, "appendix": info["appendix"][i], "png": png, "a": a, "metrics": m, "style": style, "pack": m["pack"]})
            tag = "CLASSIC" if a["classic"] else "check  " if a["warnings"] else "ok     "
            print(f"{tag} {n:02d} {sid:<22} score {a['score']:<4} {'; '.join(a['reasons'] + a['warnings'])}")
    return rows


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--html", help="built deck (default: <project>/dist-single/index.html) or an http URL")
    ap.add_argument("--project", default=".", help="deck project (for the default --html)")
    ap.add_argument("--out", default="wow")
    ap.add_argument("--thresholds", help="JSON file overriding THRESHOLDS keys")
    ap.add_argument("--style", choices=["academic", "balanced", "showcase"], help="override DECK.style read from the page")
    ap.add_argument("--scenes", help="comma list of scene ids")
    ap.add_argument("--strict", action="store_true", help="exit 1 on warnings too")
    a = ap.parse_args()
    # use the project's own Playwright helpers if present (same open_deck as walk.py), else ours
    proj_scripts = pathlib.Path(a.project).resolve() / "scripts"
    sys.path.insert(0, str(proj_scripts if (proj_scripts / "deckpage.py").exists() else HERE))
    T = json.loads(json.dumps(THRESHOLDS))
    if a.thresholds:
        over = json.loads(pathlib.Path(a.thresholds).read_text(encoding="utf-8"))
        T["weights"].update(over.pop("weights", {}))
        T.update(over)
    html_path = a.html or str(pathlib.Path(a.project).resolve() / "dist-single" / "index.html")
    out = pathlib.Path(a.out).resolve()
    rows = asyncio.run(run(html_path, out, T, a.style, a.scenes.split(",") if a.scenes else None))
    if not rows:
        print("no scenes measured"); return 2
    contact(rows, out / "contact.png")
    (out / "report.md").write_text(report_md(rows, T, rows[0]["style"], rows[0]["pack"]), encoding="utf-8")
    (out / "report.json").write_text(json.dumps([{k: v for k, v in r.items() if k != "png"} | {"png": str(r["png"])} for r in rows], indent=1, default=str), encoding="utf-8")
    flagged = sum(r["a"]["classic"] for r in rows)
    warned = sum(bool(r["a"]["warnings"]) for r in rows)
    print(f"\n{flagged} classic, {warned} with warnings → {out / 'report.md'}, {out / 'contact.png'}")
    return 1 if flagged or (a.strict and warned) else 0


if __name__ == "__main__":
    sys.exit(main())

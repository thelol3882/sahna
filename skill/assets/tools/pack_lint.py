"""Check every style pack: complete token schema, fonts recorded and passing the talk language, WCAG contrast in
each look, and contrast after the projector simulation.

    python pack_lint.py [packs_dir] [--lang kk]

Exit 1 on any FAIL. WARN lines are advice (e.g. a dark look that a projector will wash out).
"""
from __future__ import annotations

import sys as _sys
for _stream in (_sys.stdout, _sys.stderr):  # a Windows console in cp1252 must not crash on arrows or Kazakh text
    try:
        _stream.reconfigure(errors="replace")
    except Exception:
        pass
import argparse
import json
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from colors import parse, projected_ratio, ratio  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
REQUIRED = ["--font-display", "--font-sans", "--font-mono", "--font-label", "--text-display", "--text-h1", "--text-h2", "--text-stat",
            "--text-body-l", "--text-body-m", "--text-label", "--label-case", "--radius-card", "--radius-chip", "--radius-frame",
            "--shadow-sm", "--shadow-lg", "--shadow-glow", "--card-bg", "--card-border", "--hero-bg", "--ease-enter", "--ease-move",
            "--duration-fast", "--duration-base", "--duration-slow"]

# (fg, bg, min normal, min after projector, what)
PAIRS = [
    ("ink", "canvas", 7.0, 4.5, "body text"),
    ("ink-2", "surface", 4.5, 3.0, "secondary text on cards"),
    ("muted", "canvas", 4.5, 3.0, "labels / muted"),
    ("muted", "surface", 4.5, 3.0, "labels on cards"),
    ("primary-ink", "canvas", 4.5, 3.0, "eyebrow / links"),
    ("on-primary", "primary", 4.5, 3.0, "text on primary"),
    ("on-accent", "accent", 4.5, 3.0, "text on accent"),
    ("hero-ink", "hero", 7.0, 4.5, "hero text"),
    ("hero-muted", "hero", 4.5, 3.0, "hero labels"),
    ("primary", "canvas", 3.0, 2.0, "primary as a mark (non-text)"),
]


def blocks(css: str) -> dict[str, dict[str, str]]:
    out = {}
    for name, body in re.findall(r"^(@theme static|\.dark[^{\n]*?)\s*\{([^}]*)\}", css, re.M):
        out["light" if name.startswith("@theme") else "dark"] = dict(re.findall(r"(--[\w-]+):\s*([^;]+);", body))
    return out


def lint(pack: pathlib.Path, lang: str) -> tuple[int, int]:
    fails = warns = 0
    meta = json.loads((pack / "pack.json").read_text(encoding="utf-8"))
    css = (pack / "theme.css").read_text(encoding="utf-8")
    b = blocks(css)
    light = b.get("light", {})
    for k in REQUIRED:
        if k not in light:
            print(f"FAIL {pack.name}: token {k} missing"); fails += 1
    fonts = json.loads((pack / "fonts.json").read_text(encoding="utf-8"))
    for role, f in fonts["faces"].items():
        cov = f.get("coverage")
        if not cov:
            print(f"FAIL {pack.name}: {role} {f['family']} has no coverage record (run fonts.py record)"); fails += 1
        elif f.get("local_text", True) and not cov["langs"].get(lang):
            print(f"FAIL {pack.name}: {role} {f['family']} misses {lang}: {cov['missing']}"); fails += 1
    looks = {"light": light}
    if "dark" in b:
        looks["dark"] = {**light, **b["dark"]}
    for look, tok in looks.items():
        col = lambda k: tok[f"--color-{k}"]  # noqa: E731
        canvas = parse(col("canvas"))
        for fg, bg, mn, mp, what in PAIRS:
            try:
                bgc = parse(col(bg), canvas)
                fgc = parse(col(fg), bgc)
            except (KeyError, ValueError) as e:
                print(f"FAIL {pack.name} {look}: {e}"); fails += 1; continue
            r, rp = ratio(fgc, bgc), projected_ratio(fgc, bgc)
            if r < mn:
                print(f"FAIL {pack.name} {look}: {fg} on {bg} = {r:.2f} < {mn} ({what})"); fails += 1
            elif rp < mp:
                # academic packs must survive the projector; elsewhere it is advice
                hard = meta["dial"] == "academic" or (look == "light" and not fg.startswith("hero"))
                tag = "FAIL" if hard else "WARN"
                print(f"{tag} {pack.name} {look}: {fg} on {bg} = {r:.2f}, projector {rp:.2f} < {mp} ({what})")
                fails += hard; warns += not hard
    print(f"{'ok  ' if not fails else 'FAIL'} {pack.name}: {len(looks)} look(s), dial {meta['dial']}, prefers {meta['prefers']}")
    return fails, warns


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("packs", nargs="?", default=str(ROOT / "packs"))
    ap.add_argument("--lang", default="kk")
    a = ap.parse_args()
    tf = tw = 0
    for p in sorted(pathlib.Path(a.packs).iterdir()):
        if (p / "pack.json").exists():
            f, w = lint(p, a.lang)
            tf += f; tw += w
    print(f"\n{tf} fail(s), {tw} warning(s)")
    return 1 if tf else 0


if __name__ == "__main__":
    sys.exit(main())

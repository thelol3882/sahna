"""Colour maths shared by pack_lint.py and wow_check.py: parsing, WCAG contrast, a projector simulation."""
from __future__ import annotations

import re

# Projector model (tunable). A classroom projector in a lit room: the black level rises (flare = share of white
# that lands on "black"), saturation drops and the image gets slightly darker overall.
PROJECTOR = {"flare": 0.06, "gain": 0.9, "saturation": 0.7}


def parse(c: str, over: tuple[float, float, float] | None = None) -> tuple[float, float, float]:
    """'#RRGGBB' / '#RGB' / 'rgb(r g b / a)' / 'rgb(r, g, b)' / 'rgba(...)' → (r, g, b) 0..255, alpha composited on `over`."""
    c = c.strip()
    if c.startswith("#"):
        h = c[1:]
        if len(h) == 3:
            h = "".join(ch * 2 for ch in h)
        return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]
    m = re.match(r"rgba?\(([^)]+)\)", c)
    if not m:
        raise ValueError(f"cannot parse colour {c!r}")
    parts = [p for p in re.split(r"[\s,/]+", m.group(1).strip()) if p]
    r, g, b = (float(x) for x in parts[:3])
    a = float(parts[3].rstrip("%")) / (100 if parts[3].endswith("%") else 1) if len(parts) > 3 else 1.0
    if a < 1 and over is not None:
        r, g, b = (a * x + (1 - a) * y for x, y in zip((r, g, b), over))
    return (r, g, b)


def _lin(v: float) -> float:
    v /= 255
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def lum(rgb) -> float:
    r, g, b = rgb
    return 0.2126 * _lin(r) + 0.7152 * _lin(g) + 0.0722 * _lin(b)


def ratio(a, b) -> float:
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def desaturate(rgb, s: float):
    y = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]
    return tuple(y + (x - y) * s for x in rgb)


def project(rgb, model: dict = PROJECTOR):
    """What a washed-out projector shows: less saturation, lower gain, raised black level (in linear light)."""
    r, g, b = desaturate(rgb, model["saturation"])
    out = []
    for v in (r, g, b):
        lin = _lin(v) * model["gain"] * (1 - model["flare"]) + model["flare"]
        out.append(255 * (12.92 * lin if lin <= 0.0031308 else 1.055 * lin ** (1 / 2.4) - 0.055))
    return tuple(out)


def projected_ratio(a, b, model: dict = PROJECTOR) -> float:
    return ratio(project(a, model), project(b, model))

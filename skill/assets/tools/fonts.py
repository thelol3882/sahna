"""Fontsource helper: fetch packages into a cache and verify glyph coverage with fonttools.

    python fonts.py check onest unbounded jetbrains-mono          # table: which language sets each font covers
    python fonts.py check onest --lang kk --weights 400,700       # exit 1 if a face misses a Kazakh glyph
    python fonts.py fetch onest                                   # → cache dir, prints the package path
    python fonts.py record ../packs/<pack>                        # re-check a pack's fonts.json and write coverage into it

Coverage is the union of the cmaps of the subset files (latin, latin-ext, cyrillic, cyrillic-ext) for each weight:
Fontsource splits one family into subsets by unicode-range, the browser loads whichever it needs.
Needs: npm (registry access), pip install fonttools brotli.
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
import os
import pathlib
import re
import subprocess
import sys
import tarfile

from fontTools.ttLib import TTFont

CACHE = pathlib.Path(os.environ.get("AWD_FONT_CACHE", pathlib.Path.home() / ".cache" / "awd-fonts"))

# Language sets. "kk" = Kazakh Cyrillic (current) + the 2021 Kazakh Latin letters; "ru" = Russian; "en" = English.
SETS: dict[str, str] = {
    "latin": "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,:;!?()[]%&@#+-=/'\"",
    "latin-ext": "ÄäĞğĪīÑñÖöŞşŪūÜüİıÇçŁłŻżŠšČčŘřĚěÁáÉéÍíÓóÚú",
    "cyrillic": "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя",
    "kazakh": "ӘәҒғҚқҢңӨөҰұҮүҺһІі",
    "punct": "«»—–…№“”‘’•·×",
}
OPTIONAL = {"tenge": "₸", "arrows": "→←"}  # reported, never a reason to reject
LANGS = {
    "en": ["latin", "punct"],
    "ru": ["latin", "cyrillic", "punct"],
    "kk": ["latin", "latin-ext", "cyrillic", "kazakh", "punct"],
}
SUBSETS = ["latin", "latin-ext", "cyrillic", "cyrillic-ext"]


def pkg_dir(name: str) -> pathlib.Path:
    """npm pack @fontsource/<name> (or a full @scope/name) into the cache once; return the package folder."""
    full = name if name.startswith("@") else f"@fontsource/{name}"
    slug = full.lstrip("@").replace("/", "-")
    dest = CACHE / slug
    if (dest / "package.json").exists():
        return dest
    CACHE.mkdir(parents=True, exist_ok=True)
    out = subprocess.run(["npm", "pack", full, "--silent", "--pack-destination", str(CACHE)],
                         check=True, capture_output=True, text=True).stdout.strip().splitlines()[-1]
    tgz = CACHE / out
    dest.mkdir(parents=True, exist_ok=True)
    with tarfile.open(tgz) as tf:
        for m in tf.getmembers():
            if not m.name.startswith("package/") or ".." in m.name:
                continue
            m.name = m.name[len("package/"):]
            tf.extract(m, dest, filter="data")
    tgz.unlink()
    return dest


def font_id(d: pathlib.Path) -> str:
    return json.loads((d / "package.json").read_text(encoding="utf-8"))["name"].split("/")[-1]


def weights_of(d: pathlib.Path) -> list[int]:
    ws = {int(m.group(1)) for f in (d / "files").glob("*-normal.woff2") if (m := re.search(r"-(\d{3})-normal\.woff2$", f.name))}
    return sorted(ws)


def subsets_of(d: pathlib.Path) -> list[str]:
    fid = font_id(d)
    found = set()
    for f in (d / "files").glob(f"{fid}-*-400-normal.woff2"):
        found.add(f.name[len(fid) + 1:-len("-400-normal.woff2")])
    if not found:  # no 400: take any weight
        for f in (d / "files").glob(f"{fid}-*-normal.woff2"):
            found.add(re.sub(r"-\d{3}-normal\.woff2$", "", f.name[len(fid) + 1:]))
    return sorted(found)


def cmap_union(d: pathlib.Path, weight: int) -> set[int]:
    fid = font_id(d)
    cps: set[int] = set()
    for sub in SUBSETS:
        f = d / "files" / f"{fid}-{sub}-{weight}-normal.woff2"
        if f.exists():
            cps |= set(TTFont(f).getBestCmap().keys())
    return cps


def coverage(name: str, weights: list[int] | None = None) -> dict:
    d = pkg_dir(name)
    ws = weights or weights_of(d)
    have = [w for w in ws if w in weights_of(d)]
    res: dict = {"package": f"@fontsource/{font_id(d)}", "version": json.loads((d / "package.json").read_text(encoding="utf-8"))["version"],
                 "subsets": subsets_of(d), "weights_available": weights_of(d), "checked_weights": have, "sets": {}, "missing": {}}
    if not have:
        res["error"] = f"none of the weights {ws} exist"
        return res
    for key, chars in {**SETS, **OPTIONAL}.items():
        miss = sorted({c for w in have for c in chars if ord(c) not in cmap_union(d, w)})
        res["sets"][key] = not miss
        if miss:
            res["missing"][key] = "".join(miss)
    res["langs"] = {lang: all(res["sets"][s] for s in sets) for lang, sets in LANGS.items()}
    return res


def table(rows: list[dict]) -> str:
    keys = list(SETS) + list(OPTIONAL)
    out = ["| font | " + " | ".join(keys) + " | en | ru | kk |", "|" + "---|" * (len(keys) + 4)]
    for r in rows:
        if "error" in r:
            out.append(f"| {r['package']} | {r['error']} |")
            continue
        cells = ["yes" if r["sets"][k] else f"NO ({r['missing'][k][:8]})" for k in keys]
        langs = ["yes" if r["langs"][l] else "NO" for l in ("en", "ru", "kk")]
        out.append(f"| {r['package']} | " + " | ".join(cells + langs) + " |")
    return "\n".join(out)


def record(pack: pathlib.Path, lang: str | None) -> int:
    """Re-check every face of a pack's fonts.json, write the coverage back, exit 1 if a face fails pack.lang."""
    fj = pack / "fonts.json"
    data = json.loads(fj.read_text(encoding="utf-8"))
    want = lang or data.get("lang", "kk")
    bad = 0
    for role, face in data["faces"].items():
        cov = coverage(face["package"].split("/")[-1], face["weights"])
        face["version"] = cov["version"]
        face["coverage"] = {"sets": cov["sets"], "missing": cov["missing"], "langs": cov["langs"]}
        ok = cov["langs"].get(want, False)
        if face.get("local_text", True) and not ok:
            bad += 1
            print(f"FAIL {pack.name}: {role} {face['family']} misses {want}: {cov['missing']}")
        else:
            note = "" if ok else f" (no {want}: code/English only)"
            print(f"ok   {pack.name}: {role} {face['family']}{note}")
    fj.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return 1 if bad else 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["check", "fetch", "record"])
    ap.add_argument("names", nargs="+")
    ap.add_argument("--lang", choices=list(LANGS), help="exit 1 if a font fails this language")
    ap.add_argument("--weights", help="comma list, default all")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    if a.cmd == "fetch":
        for n in a.names:
            print(pkg_dir(n))
        return 0
    if a.cmd == "record":
        return max(record(pathlib.Path(n), a.lang) for n in a.names)
    ws = [int(w) for w in a.weights.split(",")] if a.weights else None
    rows = [coverage(n, ws) for n in a.names]
    print(json.dumps(rows, indent=2, ensure_ascii=False) if a.json else table(rows))
    if a.lang:
        return 0 if all(r.get("langs", {}).get(a.lang) for r in rows) else 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

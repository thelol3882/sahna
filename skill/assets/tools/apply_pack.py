"""Apply a style pack to a deck project made from the starter.

    python apply_pack.py <pack> [--project .] [--style academic|balanced|showcase] [--lang kk] [--install]

Writes:
  src/theme.css        ← packs/<pack>/theme.css (tokens, light + optional .dark)
  src/art/pack.css     ← packs/<pack>/pack.css (pk-* utilities, dial-gated)
  src/art/fonts.css    ← @fontsource imports for every face × weight × subset in fonts.json
  src/art/pack.ts      ← PACK: name, prefers, dial, GSAP motion, faces to preload
  package.json         ← @fontsource/* dependencies of the pack (other @fontsource deps removed unless imported elsewhere in src/)
  src/deck/config.ts   ← DECK.style (pack default or --style), DECK.darkTheme (true if the pack has a dark look),
                         DECK.locale (only with --lang)
Refuses a pack whose local-text faces fail --lang (default: the pack's fonts.json lang). Then: npm install (or --install).
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
import shutil
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
PACKS = HERE.parent / "packs"
sys.path.insert(0, str(HERE))


def subset_files(package: str, weights: list[int], subsets: list[str]) -> list[str]:
    """CSS entry points that exist in the package (checked in the font cache when it is reachable)."""
    try:
        from fonts import pkg_dir
        d = pkg_dir(package.split("/")[-1])
        return [f"{package}/{s}-{w}.css" for w in weights for s in subsets if (d / f"{s}-{w}.css").exists()]
    except Exception as e:  # offline: trust fonts.json
        print(f"note: cannot check {package} files ({e}); writing every subset")
        return [f"{package}/{s}-{w}.css" for w in weights for s in subsets]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pack", help="pack name (packs/<name>) or a path to a pack folder")
    ap.add_argument("--project", default=".", help="deck project root (has src/theme.css)")
    ap.add_argument("--style", choices=["academic", "balanced", "showcase"], help="override the pack's recommended dial")
    ap.add_argument("--lang", choices=["en", "ru", "kk"])
    ap.add_argument("--install", action="store_true", help="run npm install afterwards")
    a = ap.parse_args()

    pack = pathlib.Path(a.pack) if pathlib.Path(a.pack).is_dir() else PACKS / a.pack
    if not (pack / "pack.json").exists():
        print(f"no pack at {pack}; available: {', '.join(sorted(p.name for p in PACKS.iterdir() if (p / 'pack.json').exists()))}")
        return 2
    proj = pathlib.Path(a.project).resolve()
    src = proj / "src"
    for need in ("theme.css", "main.tsx", "deck/config.ts"):
        if not (src / need).exists():
            print(f"{src / need} missing: is {proj} a starter project?")
            return 2
    main_tsx = (src / "main.tsx").read_text(encoding="utf-8")
    if "./art/pack" not in main_tsx:
        print("src/main.tsx does not import ./art/pack: is this a project made from assets/starter/? (src/art/ and the PACK import come with it)")
        return 2

    meta = json.loads((pack / "pack.json").read_text(encoding="utf-8"))
    fonts = json.loads((pack / "fonts.json").read_text(encoding="utf-8"))
    lang = a.lang or fonts.get("lang", "kk")
    style = a.style or meta["dial"]

    # 1. fonts must cover the talk language
    bad = [f"{role}: {f['family']} misses {f.get('coverage', {}).get('missing')}" for role, f in fonts["faces"].items()
           if f.get("local_text", True) and not f.get("coverage", {}).get("langs", {}).get(lang)]
    if bad:
        print(f"refused: {pack.name} fails {lang}:\n  " + "\n  ".join(bad))
        return 1

    # 2. tokens and utilities
    (src / "art").mkdir(exist_ok=True)
    shutil.copyfile(pack / "theme.css", src / "theme.css")
    shutil.copyfile(pack / "pack.css", src / "art" / "pack.css")

    # 3. fonts.css + faces to preload
    imports, faces, deps = [], [], {}
    for role, f in fonts["faces"].items():
        deps[f["package"]] = f"^{f.get('version', '5.0.0')}"
        for line in subset_files(f["package"], f["weights"], f["subsets"]):
            if line not in imports:
                imports.append(line)
        for w in f["weights"]:
            fc = f"{w} 1em '{f['family']}'"
            if fc not in faces:
                faces.append(fc)
    (src / "art" / "fonts.css").write_text(
        f"/* Written by apply_pack.py from packs/{pack.name}/fonts.json (coverage checked for {lang}). */\n"
        + "".join(f'@import "{i}";\n' for i in imports), encoding="utf-8")

    # 4. pack.ts
    pack_ts = (
        f"/** The style pack in use: written by tools/apply_pack.py from packs/{pack.name}. */\n"
        "export const PACK = {\n"
        f"  name: {json.dumps(pack.name)},\n  label: {json.dumps(meta['label'])},\n"
        f"  prefers: {json.dumps(meta['prefers'])} as \"light\" | \"dark\",\n"
        f"  dial: {json.dumps(meta['dial'])} as \"academic\" | \"balanced\" | \"showcase\",\n"
        f"  motion: {json.dumps(meta['motion'])},\n"
        f"  faces: {json.dumps(faces, ensure_ascii=False)},\n"
        "};\n")
    (src / "art" / "pack.ts").write_text(pack_ts, encoding="utf-8")

    # 5. package.json: the pack's fonts; drop other @fontsource deps nobody imports
    pj_path = proj / "package.json"
    pj = json.loads(pj_path.read_text(encoding="utf-8"))
    dep = pj.setdefault("dependencies", {})
    other_src = "\n".join(p.read_text(encoding="utf-8", errors="ignore") for p in src.rglob("*") if p.is_file() and p.suffix in (".css", ".ts", ".tsx") and p.name != "fonts.css")
    for name in [d for d in dep if d.startswith(("@fontsource/", "@fontsource-variable/")) and d not in deps]:
        if name not in other_src:
            del dep[name]
    dep.update(deps)
    pj["dependencies"] = dict(sorted(dep.items()))
    pj_path.write_text(json.dumps(pj, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    # 6. DECK.style and DECK.darkTheme
    cfg_path = src / "deck" / "config.ts"
    cfg = cfg_path.read_text(encoding="utf-8")
    if re.search(r"\n\s*style:\s*\"\w+\"", cfg):
        cfg = re.sub(r"(\n\s*style:\s*)\"\w+\"", rf'\1"{style}"', cfg, count=1)
    else:
        cfg = cfg.replace("export const DECK = {", f'export const DECK = {{\n  style: "{style}" as "academic" | "balanced" | "showcase",', 1)
    cfg = re.sub(r"(\n\s*darkTheme:\s*)(true|false)", rf"\1{'true' if meta['darkTheme'] else 'false'}", cfg, count=1)
    if a.lang:  # the talk language also drives number formatting and <html lang>
        cfg = re.sub(r"(\n\s*locale:\s*)\"\w+\"", rf'\1"{a.lang}"', cfg, count=1)
    cfg_path.write_text(cfg, encoding="utf-8")

    print(f"applied {meta['label']} ({pack.name}) → {proj}")
    print(f"  DECK.style = {style}{' (pack default)' if not a.style else ''}; darkTheme = {meta['darkTheme']}; fonts: {', '.join(deps)}")
    print(f"  transitions: {meta['transitions']['grammar']}; at speaker changes: {', '.join(meta['transitions']['speaker'])}")
    if style != meta["dial"]:
        print(f"  note: the pack is designed for {meta['dial']}; under {style} its dial-gated parts degrade (see pack.css)")
    if a.install:
        subprocess.run(["npm", "install", "--no-audit", "--no-fund"], cwd=proj, check=True)
    else:
        print("  next: npm install && npm run build:single")
    return 0


if __name__ == "__main__":
    sys.exit(main())

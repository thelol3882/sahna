"""Report on rehearsal runs exported from the presenter window (?rehearse → V → Export JSON).

    python rehearsal_report.py rehearsal-2026-11-19-18-40.json [--run -1] [--out rehearsal/] [--compare]

Writes <out>/report.md (scenes that run long, per-speaker totals, pacing = seconds per step, animation vs talk
time) and <out>/report.png (actual vs target per scene). --compare adds a column per earlier run.
Same maths as summarize() in src/deck/rehearse.tsx.
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
import sys

from PIL import Image, ImageDraw, ImageFont

LONG = 1.15  # > 15 % over the target = runs long


def fmt(s: float) -> str:
    s = max(0, int(round(s)))
    return f"{s // 60}:{s % 60:02d}"


def summarize(data: dict, run: dict) -> dict:
    scenes = data["scenes"]
    end = run.get("ended") or max((g.get("t1") or g["t0"]) for g in run["segs"]) if run["segs"] else run["started"]
    rows: dict[str, dict] = {}
    order: list[str] = []
    for g in run["segs"]:
        s = scenes[g["i"]] if g["i"] < len(scenes) else {"id": g["id"], "title": g["id"], "seconds": None, "speaker": None, "appendix": False}
        dur = ((g.get("t1") or end) - g["t0"]) / 1000
        r = rows.get(s["id"])
        if not r:
            r = rows[s["id"]] = {"i": g["i"], "id": s["id"], "title": s["title"], "speaker": s.get("speaker"), "target": s.get("seconds"),
                                 "actual": 0.0, "steps": {}, "anim": 0.0, "appendix": s.get("appendix", False), "visits": 0}
            order.append(s["id"])
        r["actual"] += dur
        r["steps"][g["step"]] = r["steps"].get(g["step"], 0) + dur
        if g["step"] == 0:
            r["visits"] += 1
        if g.get("ready") is not None:
            r["anim"] += min(g["ready"] / 1000, dur)
    lst = sorted(rows.values(), key=lambda r: (r["appendix"], r["i"]))
    names = {sp["id"]: sp["name"] for sp in data.get("speakers", [])}
    speakers: dict[str, dict] = {}
    for r in lst:
        if r["appendix"]:
            continue
        k = names.get(r["speaker"], r["speaker"] or "no speaker")
        v = speakers.setdefault(k, {"actual": 0.0, "target": 0.0})
        v["actual"] += r["actual"]
        v["target"] += r["target"] or 0
    total = (end - run["started"]) / 1000
    backup = sum(r["actual"] for r in lst if r["appendix"])
    presses = sum(1 for g in run["segs"] if not (g["i"] < len(scenes) and scenes[g["i"]].get("appendix")))
    return {"rows": lst, "speakers": speakers, "total": total, "backup": backup, "presses": presses,
            "per_step": (total - backup) / presses if presses else 0}


def report(data: dict, runs: list[dict], k: int, compare: bool) -> tuple[str, dict]:
    run = runs[k]
    s = summarize(data, run)
    earlier = [summarize(data, r) for r in runs[:k]] if compare else []
    budget = data.get("budget") or 0
    out = [f"# Rehearsal — {data['deck']}", "",
           f"Run {k % len(runs) + 1} of {len(runs)} · {run['id']} · total **{fmt(s['total'])}** of {fmt(budget)}"
           f" ({'+' if s['total'] > budget else '−'}{fmt(abs(s['total'] - budget))}) · {s['per_step']:.1f} s per step"
           + (f" · Q&A slides {fmt(s['backup'])}" if s["backup"] else ""), ""]
    long = [r for r in s["rows"] if r["target"] and r["actual"] > r["target"] * LONG and not r["appendix"]]
    if long:
        out += ["## Runs long", ""] + [f"- **{r['title']}**: {fmt(r['actual'])} vs {fmt(r['target'])} (+{fmt(r['actual'] - r['target'])}); "
                                       f"longest step {max(r['steps'], key=r['steps'].get)} ({max(r['steps'].values()):.0f} s)" for r in long] + [""]
    names = {sp["id"]: sp["name"] for sp in data.get("speakers", [])}
    hdr = "| # | scene | speaker | actual | target | Δ | per step (s) | animation (s) |" + "".join(f" run {j + 1} |" for j in range(len(earlier)))
    out += ["## Scenes", "", hdr, "|" + "---|" * (8 + len(earlier))]
    for n, r in enumerate(s["rows"], 1):
        d = f"{'+' if r['actual'] >= (r['target'] or 0) else '−'}{fmt(abs(r['actual'] - (r['target'] or 0)))}" if r["target"] else "-"
        steps = " · ".join(f"{r['steps'].get(i, 0):.0f}" for i in range(max(r["steps"]) + 1))
        prev = "".join(f" {fmt(next((x['actual'] for x in e['rows'] if x['id'] == r['id']), 0))} |" for e in earlier)
        flag = " ⚠" if r in long else ""
        out.append(f"| {'Q&A' if r['appendix'] else n} | {r['title']}{flag} | {names.get(r['speaker'], r['speaker'] or '')} | {fmt(r['actual'])} | "
                   f"{fmt(r['target']) if r['target'] else '-'} | {d} | {steps} | {r['anim']:.1f} |{prev}")
    out += ["", "## Speakers", "", "| speaker | actual | target | Δ |", "|---|---|---|---|"]
    for name, v in s["speakers"].items():
        out.append(f"| {name} | {fmt(v['actual'])} | {fmt(v['target'])} | {'+' if v['actual'] >= v['target'] else '−'}{fmt(abs(v['actual'] - v['target']))} |")
    out += ["", "Pacing: seconds per step is the talk time divided by the number of steps reached; above ~20 s a step usually "
            "hides a monologue (split it or add a step), below ~5 s the animations are doing the talking."]
    return "\n".join(out) + "\n", s


def chart(s: dict, path: pathlib.Path) -> None:
    rows = [r for r in s["rows"] if not r["appendix"]]
    W, rh, left = 1400, 46, 420
    H = 90 + rh * len(rows) + 40
    img = Image.new("RGB", (W, H), (16, 19, 26))
    d = ImageDraw.Draw(img)
    try:
        f, fb = ImageFont.truetype("DejaVuSans.ttf", 18), ImageFont.truetype("DejaVuSans-Bold.ttf", 22)
    except OSError:
        f = fb = ImageFont.load_default()
    d.text((24, 24), f"actual vs target · total {fmt(s['total'])} · {s['per_step']:.1f} s/step", fill=(241, 241, 238), font=fb)
    mx = max([max(r["actual"], r["target"] or 0) for r in rows] + [1])
    for n, r in enumerate(rows):
        y = 80 + n * rh
        d.text((24, y + 10), r["title"][:36], fill=(195, 198, 206), font=f)
        x1 = left + (W - left - 120) * r["actual"] / mx
        col = (76, 195, 132) if not r["target"] or r["actual"] <= r["target"] else (245, 174, 88) if r["actual"] <= r["target"] * LONG else (255, 107, 118)
        d.rounded_rectangle([left, y + 12, max(left + 4, x1), y + 30], 6, fill=col)
        if r["target"]:
            xt = left + (W - left - 120) * r["target"] / mx
            d.line([xt, y + 6, xt, y + 36], fill=(241, 241, 238), width=3)
        d.text((max(left + 4, x1) + 10, y + 10), f"{fmt(r['actual'])}" + (f" / {fmt(r['target'])}" if r["target"] else ""), fill=(155, 163, 184), font=f)
    img.save(path)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("json")
    ap.add_argument("--run", type=int, default=-1, help="index into runs (default: the last)")
    ap.add_argument("--out", default="rehearsal")
    ap.add_argument("--compare", action="store_true")
    a = ap.parse_args()
    data = json.loads(pathlib.Path(a.json).read_text(encoding="utf-8"))
    runs = [r for r in data["runs"] if r["segs"]]
    if not runs:
        print("no runs with data"); return 1
    k = a.run % len(runs)
    md, s = report(data, runs, k, a.compare)
    out = pathlib.Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    (out / "report.md").write_text(md, encoding="utf-8")
    chart(s, out / "report.png")
    print(md)
    print(f"→ {out / 'report.md'}, {out / 'report.png'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

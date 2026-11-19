// Find Python 3 the same way on every OS:
//   SAHNA_PYTHON or the old DECK_PYTHON (a path to python / python.exe) > the project's .venv > Windows: py -3, python, python3 >
//   macOS/Linux: python3, python.
// Each candidate is asked for its version; Python 2, < 3.9 and the Microsoft Store stub (exit 9009) are skipped.
import path from "node:path";
import { existsSync } from "node:fs";
import { probe } from "./proc.js";

export const PY_MIN = [3, 9];
const ASK = 'import sys;print("%d.%d.%d" % sys.version_info[:3]);print(sys.executable)';

/**
 * @param {{platform?: string, env?: NodeJS.ProcessEnv, project?: string | null, exists?: (p: string) => boolean}} [o]
 * @returns {string[][]} [cmd, ...preArgs]
 */
export function pythonCandidates(o = {}) {
  const platform = o.platform ?? process.platform;
  const env = o.env ?? process.env;
  const exists = o.exists ?? existsSync;
  const p = platform === "win32" ? path.win32 : path.posix;
  /** @type {string[][]} */
  const list = [];
  const own = env.SAHNA_PYTHON || env.DECK_PYTHON;
  if (own) list.push([own]);
  if (o.project) {
    for (const venv of [".venv", "venv"]) {
      const exe = platform === "win32" ? p.join(o.project, venv, "Scripts", "python.exe") : p.join(o.project, venv, "bin", "python");
      if (exists(exe)) list.push([exe]);
    }
  }
  if (platform === "win32") list.push(["py", "-3"], ["python"], ["python3"]);
  else list.push(["python3"], ["python"]);
  return list;
}

/**
 * @typedef {{cmd: string, pre: string[], version: string, executable: string, via: string}} Python
 * @param {{platform?: string, env?: NodeJS.ProcessEnv, project?: string | null, probe?: typeof probe, exists?: (p: string) => boolean}} [o]
 * @returns {{python: Python | null, tried: {via: string, result: string}[]}}
 */
export function findPython(o = {}) {
  const run = o.probe ?? probe;
  const platform = o.platform ?? process.platform;
  const tried = [];
  for (const [cmd, ...pre] of pythonCandidates(o)) {
    const via = [cmd, ...pre].join(" ");
    const r = run(cmd, [...pre, "-c", ASK]);
    if (r.missing) { tried.push({ via, result: "not found" }); continue; }
    if (platform === "win32" && r.code === 9009) { tried.push({ via, result: "Microsoft Store stub (not a real Python)" }); continue; }
    if (!r.ok) { tried.push({ via, result: `exit ${r.code}` }); continue; }
    const [version = "", executable = ""] = r.out.split(/\r?\n/).map((s) => s.trim());
    const [maj, min] = version.split(".").map(Number);
    if (maj !== PY_MIN[0] || min < PY_MIN[1]) { tried.push({ via, result: `Python ${version} (need ${PY_MIN.join(".")}+)` }); continue; }
    // run the resolved interpreter directly afterwards (no launcher re-resolution, same one every time)
    const direct = executable && (o.exists ?? existsSync)(executable);
    return { python: { cmd: direct ? executable : cmd, pre: direct ? [] : pre, version, executable, via }, tried };
  }
  return { python: null, tried };
}

/** The fix line for a missing Python, per OS. @param {string} [platform] */
export function pythonFix(platform = process.platform) {
  if (platform === "win32") return 'Install Python 3 from https://www.python.org/downloads/ (tick "Add python.exe to PATH"), or set SAHNA_PYTHON=C:\\path\\to\\python.exe';
  if (platform === "darwin") return "brew install python   (or https://www.python.org/downloads/; or set SAHNA_PYTHON=/path/to/python3)";
  return "sudo apt install python3 python3-pip   (or your distro's package; or set SAHNA_PYTHON=/path/to/python3)";
}

/** Python packages the deck scripts import: pip name → import name. */
export const PY_PACKAGES = {
  playwright: "playwright",
  img2pdf: "img2pdf",
  "python-pptx": "pptx",
  fonttools: "fontTools",
  brotli: "brotli",
  pillow: "PIL",
};

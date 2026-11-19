// `sahna doctor`: what the scripts and commands need, found or not, each with the exact fix for this OS.
import { existsSync, readFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { findNpm, probe, pyEnv, run } from "./proc.js";
import { PY_PACKAGES, findPython, pythonFix } from "./python.js";

/** vite 8: ^20.19 || >=22.12 */
export function nodeOk(v = process.versions.node) {
  const [a, b] = v.split(".").map(Number);
  return (a === 20 && b >= 19) || (a === 22 && b >= 12) || a > 22;
}

/** @param {string} platform @param {"ffmpeg"|"docker"|"cloudflared"|"node"} what */
export function installHint(what, platform = process.platform) {
  const t = {
    ffmpeg: { win32: "winget install Gyan.FFmpeg", darwin: "brew install ffmpeg", linux: "sudo apt install ffmpeg" },
    docker: { win32: "Install and start Docker Desktop: https://docs.docker.com/desktop/", darwin: "Install and start Docker Desktop: https://docs.docker.com/desktop/", linux: "sudo apt install docker.io && sudo systemctl start docker" },
    cloudflared: { win32: "winget install Cloudflare.cloudflared", darwin: "brew install cloudflared", linux: "https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" },
    node: { win32: "winget install OpenJS.NodeJS.LTS", darwin: "brew install node", linux: "https://nodejs.org/en/download (LTS 22+)" },
  };
  return t[what][platform] ?? t[what].linux;
}

const PY_PROBE = `
import importlib.util, json, os, sys, sysconfig
pk = ${JSON.stringify(PY_PACKAGES)}
em = os.path.exists(os.path.join(sysconfig.get_path("stdlib"), "EXTERNALLY-MANAGED"))
print(json.dumps({"venv": sys.prefix != sys.base_prefix, "managed": em,
  "pkgs": {k: importlib.util.find_spec(v) is not None for k, v in pk.items()}}))
`;

const CHROMIUM_PROBE = `
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    print(p.chromium.executable_path)
`;

/** Is a TCP port open (OBS websocket)? */
function reachable(host, port, ms = 1200) {
  return new Promise((resolve) => {
    const s = net.connect({ host, port });
    const done = (/** @type {boolean} */ v) => { s.destroy(); resolve(v); };
    s.setTimeout(ms, () => done(false));
    s.once("connect", () => done(true));
    s.once("error", () => done(false));
  });
}

/** OBS url from remote/config.json + config.local.json. @param {string} root */
export function obsUrl(root) {
  let url = "ws://127.0.0.1:4455";
  for (const f of ["config.json", "config.local.json"]) {
    try {
      const o = JSON.parse(readFileSync(path.join(root, "remote", f), "utf8")).obs;
      if (o === false) return null;
      if (o?.url) url = o.url;
    } catch { /* missing or broken: default */ }
  }
  return url;
}

/**
 * @typedef {{id: string, label: string, status: "ok"|"warn"|"fail"|"skip", detail: string, fix?: string}} Check
 * @param {{project: string | null, modules: string[], assets: string | null, fix: boolean, log: (s: string) => void, onData?: (s: string) => void}} o
 */
export async function doctor(o) {
  const platform = process.platform;
  /** @type {Check[]} */
  const checks = [];
  const fixed = [];
  const add = (/** @type {Check} */ c) => checks.push(c);
  const remote = o.modules.includes("remote");

  add(nodeOk()
    ? { id: "node", label: "Node.js", status: "ok", detail: `v${process.versions.node}` }
    : { id: "node", label: "Node.js", status: "fail", detail: `v${process.versions.node}; Vite 8 needs ^20.19 or >= 22.12`, fix: installHint("node", platform) });

  const n = findNpm();
  const npmV = probe(n.cmd, [...n.pre, "--version"], { timeout: 30000 });
  add(npmV.ok ? { id: "npm", label: "npm", status: "ok", detail: `${npmV.out.split(/\r?\n/).pop()} (${n.pre[0] ?? n.cmd})` }
    : { id: "npm", label: "npm", status: "fail", detail: "not found", fix: "npm comes with Node.js: " + installHint("node", platform) });

  add(o.assets ? { id: "assets", label: "skill assets", status: "ok", detail: o.assets }
    : { id: "assets", label: "skill assets", status: "warn", detail: "not found (needed by new, pack, moodboard, module add)", fix: "pass --assets <skill>/assets or set SAHNA_ASSETS" });

  if (o.project) {
    let nm = existsSync(path.join(o.project, "node_modules"));
    if (!nm && o.fix && npmV.ok) {
      o.log("npm install …");
      const r = await run(n.cmd, [...n.pre, "install", "--no-audit", "--no-fund"], { cwd: o.project, onData: o.onData, shell: n.shell });
      if (r.code === 0) { nm = true; fixed.push("npm install"); }
    }
    add(nm ? { id: "node_modules", label: "project packages", status: "ok", detail: "installed" }
      : { id: "node_modules", label: "project packages", status: "fail", detail: "node_modules missing", fix: "npm install" });
  }

  let { python, tried } = findPython({ project: o.project });
  add(python
    ? { id: "python", label: "Python 3", status: "ok", detail: `${python.version} via ${python.via}${python.executable ? ` (${python.executable})` : ""}` }
    : { id: "python", label: "Python 3", status: "fail", detail: `not found; tried ${tried.map((t) => `${t.via}: ${t.result}`).join("; ")}`, fix: pythonFix(platform) });

  if (python) {
    const ask = () => {
      const r = probe(python.cmd, [...python.pre, "-c", PY_PROBE], { env: pyEnv(), timeout: 30000 });
      try { return JSON.parse(r.out.split(/\r?\n/).pop() ?? ""); } catch { return null; }
    };
    let info = ask();
    let missing = info ? Object.entries(info.pkgs).filter(([, v]) => !v).map(([k]) => k) : Object.keys(PY_PACKAGES);
    const pipCmd = (/** @type {any} */ py, /** @type {boolean} */ user) => [py.cmd, ...py.pre, "-m", "pip", "install", ...(user ? ["--user"] : []), ...missing];
    if (missing.length && o.fix) {
      // PEP 668 (Debian/Ubuntu/Homebrew Python) refuses pip even with --user: make a project .venv (the CLI uses it)
      if (info?.managed && !info.venv && o.project) {
        o.log("this Python is externally managed (PEP 668): creating .venv in the project …");
        const v = await run(python.cmd, [...python.pre, "-m", "venv", path.join(o.project, ".venv")], { onData: o.onData });
        if (v.code === 0) {
          const again = findPython({ project: o.project });
          if (again.python) { python = again.python; fixed.push("python -m venv .venv"); info = ask(); }
        }
      }
      const user = !!info && !info.venv;
      o.log(`pip install ${missing.join(" ")} …`);
      const r = await run(python.cmd, [...python.pre, "-m", "pip", "install", ...(user ? ["--user"] : []), "--disable-pip-version-check", ...missing], { env: pyEnv(), onData: o.onData });
      if (r.code === 0) fixed.push(`pip install ${missing.join(" ")}`);
      info = ask();
      missing = info ? Object.entries(info.pkgs).filter(([, v]) => !v).map(([k]) => k) : missing;
    }
    const fixLine = info?.managed && !info.venv
      ? `${platform === "win32" ? "py -3" : "python3"} -m venv .venv && ${platform === "win32" ? ".venv\\Scripts\\python" : ".venv/bin/python"} -m pip install ${missing.join(" ")}   (or: npx sahna doctor --fix)`
      : pipCmd(python, !!info && !info.venv).map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(" ");
    add(missing.length
      ? { id: "pip", label: "Python packages", status: "fail", detail: `missing: ${missing.join(", ")}`, fix: fixLine }
      : { id: "pip", label: "Python packages", status: "ok", detail: Object.keys(PY_PACKAGES).join(", ") });

    if (info?.pkgs.playwright) {
      const find = () => probe(python.cmd, [...python.pre, "-c", CHROMIUM_PROBE], { env: pyEnv(), timeout: 60000 });
      let r = find();
      let exe = r.ok ? r.out.split(/\r?\n/).pop() ?? "" : "";
      let why = "not installed";
      if ((!exe || !existsSync(exe)) && o.fix) {
        o.log("playwright install chromium …");
        const ins = await run(python.cmd, [...python.pre, "-m", "playwright", "install", "chromium"], { env: pyEnv(), onData: o.onData });
        if (ins.code === 0) fixed.push("playwright install chromium");
        else why = `install failed: ${ins.output.split(/\r?\n/).map((l) => l.trim()).find((l) => /^Error:/.test(l)) ?? `exit ${ins.code}`}`;
        r = find();
        exe = r.ok ? r.out.split(/\r?\n/).pop() ?? "" : "";
      }
      add(exe && existsSync(exe)
        ? { id: "chromium", label: "Playwright Chromium", status: "ok", detail: exe }
        : { id: "chromium", label: "Playwright Chromium", status: "fail", detail: why, fix: `${[python.cmd, ...python.pre].map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(" ")} -m playwright install chromium${platform === "linux" ? "   (Linux may also need: … -m playwright install-deps chromium)" : ""}` });
    } else {
      add({ id: "chromium", label: "Playwright Chromium", status: "skip", detail: "needs the playwright package first" });
    }
  }

  const optional = (/** @type {string} */ id, /** @type {string} */ label, /** @type {string[]} */ cmd, /** @type {string} */ why, /** @type {boolean} */ needed, /** @type {"ffmpeg"|"docker"|"cloudflared"} */ hint) => {
    const r = probe(cmd[0], cmd.slice(1), { timeout: 15000 });
    const ver = r.out.split(/\r?\n/)[0]?.slice(0, 80) ?? "";
    if (r.ok) add({ id, label, status: "ok", detail: ver });
    else add({ id, label, status: needed ? "warn" : "skip", detail: `${r.missing ? "not found" : "not running"} (${why})`, fix: installHint(hint, platform) });
  };
  optional("ffmpeg", "ffmpeg", ["ffmpeg", "-version"], "sahna mix, video tools", remote || o.modules.includes("video-scene"), "ffmpeg");
  optional("docker", "Docker running", ["docker", "info", "--format", "{{.ServerVersion}}"], "optional for sahna record: else node + cloudflared", false, "docker");
  optional("cloudflared", "cloudflared", ["cloudflared", "--version"], "sahna record without Docker", remote, "cloudflared");
  if (remote && o.project) {
    const url = obsUrl(o.project);
    if (!url) add({ id: "obs", label: "OBS websocket", status: "skip", detail: "obs: false in remote/config.json" });
    else {
      let host = "127.0.0.1", port = 4455;
      try { const u = new URL(url); host = u.hostname; port = Number(u.port || 4455); } catch { /* default */ }
      const ok = await reachable(host, port);
      add(ok ? { id: "obs", label: "OBS websocket", status: "ok", detail: url }
        : { id: "obs", label: "OBS websocket", status: "warn", detail: `${url} not reachable (only needed for automatic recording)`, fix: "Start OBS 28+, Tools → WebSocket Server Settings → Enable; password into remote/config.local.json" });
    }
  }
  return { checks, fixed, python: python ? { cmd: python.cmd, version: python.version, via: python.via } : null, ok: !checks.some((c) => c.status === "fail") };
}

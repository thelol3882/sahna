// Child processes without a shell: arguments are passed as an array, never concatenated into a command string,
// so paths with spaces, quotes or backslashes and user input cannot break or inject anything.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

/** Environment for every Python child: UTF-8 everywhere (Windows consoles default to cp1252, and the scripts print
 *  → and read files with Kazakh text), unbuffered so output streams line by line. */
export function pyEnv(extra = {}) {
  return { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8", PYTHONUNBUFFERED: "1", ...extra };
}

/**
 * Where npm's JS entry lives, so npm runs as `node npm-cli.js …` (no npm.cmd, no shell on Windows).
 * @param {{env?: NodeJS.ProcessEnv, execPath?: string, exists?: (p: string) => boolean, platform?: string}} [o]
 * @returns {{cmd: string, pre: string[], shell: boolean}}
 */
export function findNpm(o = {}) {
  const env = o.env ?? process.env;
  const execPath = o.execPath ?? process.execPath;
  const exists = o.exists ?? existsSync;
  const platform = o.platform ?? process.platform;
  const p = platform === "win32" ? path.win32 : path.posix;
  const candidates = [];
  const ep = env.npm_execpath;
  if (ep && /\.c?js$/.test(ep)) candidates.push(ep.replace(/npx-cli\.js$/, "npm-cli.js"));
  const dir = p.dirname(execPath);
  candidates.push(p.join(dir, "node_modules", "npm", "bin", "npm-cli.js")); // Windows installer, nvm-windows
  candidates.push(p.join(dir, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js")); // unix prefix, nvm, brew
  for (const c of candidates) if (exists(c)) return { cmd: execPath, pre: [c], shell: false };
  // last resort: npm on PATH (npm.cmd needs a shell on Windows; only fixed arguments are ever passed to it)
  return platform === "win32" ? { cmd: "npm.cmd", pre: [], shell: true } : { cmd: "npm", pre: [], shell: false };
}

/** Quote one argument for cmd.exe (only used for the npm.cmd fallback). @param {string} a */
export function quoteWin(a) {
  if (/^[\w./:=@^-]+$/.test(a)) return a;
  return `"${a.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, "$1$1")}"`;
}

/**
 * Run a command. mode "inherit": the child owns the terminal (dev server, remote). Otherwise output is captured
 * and, when `onData` is given, forwarded as it arrives (human mode streams; --json mode only keeps it).
 * @param {string} cmd
 * @param {string[]} args
 * @param {{cwd?: string, env?: NodeJS.ProcessEnv, inherit?: boolean, onData?: (s: string) => void, shell?: boolean, input?: string}} [o]
 * @returns {Promise<{code: number, output: string, error?: Error}>}
 */
export function run(cmd, args, o = {}) {
  return new Promise((resolve) => {
    let output = "";
    /** @type {import("node:child_process").ChildProcess} */
    let child;
    const shell = !!o.shell;
    try {
      child = spawn(shell ? [cmd, ...args.map(quoteWin)].join(" ") : cmd, shell ? [] : args, {
        cwd: o.cwd,
        env: o.env ?? process.env,
        stdio: o.inherit ? "inherit" : ["ignore", "pipe", "pipe"],
        shell,
        windowsHide: true,
      });
    } catch (error) {
      resolve({ code: 127, output: "", error: /** @type {Error} */ (error) });
      return;
    }
    const take = (/** @type {Buffer} */ b) => {
      const s = b.toString("utf8");
      output += s;
      o.onData?.(s);
    };
    child.stdout?.on("data", take);
    child.stderr?.on("data", take);
    child.on("error", (error) => resolve({ code: 127, output, error }));
    child.on("close", (code, signal) => resolve({ code: code ?? (signal ? 130 : 1), output }));
  });
}

/** Run quickly and synchronously (probes: versions, imports). Never throws. */
export function probe(cmd, args, o = {}) {
  try {
    const r = spawnSync(cmd, args, { encoding: "utf8", timeout: o.timeout ?? 20000, env: o.env ?? process.env, cwd: o.cwd, windowsHide: true });
    if (r.error) return { ok: false, code: /** @type {any} */ (r.error).code === "ENOENT" ? 127 : 1, out: "", missing: /** @type {any} */ (r.error).code === "ENOENT" };
    return { ok: r.status === 0, code: r.status ?? 1, out: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim(), missing: false };
  } catch {
    return { ok: false, code: 1, out: "", missing: true };
  }
}

/** npm with fixed arguments in a project. */
export function npm(args, o = {}) {
  const n = findNpm();
  return run(n.cmd, [...n.pre, ...args], { ...o, shell: n.shell });
}

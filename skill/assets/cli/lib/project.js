// Where things are: the deck project (walk up from cwd), the skill's assets folder, and the project's state.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readDeckField } from "./edit.js";

export const CLI_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/** File in a deck project that remembers where the skill's assets are (written by `sahna new`). */
export const PROJECT_META = ".sahna.json";
/** The same file as older versions (the `deck` CLI) wrote it; still read. */
export const LEGACY_PROJECT_META = ".deck.json";

/** A deck project = package.json + src/deck/config.ts. @param {string} dir @param {(p: string) => boolean} [exists] */
export const isProject = (dir, exists = existsSync) =>
  exists(path.join(dir, "package.json")) && exists(path.join(dir, "src", "deck", "config.ts"));

/**
 * Walk up from `start` to the nearest deck project.
 * @param {string} start @param {{exists?: (p: string) => boolean, pathMod?: path.PlatformPath}} [o]
 * @returns {string | null}
 */
export function findProjectRoot(start, o = {}) {
  const p = o.pathMod ?? path;
  const exists = o.exists ?? existsSync;
  let dir = p.resolve(start);
  for (;;) {
    if (exists(p.join(dir, "package.json")) && exists(p.join(dir, "src", "deck", "config.ts"))) return dir;
    const up = p.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

/** The skill's assets folder = has starter/, packs/, tools/, modules/. @param {string} dir @param {(p: string) => boolean} [exists] */
export const isAssets = (dir, exists = existsSync) =>
  ["starter/package.json", "packs", "tools/apply_pack.py", "modules"].every((f) => exists(path.join(dir, ...f.split("/"))));

/**
 * Find the skill's assets: --assets > SAHNA_ASSETS (or the old DECK_ASSETS) > the project's .sahna.json (or the old
 * .deck.json) > next to this CLI (assets/cli/..).
 * @param {{flag?: string, env?: NodeJS.ProcessEnv, project?: string | null, cliDir?: string, exists?: (p: string) => boolean, read?: (p: string) => string}} [o]
 * @returns {{dir: string | null, tried: string[]}}
 */
export function resolveAssets(o = {}) {
  const env = o.env ?? process.env;
  const exists = o.exists ?? existsSync;
  const read = o.read ?? ((/** @type {string} */ f) => readFileSync(f, "utf8"));
  const tried = [];
  const candidates = [];
  if (o.flag) candidates.push(["--assets", o.flag]);
  if (env.SAHNA_ASSETS) candidates.push(["SAHNA_ASSETS", env.SAHNA_ASSETS]);
  else if (env.DECK_ASSETS) candidates.push(["DECK_ASSETS", env.DECK_ASSETS]);
  if (o.project) {
    for (const name of [PROJECT_META, LEGACY_PROJECT_META]) {
      const meta = path.join(o.project, name);
      if (!exists(meta)) continue;
      try {
        const a = JSON.parse(read(meta)).assets;
        if (a) candidates.push([name, path.resolve(o.project, a)]);
      } catch { /* unreadable meta: ignore */ }
      break;
    }
  }
  candidates.push(["cli location", path.resolve(o.cliDir ?? CLI_DIR, "..")]);
  for (const [via, dir] of candidates) {
    const abs = path.resolve(dir);
    if (isAssets(abs, exists)) return { dir: abs, tried };
    tried.push(`${via}: ${abs}`);
  }
  return { dir: null, tried };
}

/** Modules, by the file that shows they are installed. */
export const MODULE_MARKERS = {
  diagram: "src/diagram/index.ts",
  "data-viz": "src/data-viz/index.ts",
  "code-scene": "src/code-scene/index.ts",
  "video-scene": "src/video-scene/index.ts",
  world: "src/world/index.ts",
  remote: "remote/run.mjs",
};

/** @param {string} root @returns {string[]} */
export function installedModules(root) {
  return Object.entries(MODULE_MARKERS)
    .filter(([, f]) => existsSync(path.join(root, ...f.split("/"))))
    .map(([m]) => m);
}

const BUILD_INPUTS = ["src", "public", "index.html", "vite.config.ts", "package.json", "tsconfig.json", "vite-plugin-code-scene.ts", "geo"];

/** Newest mtime (ms) of a file or, recursively, a folder. @param {string} p */
function newest(p) {
  let st;
  try { st = statSync(p); } catch { return 0; }
  if (!st.isDirectory()) return st.mtimeMs;
  let m = 0;
  for (const e of readdirSync(p)) if (e !== "node_modules") m = Math.max(m, newest(path.join(p, e)));
  return m;
}

/** @param {string} root */
export function singleHtml(root) {
  return path.join(root, "dist-single", "index.html");
}

/** Is dist-single/index.html missing or older than any build input? @param {string} root */
export function buildStale(root) {
  const out = singleHtml(root);
  if (!existsSync(out)) return true;
  const built = statSync(out).mtimeMs;
  return BUILD_INPUTS.some((f) => newest(path.join(root, f)) > built);
}

/** file:// URL of the single-file build with an optional query (spaces, backslashes and drive letters handled). */
export function deckUrl(root, query = "") {
  const u = pathToFileURL(singleHtml(root)).href;
  return query ? `${u}?${query}` : u;
}

/** Everything the menu and the commands need to know about a project. @param {string} root */
export function projectState(root) {
  const cfg = readFileSync(path.join(root, "src", "deck", "config.ts"), "utf8");
  let pkg = {};
  try { pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")); } catch { /* broken package.json: shown by the build */ }
  let pack = null;
  try { pack = /name:\s*"([^"]+)"/.exec(readFileSync(path.join(root, "src", "art", "pack.ts"), "utf8"))?.[1] ?? null; } catch { /* no pack file */ }
  return {
    root,
    name: /** @type {any} */ (pkg).name ?? path.basename(root),
    title: readDeckField(cfg, "title"),
    style: readDeckField(cfg, "style"),
    locale: readDeckField(cfg, "locale"),
    pack,
    modules: installedModules(root),
    installed: existsSync(path.join(root, "node_modules")),
    built: existsSync(singleHtml(root)),
    stale: buildStale(root),
  };
}

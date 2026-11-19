// Module install, automated from each module's NOTES.md "Install" section: file copies, package.json (deps +
// scripts), config edits (vite.config.ts, main.tsx, .gitignore). Versions are the ones the showreel was built with.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { addCodeScenePlugin, addGitignore, addWorldInstall, editPackageJson, sceneIds, worldTs } from "./edit.js";
import { MODULE_MARKERS } from "./project.js";

/**
 * @typedef {{from: string, to: string, filter?: (rel: string) => boolean, keep?: boolean}} Copy
 *   from: path in the module (a trailing "/*" copies the folder's files into `to`); keep: never overwrite
 * @typedef {{
 *   summary: string, copies: Copy[], dependencies?: Record<string,string>, devDependencies?: Record<string,string>,
 *   scripts?: Record<string,string>, gitignore?: string[], dirs?: string[],
 *   edit?: (root: string) => string[],
 *   checks?: {name: string, script: string, args: (c: {html: string, styles: string[], locale: string, report: string}) => string[]}[],
 *   after?: string[]
 * }} ModuleSpec
 */

/** @type {Record<string, ModuleSpec>} */
export const MODULES = {
  diagram: {
    summary: "architecture / system-design diagrams as data (ELK layout at build time)",
    copies: [
      { from: "src/diagram", to: "src/diagram" },
      { from: "src/graphs", to: "src/graphs", keep: true },
      { from: "scripts/*", to: "scripts" },
    ],
    dependencies: { "simple-icons": "^16.38.0" },
    devDependencies: { elkjs: "^0.12.1" },
    scripts: {
      layout: "node scripts/layout.mjs",
      "layout:check": "node scripts/layout.mjs --check",
      predev: "node scripts/layout.mjs",
      prebuild: "node scripts/layout.mjs",
      "prebuild:single": "node scripts/layout.mjs",
    },
    gitignore: ["shots/"],
    checks: [
      { name: "diagram text", script: "scripts/diagram_check.py", args: () => ["text"] },
      { name: "diagram seek", script: "scripts/diagram_check.py", args: () => ["seek"] },
      { name: "diagram shots", script: "scripts/diagram_check.py", args: (c) => ["shots", "--styles", c.styles.join(",")] },
    ],
    after: ["Write src/graphs/<name>.graph.json (modules/diagram/NOTES.md), import its .layout.json in a scene."],
  },
  "data-viz": {
    summary: "data storytelling: big numbers, bars, lines, races, maps",
    copies: [
      { from: "src/data-viz", to: "src/data-viz" },
      { from: "scripts/*", to: "scripts" },
      { from: "geo", to: "geo", keep: true },
    ],
    devDependencies: { "d3-geo": "^3.1.2", "@types/d3-geo": "^3.1.1" },
    scripts: { geo: "node scripts/geo-build.mjs geo/kz.config.json" },
    checks: [
      { name: "viz contrast", script: "scripts/viz_contrast.py", args: (c) => [c.html, "--styles", c.styles.join(","), "--lang", c.locale] },
    ],
    after: ["Put every number once in src/data.ts with its source; charts import from ../data-viz."],
  },
  "code-scene": {
    summary: "code walkthroughs: focus, diff, run, type (highlighted at build time)",
    copies: [
      { from: "vite-plugin-code-scene.ts", to: "vite-plugin-code-scene.ts" },
      { from: "src/code-scene", to: "src/code-scene" },
    ],
    devDependencies: { shiki: "^4.6.0" },
    dirs: ["src/scenes/code"],
    edit: (root) => editFile(root, "vite.config.ts", addCodeScenePlugin),
    after: ["Put samples in src/scenes/code/ and import them with ?shiki (add .txt to .ts/.tsx/.js samples)."],
  },
  "video-scene": {
    summary: "an embedded demo video with a morph/card intro and chapters",
    copies: [
      { from: "src/video-scene", to: "src/video-scene" },
      { from: "tools/*", to: "scripts/video" },
    ],
    dirs: ["public/media"],
    after: ["Put the video in public/media/ (never import it); ship media/ next to the HTML."],
  },
  world: {
    summary: "spatial 3D world: the camera flies between scene panels",
    copies: [
      { from: "src/world", to: "src/world" },
      { from: "scripts/*", to: "scripts", filter: (f) => f.endsWith(".py") },
    ],
    dependencies: { three: "^0.187.0" },
    devDependencies: { "@types/three": "^0.187.0" },
    gitignore: ["world-shots/"],
    edit: (root) => {
      const changed = [];
      const wt = path.join(root, "src", "scenes", "world.ts");
      if (!existsSync(wt)) {
        const ids = sceneIds(readFileSync(path.join(root, "src", "scenes", "index.ts"), "utf8")).filter((s) => !s.appendix).map((s) => s.id);
        writeFileSync(wt, worldTs(ids));
        changed.push("src/scenes/world.ts");
      }
      return [...changed, ...editFile(root, "src/main.tsx", addWorldInstall)];
    },
    checks: [
      { name: "world", script: "scripts/world_check.py", args: (c) => ["--html", c.html, "--out", path.join(c.report, "world"), "--styles", c.styles.join(",")] },
    ],
    after: ["Shape src/scenes/world.ts with ring(), room() and moves (modules/world/NOTES.md §3)."],
  },
  remote: {
    summary: "phone remotes, synced viewers, phone recording + OBS (npm run record)",
    copies: [
      { from: "*", to: "remote", filter: (f) => !/^(test|\.run|recordings)(\/|$)/.test(f) && f !== "config.local.json" && f !== "config.json" },
      { from: "config.json", to: "remote/config.json", keep: true },
    ],
    devDependencies: { ws: "^8.18.0" },
    scripts: {
      record: "node remote/run.mjs --record",
      stop: "node remote/run.mjs --stop",
      mix: "node remote/run.mjs --mix",
      links: "node remote/run.mjs --links",
      remote: "node remote/run.mjs",
      "remote:stop": "node remote/run.mjs --stop",
    },
    gitignore: ["recordings/", "remote/.run/", "remote/obs-scene-collection.json", "remote/obs-profile/", "remote/config.local.json"],
    after: ["Secrets (the OBS password) go only in remote/config.local.json. Read remote/RECORDING.md before the first take."],
  },
};

export const MODULE_NAMES = Object.keys(MODULES);

/** @param {string} root @param {string} rel @param {(s: string) => string} fn @returns {string[]} */
function editFile(root, rel, fn) {
  const f = path.join(root, ...rel.split("/"));
  const before = readFileSync(f, "utf8");
  const after = fn(before);
  if (after === before) return [];
  writeFileSync(f, after);
  return [rel];
}

/** Files of a folder, relative, "/"-separated. @param {string} dir @param {string} [base] @returns {string[]} */
function walk(dir, base = "") {
  const out = [];
  for (const e of readdirSync(dir)) {
    const rel = base ? `${base}/${e}` : e;
    const abs = path.join(dir, e);
    if (statSync(abs).isDirectory()) out.push(...walk(abs, rel));
    else out.push(rel);
  }
  return out;
}

/**
 * Plan the copies: [{src, dst, rel}] with absolute paths. Pure enough to test (reads the module folder only).
 * @param {string} moduleDir @param {string} root @param {ModuleSpec} spec
 */
export function planCopies(moduleDir, root, spec) {
  const plan = [];
  for (const c of spec.copies) {
    const star = c.from === "*" || c.from.endsWith("/*");
    const srcBase = path.join(moduleDir, ...(star ? c.from.replace(/\/?\*$/, "") : c.from).split("/").filter(Boolean));
    if (!existsSync(srcBase)) throw new Error(`module file missing: ${srcBase}`);
    const dstBase = path.join(root, ...c.to.split("/"));
    if (!statSync(srcBase).isDirectory()) {
      plan.push({ src: srcBase, dst: dstBase, rel: c.to, keep: !!c.keep });
      continue;
    }
    for (const rel of walk(srcBase)) {
      if (c.filter && !c.filter(rel)) continue;
      if (/(^|\/)(node_modules|__pycache__|\.DS_Store)(\/|$)/.test(rel)) continue;
      plan.push({ src: path.join(srcBase, ...rel.split("/")), dst: path.join(dstBase, ...rel.split("/")), rel: `${c.to}/${rel}`, keep: !!c.keep });
    }
  }
  return plan;
}

/**
 * Install a module into a deck project (files + package.json + config edits). npm install is the caller's job,
 * so several modules share one install.
 * @param {string} assets @param {string} root @param {string} name @param {{force?: boolean}} [o]
 * @returns {{module: string, copied: number, kept: string[], edited: string[], already: boolean, after: string[]}}
 */
export function installModule(assets, root, name, o = {}) {
  const spec = MODULES[name];
  if (!spec) throw new Error(`unknown module ${name}`);
  const marker = path.join(root, ...MODULE_MARKERS[/** @type {keyof typeof MODULE_MARKERS} */ (name)].split("/"));
  if (existsSync(marker) && !o.force) return { module: name, copied: 0, kept: [], edited: [], already: true, after: [] };
  const moduleDir = path.join(assets, "modules", name);
  let copied = 0;
  const kept = [];
  for (const f of planCopies(moduleDir, root, spec)) {
    if (f.keep && existsSync(f.dst)) { kept.push(f.rel); continue; }
    mkdirSync(path.dirname(f.dst), { recursive: true });
    cpSync(f.src, f.dst);
    copied++;
  }
  for (const d of spec.dirs ?? []) mkdirSync(path.join(root, ...d.split("/")), { recursive: true });
  const edited = [];
  const pj = path.join(root, "package.json");
  const pjText = readFileSync(pj, "utf8");
  const pjNew = editPackageJson(pjText, { dependencies: spec.dependencies, devDependencies: spec.devDependencies, scripts: spec.scripts });
  if (pjNew !== pjText) { writeFileSync(pj, pjNew); edited.push("package.json"); }
  if (spec.gitignore) {
    const gi = path.join(root, ".gitignore");
    const t = existsSync(gi) ? readFileSync(gi, "utf8") : "";
    const n = addGitignore(t, spec.gitignore);
    if (n !== t) { writeFileSync(gi, n); edited.push(".gitignore"); }
  }
  if (spec.edit) edited.push(...spec.edit(root));
  return { module: name, copied, kept, edited, already: false, after: spec.after ?? [] };
}

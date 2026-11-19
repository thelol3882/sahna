// Text edits of project files. Pure functions (string in, string out) so they are unit-tested without a project.
// They keep the file's line endings (CRLF on a Windows checkout) and are idempotent.

/** @param {string} text */
const eol = (text) => (text.includes("\r\n") ? "\r\n" : "\n");

/** Value of a string field of DECK in src/deck/config.ts (`style: "balanced" as Style,` → "balanced"). */
export function readDeckField(text, field) {
  const m = new RegExp(`(?:^|\\n)[ \\t]*${field}:[ \\t]*("(?:[^"\\\\\\n]|\\\\.)*")`).exec(text);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return m[1].slice(1, -1); }
}

/**
 * Set a string field of DECK (keeps `as Style` and the comment around it); adds the field when missing.
 * @param {string} text @param {string} field @param {string} value
 */
export function setDeckField(text, field, value) {
  const lit = JSON.stringify(value);
  const re = new RegExp(`((?:^|\\n)[ \\t]*${field}:[ \\t]*)"(?:[^"\\\\\\n]|\\\\.)*"`);
  if (re.test(text)) return text.replace(re, (_, head) => head + lit);
  const anchor = /export const DECK\s*=\s*\{[ \t]*\r?\n/.exec(text);
  if (!anchor) throw new Error("src/deck/config.ts has no `export const DECK = {`");
  const at = anchor.index + anchor[0].length;
  return text.slice(0, at) + `  ${field}: ${lit},${eol(text)}` + text.slice(at);
}

export const STYLES = ["academic", "balanced", "showcase"];
export const LOCALES = ["en", "ru", "kk"];

/** @param {string} text */
const indentOf = (text) => /\n( +|\t)"/.exec(text)?.[1] ?? "  ";

/**
 * package.json edit: deps, devDeps and scripts. Existing versions win (the user may have pinned them); an existing
 * different pre-hook gets ours chained with && (never dropped).
 * @param {string} text
 * @param {{dependencies?: Record<string,string>, devDependencies?: Record<string,string>, scripts?: Record<string,string>, bin?: Record<string,string>}} add
 */
export function editPackageJson(text, add) {
  const pkg = JSON.parse(text);
  for (const key of /** @type {const} */ (["dependencies", "devDependencies"])) {
    if (!add[key]) continue;
    const cur = (pkg[key] ??= {});
    for (const [n, v] of Object.entries(add[key])) {
      const other = key === "dependencies" ? pkg.devDependencies : pkg.dependencies;
      if (!(n in cur) && !(other && n in other)) cur[n] = v;
    }
    pkg[key] = Object.fromEntries(Object.entries(cur).sort(([a], [b]) => a.localeCompare(b)));
  }
  if (add.scripts) {
    const s = (pkg.scripts ??= {});
    for (const [n, v] of Object.entries(add.scripts)) {
      if (!(n in s)) s[n] = v;
      else if (s[n] !== v && !s[n].includes(v) && /^pre/.test(n)) s[n] = `${s[n]} && ${v}`;
    }
  }
  if (add.bin) pkg.bin = { ...(typeof pkg.bin === "object" ? pkg.bin : {}), ...add.bin };
  return JSON.stringify(pkg, null, indentOf(text)).replace(/\n/g, eol(text)) + eol(text);
}

/** vite.config.ts: import the code-scene plugin and put codeScene() FIRST in plugins (module NOTES step 3). */
export function addCodeScenePlugin(text) {
  if (/codeScene\(/.test(text)) return text;
  const nl = eol(text);
  const imports = [...text.matchAll(/^import .*;[ \t]*\r?$/gm)];
  const last = imports.at(-1);
  const line = `import { codeScene } from "./vite-plugin-code-scene.ts";`;
  let out = last ? text.slice(0, last.index + last[0].replace(/\r$/, "").length) + nl + line + text.slice(last.index + last[0].replace(/\r$/, "").length) : line + nl + text;
  if (!/plugins:\s*\[/.test(out)) throw new Error("vite.config.ts has no `plugins: [`; add codeScene() first in plugins by hand");
  out = out.replace(/plugins:(\s*)\[/, (_, ws) => `plugins:${ws}[codeScene(), `);
  return out;
}

/** src/main.tsx: install the spatial world before mounting (module NOTES step 4). */
export function addWorldInstall(text) {
  if (/installWorld\(/.test(text)) return text;
  const nl = eol(text);
  const imports = [...text.matchAll(/^import [^;]*;[ \t]*\r?$/gm)];
  const last = imports.at(-1);
  if (!last) throw new Error("src/main.tsx has no imports; add installWorld(WORLD) by hand (modules/world/NOTES.md §0)");
  const end = last.index + last[0].replace(/\r$/, "").length;
  const add = [
    `import { installWorld } from "./world";`,
    `import { WORLD } from "./scenes/world";`,
    ``,
    `// spatial world: scenes become panels in one space (off in academic, 2.5D in balanced, 3D in showcase)`,
    `installWorld(WORLD);`,
  ].join(nl);
  return text.slice(0, end) + nl + add + text.slice(end);
}

/** Append missing lines to .gitignore. @param {string} text @param {string[]} lines */
export function addGitignore(text, lines) {
  const nl = eol(text || "\n");
  const have = new Set(text.split(/\r?\n/).map((l) => l.trim()));
  const missing = lines.filter((l) => !have.has(l));
  if (!missing.length) return text;
  const base = text && !text.endsWith("\n") ? text + nl : text;
  return base + missing.join(nl) + nl;
}

/**
 * Scene ids from src/scenes/index.ts (the same literal format the remote server reads): [{id, appendix}].
 * @param {string} text
 */
export function sceneIds(text) {
  const body = text.slice(Math.max(0, text.search(/export const scenes/)));
  const hits = [...body.matchAll(/(?:^|\n)\s*id:\s*"([^"]+)"/g)];
  return hits.map((m, i) => {
    const chunk = body.slice(m.index, hits[i + 1]?.index ?? body.length);
    return { id: m[1], appendix: /\bappendix:\s*true\b/.test(chunk) };
  });
}

/** A first src/scenes/world.ts: every main scene on one straight path (edit it into rings and rooms later). */
export function worldTs(ids) {
  return [
    "// Written by `sahna module add world`: every main scene on one straight path. Make it a real world with",
    "// ring(), room() and moves (modules/world/NOTES.md §3; the example deck's world.ts is a template).",
    "// Add new main scenes here too. Backup slides are not listed: they fade in flat over the world.",
    'import { path, world } from "../world/layout";',
    "",
    `export const WORLD = world(path(${JSON.stringify(ids)}));`,
    "",
  ].join("\n");
}

/** A valid npm package name from a folder name. @param {string} s */
export function slug(s) {
  const out = s.toLowerCase().normalize("NFKD").replace(/[^\w.-]+/g, "-").replace(/^[-._]+|[-.]+$/g, "").slice(0, 60);
  return out || "deck";
}

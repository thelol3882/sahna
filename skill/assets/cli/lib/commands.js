// Every command: help text, options, and the function that does the work. The TUI calls the same functions.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { c } from "./color.js";
import { CHECK_NAMES, parseCheckOutput, planChecks, summaryMarkdown } from "./checks.js";
import { doctor } from "./doctor.js";
import { LOCALES, STYLES, addGitignore, editPackageJson, readDeckField, setDeckField, slug } from "./edit.js";
import { MODULES, MODULE_NAMES, installModule } from "./modules.js";
import { DeckError, EXIT, envError, usageError } from "./out.js";
import { findNpm, pyEnv, run } from "./proc.js";
import { CLI_DIR, PROJECT_META, buildStale, deckUrl, findProjectRoot, installedModules, projectState, resolveAssets, singleHtml } from "./project.js";
import { findPython, pythonFix } from "./python.js";

export const VERSION = JSON.parse(readFileSync(path.join(CLI_DIR, "package.json"), "utf8")).version;

/**
 * @typedef {import("./out.js").Out} Out
 * @typedef {{
 *   out: Out, opts: Record<string, any>, pos: string[], rest: string[], cwd: string, interactive: boolean,
 *   project: () => string, maybeProject: () => string | null, assets: () => string, python: () => import("./python.js").Python,
 * }} Ctx
 * @typedef {{type: "string" | "boolean", short?: string, multiple?: boolean, desc: string, arg?: string}} Opt
 * @typedef {{name: string, summary: string, usage: string, options?: Record<string, Opt>, examples?: string[], sub?: string[], json?: string, run: (ctx: Ctx) => Promise<any>}} Command
 */

// ───────────────────────────── shared steps ─────────────────────────────

/** @param {Ctx} ctx */
function stream(ctx) {
  return ctx.out.json || ctx.out.quiet ? (ctx.opts.verbose ? (/** @type {string} */ s) => process.stderr.write(s) : undefined) : (/** @type {string} */ s) => ctx.out.raw(s);
}

/** Run a Python script with the project's interpreter. @param {Ctx} ctx @param {string} script @param {string[]} args @param {{cwd?: string, quiet?: boolean}} [o] */
export async function runPy(ctx, script, args, o = {}) {
  const py = ctx.python();
  const r = await run(py.cmd, [...py.pre, script, ...args], { cwd: o.cwd, env: pyEnv(), onData: o.quiet ? undefined : stream(ctx) });
  if (r.error) throw envError(`could not start Python (${py.via}): ${r.error.message}`, pythonFix());
  if (/ModuleNotFoundError: No module named '(\w+)'/.test(r.output)) {
    const m = /ModuleNotFoundError: No module named '(\w+)'/.exec(r.output)?.[1];
    ctx.out.error({ code: "python-package", message: `Python package missing: ${m}`, fix: "npx sahna doctor --fix" });
  }
  if (/Executable doesn't exist|playwright install/.test(r.output) && r.code !== 0) {
    ctx.out.error({ code: "chromium", message: "Playwright's Chromium is not installed", fix: "npx sahna doctor --fix" });
  }
  return r;
}

/** npm with fixed args in the project, streamed. @param {Ctx} ctx @param {string} root @param {string[]} args */
async function npmIn(ctx, root, args, inherit = false) {
  const n = findNpm();
  const r = await run(n.cmd, [...n.pre, ...args], { cwd: root, shell: n.shell, inherit: inherit && !ctx.out.json, onData: stream(ctx) });
  if (r.error) throw envError(`could not run npm: ${r.error.message}`, "Install Node.js LTS (it includes npm): https://nodejs.org");
  return r;
}

/** @param {Ctx} ctx @param {string} root */
async function ensureInstalled(ctx, root) {
  if (existsSync(path.join(root, "node_modules"))) return false;
  ctx.out.step("npm install (first run in this project)");
  const r = await npmIn(ctx, root, ["install", "--no-audit", "--no-fund"]);
  if (r.code !== 0) throw new DeckError("npm install failed", { fix: "read the npm error above; then run: npm install", data: { tail: tail(r.output) } });
  return true;
}

/** Build dist-single if it is missing or older than the sources. @param {Ctx} ctx @param {string} root @param {boolean} [force] */
async function ensureBuilt(ctx, root, force = false) {
  await ensureInstalled(ctx, root);
  if (!force && !buildStale(root)) return "fresh";
  ctx.out.step("npm run build:single");
  const r = await npmIn(ctx, root, ["run", "build:single"]);
  if (r.code !== 0) throw new DeckError("build failed (tsc or vite)", { fix: "fix the errors above, then: npx sahna build", data: { tail: tail(r.output) } });
  return "rebuilt";
}

const tail = (/** @type {string} */ s, n = 30) => s.split(/\r?\n/).filter(Boolean).slice(-n);
const rel = (/** @type {string} */ root, /** @type {string} */ p) => path.relative(root, p) || ".";
const csv = (/** @type {string | undefined} */ s) => (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);

/** @param {string} s */
function oneOf(s, list, what) {
  if (!list.includes(s)) throw usageError(`unknown ${what} "${s}"; use one of: ${list.join(", ")}`);
  return s;
}

/** @param {string} assets */
export function listPacks(assets) {
  const dir = path.join(assets, "packs");
  return readdirSync(dir)
    .filter((n) => existsSync(path.join(dir, n, "pack.json")))
    .sort()
    .map((n) => {
      const m = JSON.parse(readFileSync(path.join(dir, n, "pack.json"), "utf8"));
      return { name: n, label: m.label, pitch: m.pitch, dial: m.dial, prefers: m.prefers, fits: m.fits ?? [] };
    });
}

const COPY_SKIP = /(^|[\\/])(node_modules|dist|dist-single|export|walk|wow|shots|report|world-shots|moodboard|recordings|\.run|__pycache__|\.DS_Store|\.venv)$/;

/** Copy the CLI into a project (sahna-cli/) so the project works on its own, zipped or moved. */
function vendorCli(root) {
  const dst = path.join(root, "sahna-cli");
  rmSync(dst, { recursive: true, force: true });
  cpSync(CLI_DIR, dst, { recursive: true, filter: (src) => !/(^|[\\/])(node_modules|test|\.git)$/.test(path.relative(CLI_DIR, src)) });
  return dst;
}

/** @param {string} root @param {string} assets */
function writeProjectMeta(root, assets) {
  writeFileSync(path.join(root, PROJECT_META), JSON.stringify({ assets, cli: VERSION }, null, 2) + "\n");
}

/** @param {string} file */
function editText(file, fn) {
  const t = readFileSync(file, "utf8");
  const n = fn(t);
  if (n !== t) writeFileSync(file, n);
  return n !== t;
}

// ───────────────────────────── commands ─────────────────────────────

/** @type {Command[]} */
export const COMMANDS = [
  {
    name: "new",
    summary: "create a deck: copy the starter, apply a pack, install modules, npm install",
    usage: "sahna new <dir> [--pack <name>] [--style academic|balanced|showcase] [--lang en|ru|kk] [--modules a,b] [--title <text>]",
    options: {
      pack: { type: "string", arg: "name", desc: "style pack to apply (sahna pack list)" },
      style: { type: "string", arg: "s", desc: "creative dial: academic | balanced | showcase (default: the pack's)" },
      lang: { type: "string", arg: "l", desc: "talk language: en | ru | kk (fonts are checked for it)" },
      modules: { type: "string", arg: "list", desc: `comma list: ${MODULE_NAMES.join(", ")}` },
      title: { type: "string", arg: "text", desc: "DECK.title" },
      "no-install": { type: "boolean", desc: "skip npm install" },
    },
    examples: ["sahna new my-talk --pack midnight --style showcase", 'sahna new "C:\\Talks\\Q3 review" --pack calm --lang kk --modules diagram,data-viz --title "Q3 review"'],
    json: '{dir, name, title, pack, style, lang, modules[], installed, next[]}',
    async run(ctx) {
      const target = ctx.pos[0];
      if (!target) throw usageError("missing <dir>", "sahna new my-talk --pack midnight");
      const dir = path.resolve(ctx.cwd, target);
      if (existsSync(dir) && readdirSync(dir).length) throw usageError(`${dir} exists and is not empty`, "pick a new folder name");
      const assets = ctx.assets();
      const packs = listPacks(assets).map((p) => p.name);
      const pack = ctx.opts.pack ? oneOf(ctx.opts.pack, packs, "pack") : null;
      const style = ctx.opts.style ? oneOf(ctx.opts.style, STYLES, "style") : null;
      const lang = ctx.opts.lang ? oneOf(ctx.opts.lang, LOCALES, "language") : null;
      const modules = csv(ctx.opts.modules);
      for (const m of modules) oneOf(m, MODULE_NAMES, "module");
      if (pack) ctx.python(); // fail early, before copying anything

      ctx.out.step(`copy the starter → ${dir}`);
      mkdirSync(dir, { recursive: true });
      const starter = path.join(assets, "starter");
      cpSync(starter, dir, { recursive: true, filter: (src) => !COPY_SKIP.test(path.relative(starter, src)) });
      vendorCli(dir);
      writeProjectMeta(dir, assets);
      const name = slug(path.basename(dir));
      editText(path.join(dir, "package.json"), (t) => {
        const p = JSON.parse(t);
        p.name = name;
        return editPackageJson(JSON.stringify(p, null, 2), {});
      });
      editText(path.join(dir, ".gitignore"), (t) => addGitignore(t, [PROJECT_META, "report/", "moodboard/", ".venv/"]));
      const cfg = path.join(dir, "src", "deck", "config.ts");
      if (ctx.opts.title) editText(cfg, (t) => setDeckField(t, "title", ctx.opts.title));

      if (pack) {
        ctx.out.step(`apply pack ${pack}`);
        const args = [pack, "--project", dir, ...(style ? ["--style", style] : []), ...(lang ? ["--lang", lang] : [])];
        const r = await runPy(ctx, path.join(assets, "tools", "apply_pack.py"), args);
        if (r.code !== 0) throw new DeckError(`apply_pack.py ${pack} failed`, { fix: `the deck is in ${dir}; fix the problem above and run: npx sahna pack apply ${pack}`, data: { tail: tail(r.output) } });
      } else {
        editText(cfg, (t) => (style ? setDeckField(t, "style", style) : t));
        editText(cfg, (t) => (lang ? setDeckField(t, "locale", lang) : t));
      }
      for (const m of modules) {
        ctx.out.step(`module ${m}`);
        const r = installModule(assets, dir, m);
        ctx.out.info(c.dim(`  ${r.copied} files; edited ${r.edited.join(", ") || "nothing"}`));
      }
      let installed = false;
      if (!ctx.opts["no-install"]) {
        ctx.out.step("npm install");
        const r = await npmIn(ctx, dir, ["install", "--no-audit", "--no-fund"]);
        if (r.code !== 0) throw new DeckError("npm install failed", { fix: `cd "${dir}" && npm install`, data: { tail: tail(r.output) } });
        installed = true;
      }
      const t = readFileSync(cfg, "utf8");
      const data = {
        dir, name, title: readDeckField(t, "title"), pack, style: readDeckField(t, "style"), lang: readDeckField(t, "locale"), modules, installed,
        next: [`cd "${path.relative(ctx.cwd, dir) || "."}"`, ...(installed ? [] : ["npm install"]), "npx sahna dev", "npx sahna check"],
      };
      ctx.out.ok(`deck ready: ${dir}  (style ${data.style}, ${data.lang}${pack ? `, pack ${pack}` : ""}${modules.length ? `, modules ${modules.join(", ")}` : ""})`);
      ctx.out.next(data.next);
      return data;
    },
  },
  {
    name: "dev",
    summary: "start the Vite dev server (Ctrl+C stops it)",
    usage: "sahna dev [-- <vite args>]",
    examples: ["sahna dev", "sahna dev -- --host --port 5180"],
    json: "{exitCode}",
    async run(ctx) {
      const root = ctx.project();
      await ensureInstalled(ctx, root);
      const r = await npmIn(ctx, root, ["run", "dev", ...(ctx.rest.length ? ["--", ...ctx.rest] : [])], true);
      return { exitCode: r.code };
    },
  },
  {
    name: "build",
    summary: "build dist/ and the single offline file dist-single/index.html",
    usage: "sahna build [--single]",
    options: { single: { type: "boolean", desc: "only the single-file build (dist-single/index.html)" } },
    examples: ["sahna build", "sahna build --single"],
    json: "{dist, single, bytes}",
    async run(ctx) {
      const root = ctx.project();
      await ensureInstalled(ctx, root);
      for (const script of ctx.opts.single ? ["build:single"] : ["build", "build:single"]) {
        ctx.out.step(`npm run ${script}`);
        const r = await npmIn(ctx, root, ["run", script]);
        if (r.code !== 0) throw new DeckError(`npm run ${script} failed`, { fix: "fix the errors above, then run deck build again", data: { tail: tail(r.output) } });
      }
      const single = singleHtml(root);
      const data = { dist: ctx.opts.single ? null : path.join(root, "dist"), single, bytes: statSync(single).size };
      ctx.out.ok(`built ${rel(root, single)} (${(data.bytes / 1024).toFixed(0)} kB)`);
      ctx.out.next(["npx sahna open", "npx sahna check"]);
      return data;
    },
  },
  {
    name: "open",
    summary: "open dist-single/index.html in the browser (builds it if stale)",
    usage: "sahna open [--style s] [--hash scene-id] [--print]",
    options: {
      style: { type: "string", arg: "s", desc: "preview another dial setting (?style=)" },
      hash: { type: "string", arg: "id", desc: "open a scene (#id), or presenter / print" },
      print: { type: "boolean", desc: "only print the URL" },
      "no-build": { type: "boolean", desc: "do not rebuild a stale file" },
    },
    examples: ["sahna open", "sahna open --style academic", "sahna open --hash presenter"],
    json: "{url, opened}",
    async run(ctx) {
      const root = ctx.project();
      if (!ctx.opts["no-build"]) await ensureBuilt(ctx, root);
      else if (!existsSync(singleHtml(root))) throw new DeckError("dist-single/index.html does not exist", { fix: "npx sahna build" });
      const q = ctx.opts.style ? `style=${oneOf(ctx.opts.style, STYLES, "style")}` : "";
      const url = deckUrl(root, q) + (ctx.opts.hash ? `#${encodeURIComponent(ctx.opts.hash)}` : "");
      if (ctx.opts.print) { ctx.out.line(url); return { url, opened: false }; }
      const opened = await openUrl(url);
      if (opened) ctx.out.ok(`opened ${url}`);
      else ctx.out.warn(`could not start a browser here; open this in Chrome: ${url}`);
      return { url, opened };
    },
  },
  {
    name: "check",
    summary: "build if stale, run the checks, print one summary table, write report/",
    usage: "sahna check [--style all|academic|balanced|showcase] [--only walk,overlap,transitions,seek,wow,modules]",
    options: {
      style: { type: "string", arg: "s", desc: "all, one style, or a comma list (default: DECK.style)" },
      only: { type: "string", arg: "list", desc: `subset of: ${CHECK_NAMES.join(", ")}` },
      report: { type: "string", arg: "dir", desc: "where reports and contact sheets go (default report/)" },
      "no-build": { type: "boolean", desc: "check the existing dist-single even if it is stale" },
    },
    examples: ["sahna check", "sahna check --style all", "sahna check --only walk,wow --style academic", "sahna check --json"],
    json: "{styles[], build, report, summary, rows: [{check, style, label, status: PASS|FAIL, summary, fails[], seconds, artifacts[], details?}]}",
    async run(ctx) {
      const root = ctx.project();
      const st = projectState(root);
      const styleArg = ctx.opts.style ?? st.style ?? "balanced";
      const styles = styleArg === "all" ? STYLES : csv(styleArg).map((s) => oneOf(s, STYLES, "style"));
      const only = ctx.opts.only ? csv(ctx.opts.only).map((s) => oneOf(s, CHECK_NAMES, "check")) : CHECK_NAMES;
      const report = path.resolve(root, ctx.opts.report ?? "report");
      ctx.python();
      const built = ctx.opts["no-build"] ? "skipped" : await ensureBuilt(ctx, root);
      if (!existsSync(singleHtml(root))) throw new DeckError("dist-single/index.html does not exist", { fix: "npx sahna build" });
      mkdirSync(report, { recursive: true });
      const jobs = planChecks({ root, report, styles, only, modules: st.modules, locale: st.locale ?? "en", url: (q) => deckUrl(root, q), html: singleHtml(root) });
      const rows = [];
      for (const j of jobs) {
        ctx.out.progress(`${j.label} (${rows.length + 1}/${jobs.length})`);
        if (!ctx.out.json) ctx.out.info(c.bold(`\n── ${j.label} ${"─".repeat(Math.max(2, 50 - j.label.length))}`));
        const t0 = Date.now();
        const r = await runPy(ctx, path.join(root, ...j.script.split("/")), j.args, { cwd: root });
        const p = parseCheckOutput(r.output, r.code);
        rows.push({
          check: j.check, style: j.style, label: j.label, status: p.status, exitCode: r.code, summary: p.summary, fails: p.fails,
          seconds: Math.round((Date.now() - t0) / 100) / 10, artifacts: j.artifacts.filter((a) => existsSync(a)),
          ...(j.parse ? { details: j.parse(r) } : {}),
        });
      }
      const ok = rows.every((r) => r.status === "PASS");
      const summary = { pass: rows.filter((r) => r.status === "PASS").length, fail: rows.filter((r) => r.status !== "PASS").length };
      const data = { styles, build: built, report, ok, summary, rows };
      writeFileSync(path.join(report, "summary.json"), JSON.stringify(data, null, 2) + "\n");
      writeFileSync(path.join(report, "summary.md"), summaryMarkdown(rows, { styles, ok, built }));
      if (!ctx.out.json) {
        ctx.out.line("");
        ctx.out.table(["check", "style", "status", "result", "s"], rows.map((r) => [r.check.startsWith("module:") ? r.label : r.check, r.style.includes(",") ? "all" : r.style, r.status === "PASS" ? c.green("PASS") : c.red("FAIL"), r.summary, String(r.seconds)]));
        for (const r of rows.filter((x) => x.status !== "PASS")) {
          ctx.out.line(c.red(`\n${r.label}:`));
          for (const f of r.fails.slice(0, 8)) ctx.out.line(`  ${f}`);
        }
        ctx.out.line(`\n${ok ? c.green("PASS") : c.red("FAIL")}  ${summary.pass} passed, ${summary.fail} failed · report: ${rel(ctx.cwd, path.join(report, "summary.md"))}`);
        const sheets = rows.flatMap((r) => r.artifacts.filter((a) => a.endsWith(".png")));
        if (sheets.length) ctx.out.info(c.dim(`contact sheets: ${sheets.map((s) => rel(ctx.cwd, s)).join(", ")}`));
        ctx.out.next(ok ? ["npx sahna export", "npx sahna film"] : ["fix the FAIL lines above (details in report/summary.md)", `npx sahna check --only ${[...new Set(rows.filter((r) => r.status !== "PASS").map((r) => r.check.replace(/^module:.*/, "modules")))].join(",")}`]);
      }
      if (!ok) for (const r of rows.filter((x) => x.status !== "PASS")) ctx.out.error({ code: "check-failed", message: `${r.label}: ${r.summary}` });
      return { ...data, exit: ok ? EXIT.OK : EXIT.FAIL };
    },
  },
  {
    name: "export",
    summary: "PDF and PPTX of every scene's end state (export.py)",
    usage: "sahna export [--pdf] [--pptx] [--name n] [--out dir] [--two-page a,b] [--theme light|dark]",
    options: {
      pdf: { type: "boolean", desc: "PDF (default: both)" },
      pptx: { type: "boolean", desc: "PPTX (default: both)" },
      name: { type: "string", arg: "n", desc: "file name (default: the package name)" },
      out: { type: "string", arg: "dir", desc: "output folder (default export/)" },
      "two-page": { type: "string", arg: "ids", desc: "scenes with a start and an end page" },
      theme: { type: "string", arg: "t", desc: "light | dark (decks with darkTheme)" },
    },
    examples: ["sahna export", "sahna export --pdf --name q3-review"],
    json: "{pages, pdf, pptx, png, out}",
    async run(ctx) {
      const root = ctx.project();
      ctx.python();
      await ensureBuilt(ctx, root);
      const formats = [ctx.opts.pdf && "pdf", ctx.opts.pptx && "pptx"].filter(Boolean);
      const name = ctx.opts.name ?? slug(projectState(root).name);
      const out = path.resolve(root, ctx.opts.out ?? "export");
      const args = ["--out", out, "--name", name, "--formats", (formats.length ? formats : ["pdf", "pptx"]).join(",")];
      if (ctx.opts["two-page"]) args.push("--two-page", ctx.opts["two-page"]);
      if (ctx.opts.theme) args.push("--theme", oneOf(ctx.opts.theme, ["light", "dark"], "theme"));
      const r = await runPy(ctx, path.join(root, "scripts", "export.py"), args, { cwd: root });
      if (r.code !== 0) throw new DeckError("export failed", { fix: "read the errors above (page errors fail the export); npx sahna doctor checks the Python side", data: { tail: tail(r.output) } });
      const pages = Number(/(\d+) pages →/.exec(r.output)?.[1] ?? 0);
      const f = (/** @type {string} */ ext) => (existsSync(path.join(out, `${name}.${ext}`)) && (!formats.length || formats.includes(ext)) ? path.join(out, `${name}.${ext}`) : null);
      const data = { pages, pdf: f("pdf"), pptx: f("pptx"), png: path.join(out, "png"), out };
      if (!ctx.out.json) ctx.out.next(["send dist-single/index.html with the PDF and PPTX", "npx sahna rehearse report"]);
      return data;
    },
  },
  {
    name: "film",
    summary: "film every transition at fixed times into contact sheets (film_transitions.py)",
    usage: "sahna film [--style all|s,s] [--only ids] [--tr id:kind,…]",
    options: {
      style: { type: "string", arg: "s", desc: "styles (default: all three)" },
      only: { type: "string", arg: "ids", desc: "transitions INTO these scenes" },
      tr: { type: "string", arg: "map", desc: "?tr= override, e.g. end:sweep" },
      out: { type: "string", arg: "dir", desc: "default report/film" },
    },
    examples: ["sahna film", "sahna film --style showcase --only results"],
    json: "{sheets[], out}",
    async run(ctx) {
      const root = ctx.project();
      ctx.python();
      await ensureBuilt(ctx, root);
      const out = path.resolve(root, ctx.opts.out ?? path.join("report", "film"));
      const styles = !ctx.opts.style || ctx.opts.style === "all" ? STYLES : csv(ctx.opts.style).map((s) => oneOf(s, STYLES, "style"));
      const args = ["--style", styles.join(","), "--out", out];
      if (ctx.opts.only) args.push("--only", ctx.opts.only);
      if (ctx.opts.tr) args.push("--tr", ctx.opts.tr);
      const r = await runPy(ctx, path.join(root, "scripts", "film_transitions.py"), args, { cwd: root });
      if (r.code !== 0) throw new DeckError("film_transitions.py failed", { data: { tail: tail(r.output) } });
      return { sheets: [...r.output.matchAll(/^sheet: (.+)$/gm)].map((m) => m[1].trim()), out };
    },
  },
  {
    name: "moodboard",
    summary: "render 2–3 style packs with the talk's real content (moodboard.py)",
    usage: "sahna moodboard --packs a,b,c [--content talk.json] [--style s] [--out dir]",
    options: {
      packs: { type: "string", arg: "list", desc: "comma list, or all" },
      content: { type: "string", arg: "file", desc: "JSON with title, signature points and a number" },
      style: { type: "string", arg: "s", desc: "show every pack under this dial" },
      out: { type: "string", arg: "dir", desc: "default moodboard/" },
    },
    examples: ["sahna moodboard --packs midnight,oyu,calm --content talk.json"],
    json: "{out, grid, sheets[]}",
    async run(ctx) {
      if (!ctx.opts.packs) throw usageError("--packs is required", "sahna moodboard --packs midnight,oyu,calm");
      const assets = ctx.assets();
      const base = ctx.maybeProject() ?? ctx.cwd;
      const out = path.resolve(base, ctx.opts.out ?? "moodboard");
      const args = ["--packs", ctx.opts.packs, "--out", out];
      if (ctx.opts.content) args.push("--content", path.resolve(ctx.cwd, ctx.opts.content));
      if (ctx.opts.style) args.push("--style", oneOf(ctx.opts.style, STYLES, "style"));
      const r = await runPy(ctx, path.join(assets, "tools", "moodboard.py"), args, { cwd: base });
      if (r.code !== 0) throw new DeckError("moodboard.py failed", { data: { tail: tail(r.output) } });
      const grid = path.join(out, "grid.png");
      return { out, grid: existsSync(grid) ? grid : null, sheets: [...r.output.matchAll(/^ok\s+\S+: (.+\.png)$/gm)].map((m) => m[1]) };
    },
  },
  {
    name: "pack",
    summary: "style packs: list, apply <name>, lint",
    usage: "sahna pack list | sahna pack apply <name> [--style s] [--lang l] [--no-install] | sahna pack lint [--lang l]",
    sub: ["list", "apply", "lint"],
    options: {
      style: { type: "string", arg: "s", desc: "apply: override the pack's recommended dial" },
      lang: { type: "string", arg: "l", desc: "apply/lint: check fonts for en | ru | kk" },
      "no-install": { type: "boolean", desc: "apply: skip npm install" },
    },
    examples: ["sahna pack list", "sahna pack apply oyu --lang kk", "sahna pack lint"],
    json: "list: {packs: [{name, label, pitch, dial, prefers, fits[]}], current} · apply: {pack, style, lang} · lint: {fails, warnings}",
    async run(ctx) {
      const sub = ctx.pos[0];
      const assets = ctx.assets();
      if (!sub || sub === "list") {
        const packs = listPacks(assets);
        const root = ctx.maybeProject();
        const current = root ? projectState(root).pack : null;
        ctx.out.table(["pack", "dial", "look", "fits"], packs.map((p) => [p.name === current ? c.green(`${p.name} *`) : p.name, p.dial, p.prefers, p.fits.join(", ")]));
        if (current) ctx.out.info(c.dim(`* = applied to this deck`));
        ctx.out.next(["npx sahna moodboard --packs a,b,c --content talk.json", "npx sahna pack apply <name>"]);
        return { packs, current };
      }
      if (sub === "apply") {
        const name = ctx.pos[1];
        if (!name) throw usageError("missing <name>", "sahna pack apply midnight");
        oneOf(name, listPacks(assets).map((p) => p.name), "pack");
        const root = ctx.project();
        const args = [name, "--project", root];
        if (ctx.opts.style) args.push("--style", oneOf(ctx.opts.style, STYLES, "style"));
        if (ctx.opts.lang) args.push("--lang", oneOf(ctx.opts.lang, LOCALES, "language"));
        const r = await runPy(ctx, path.join(assets, "tools", "apply_pack.py"), args, { cwd: root });
        if (r.code !== 0) throw new DeckError(`apply_pack.py ${name} failed`, { data: { tail: tail(r.output) } });
        if (!ctx.opts["no-install"]) {
          ctx.out.step("npm install (the pack's fonts)");
          const n = await npmIn(ctx, root, ["install", "--no-audit", "--no-fund"]);
          if (n.code !== 0) throw new DeckError("npm install failed", { fix: "npm install", data: { tail: tail(n.output) } });
        }
        const st = projectState(root);
        ctx.out.next(["npx sahna check --only walk,wow,overlap"]);
        return { pack: st.pack, style: st.style, lang: st.locale };
      }
      if (sub === "lint") {
        const args = ctx.opts.lang ? ["--lang", oneOf(ctx.opts.lang, LOCALES, "language")] : [];
        const r = await runPy(ctx, path.join(assets, "tools", "pack_lint.py"), args);
        const m = /(\d+) fail\(s\), (\d+) warning\(s\)/.exec(r.output);
        const data = { fails: Number(m?.[1] ?? (r.code ? 1 : 0)), warnings: Number(m?.[2] ?? 0), lines: tail(r.output, 200).filter((l) => /^(FAIL|WARN|warn)/.test(l)) };
        return { ...data, exit: r.code === 0 ? EXIT.OK : EXIT.FAIL };
      }
      throw usageError(`unknown subcommand "pack ${sub}"`, "sahna pack list | apply <name> | lint");
    },
  },
  {
    name: "style",
    summary: "show or set the creative dial (DECK.style in src/deck/config.ts)",
    usage: "sahna style [academic|balanced|showcase]",
    examples: ["sahna style", "sahna style academic"],
    json: "{style, previous}",
    async run(ctx) {
      return setField(ctx, "style", STYLES, "style");
    },
  },
  {
    name: "lang",
    summary: "show or set the talk language (DECK.locale: number formats, <html lang>)",
    usage: "sahna lang [en|ru|kk]",
    examples: ["sahna lang kk"],
    json: "{locale, previous}",
    async run(ctx) {
      const r = await setField(ctx, "locale", LOCALES, "language");
      if (ctx.pos[0] && ctx.pos[0] !== "en") ctx.out.info(c.dim("fonts: the pack's faces were checked for the pack's language; re-check with: npx sahna pack apply <pack> --lang " + ctx.pos[0]));
      return r;
    },
  },
  {
    name: "module",
    summary: "modules: list, add <name…> (copies files, edits package.json and config, npm install)",
    usage: "sahna module list | sahna module add <name> [<name>…] [--force] [--no-install]",
    sub: ["list", "add"],
    options: {
      force: { type: "boolean", desc: "add: re-copy an installed module (your graphs, geo and remote/config.json are kept)" },
      "no-install": { type: "boolean", desc: "add: skip npm install" },
    },
    examples: ["sahna module list", "sahna module add code-scene", "sahna module add diagram data-viz"],
    json: "list: {modules: [{name, summary, installed}]} · add: {added: [{module, copied, kept[], edited[], already}], installed}",
    async run(ctx) {
      const sub = ctx.pos[0];
      if (!sub || sub === "list") {
        const root = ctx.maybeProject();
        const have = root ? installedModules(root) : [];
        const modules = MODULE_NAMES.map((m) => ({ name: m, summary: MODULES[m].summary, installed: have.includes(m) }));
        ctx.out.table(["module", "installed", "what"], modules.map((m) => [m.name, m.installed ? c.green("yes") : root ? "no" : "–", m.summary]));
        ctx.out.next(["npx sahna module add <name>"]);
        return { modules, project: root };
      }
      if (sub === "add") {
        const names = ctx.pos.slice(1).flatMap((s) => csv(s));
        if (!names.length) throw usageError("missing <name>", `sahna module add ${MODULE_NAMES[0]}   (one of: ${MODULE_NAMES.join(", ")})`);
        for (const n of names) oneOf(n, MODULE_NAMES, "module");
        const root = ctx.project();
        const assets = ctx.assets();
        const added = [];
        for (const n of names) {
          const r = installModule(assets, root, n, { force: ctx.opts.force });
          added.push(r);
          if (r.already) ctx.out.warn(`${n} is already installed (--force re-copies it)`);
          else ctx.out.ok(`${n}: ${r.copied} files${r.kept.length ? `, kept ${r.kept.length} of yours` : ""}; edited ${r.edited.join(", ") || "nothing"}`);
        }
        let installed = false;
        if (!ctx.opts["no-install"] && added.some((a) => !a.already)) {
          ctx.out.step("npm install");
          const r = await npmIn(ctx, root, ["install", "--no-audit", "--no-fund"]);
          if (r.code !== 0) throw new DeckError("npm install failed", { fix: "npm install", data: { tail: tail(r.output) } });
          installed = true;
        }
        const after = added.flatMap((a) => a.after);
        if (!ctx.out.json) {
          for (const a of after) ctx.out.info(c.dim(`  · ${a}`));
          ctx.out.next(["npx sahna build", "npx sahna check --only modules"]);
        }
        return { added, installed };
      }
      throw usageError(`unknown subcommand "module ${sub}"`, "sahna module list | add <name>");
    },
  },
  {
    name: "rehearse",
    summary: "rehearsal report from the presenter's exported JSON (rehearsal_report.py)",
    usage: "sahna rehearse report [file.json] [--compare] [--run n]",
    sub: ["report"],
    options: {
      compare: { type: "boolean", desc: "compare every run in the file" },
      run: { type: "string", arg: "n", desc: "which run (default: the last)" },
      out: { type: "string", arg: "dir", desc: "default report/rehearsal" },
    },
    examples: ["sahna rehearse report", "sahna rehearse report ~/Downloads/rehearsal-2026-11-19-18-02.json --compare"],
    json: "{file, out, report, png}",
    async run(ctx) {
      if (ctx.pos[0] !== "report") throw usageError(ctx.pos[0] ? `unknown subcommand "rehearse ${ctx.pos[0]}"` : "missing subcommand", "sahna rehearse report [file.json]");
      const root = ctx.project();
      let file = ctx.pos[1] ? path.resolve(ctx.cwd, ctx.pos[1]) : findRehearsal(root);
      if (!file) throw usageError("no rehearsal JSON found (looked in the project, rehearsal/ and Downloads)", "present with index.html?rehearse, press V, Export JSON, then: sahna rehearse report <file>");
      if (!existsSync(file)) throw usageError(`${file} does not exist`);
      const out = path.resolve(root, ctx.opts.out ?? path.join("report", "rehearsal"));
      const args = [file, "--out", out];
      if (ctx.opts.compare) args.push("--compare");
      if (ctx.opts.run) args.push("--run", String(Number(ctx.opts.run)));
      const r = await runPy(ctx, path.join(root, "scripts", "rehearsal_report.py"), args, { cwd: root });
      if (r.code !== 0) throw new DeckError("rehearsal_report.py failed", { data: { tail: tail(r.output) } });
      return { file, out, report: path.join(out, "report.md"), png: path.join(out, "report.png") };
    },
  },
  ...["record", "stop", "mix", "links"].map((name) => /** @type {Command} */ ({
    name,
    summary: {
      record: "phone remotes + recording: server, tunnel, links, QR (remote module)",
      stop: "stop the running take and mix it (remote module)",
      mix: "mix the latest take: voices under the OBS video (remote module)",
      links: "print the phone links and QR again (remote module)",
    }[name],
    usage: `sahna ${name} [-- <start.py args>]`,
    examples: [`sahna ${name}`, ...(name === "record" ? ["sahna record -- --local --no-open"] : [])],
    json: "{exitCode, output[]}",
    async run(ctx) {
      const root = ctx.project();
      if (!existsSync(path.join(root, "remote", "run.mjs"))) throw usageError("the remote module is not installed in this deck", "npx sahna module add remote");
      ctx.python();
      const r = await run(process.execPath, [path.join(root, "remote", "run.mjs"), `--${name}`, ...ctx.rest], { cwd: root, inherit: !ctx.out.json, onData: stream(ctx), env: pyEnv() });
      return { exitCode: r.code, output: tail(r.output, 60), exit: r.code === 0 ? EXIT.OK : EXIT.FAIL };
    },
  })),
  {
    name: "doctor",
    summary: "check Node, Python, pip packages, Chromium, ffmpeg, Docker, cloudflared, OBS; --fix installs what it safely can",
    usage: "sahna doctor [--fix]",
    options: { fix: { type: "boolean", desc: "npm install, pip install (--user or a project .venv), playwright install chromium" } },
    examples: ["sahna doctor", "sahna doctor --fix"],
    json: "{ok, checks: [{id, label, status: ok|warn|fail|skip, detail, fix?}], fixed[], python}",
    async run(ctx) {
      const root = ctx.maybeProject();
      const assets = resolveAssets({ flag: ctx.opts.assets, project: root }).dir;
      const r = await doctor({ project: root, modules: root ? installedModules(root) : [], assets, fix: !!ctx.opts.fix, log: (s) => ctx.out.step(s), onData: stream(ctx) });
      if (!ctx.out.json) {
        const mark = { ok: c.green("ok"), warn: c.yellow("warn"), fail: c.red("FAIL"), skip: c.dim("–") };
        ctx.out.table(["", "what", "found"], r.checks.map((x) => [mark[x.status], x.label, x.detail]));
        const fixes = r.checks.filter((x) => x.fix && (x.status === "fail" || x.status === "warn"));
        if (fixes.length) {
          ctx.out.line(c.bold("\nFixes:"));
          for (const x of fixes) ctx.out.line(`  ${x.label}: ${c.cyan(x.fix ?? "")}`);
        }
        if (r.fixed.length) ctx.out.ok(`fixed: ${r.fixed.join("; ")}`);
        if (!r.ok && !ctx.opts.fix) ctx.out.next(["npx sahna doctor --fix"]);
      }
      for (const x of r.checks.filter((x) => x.status === "fail")) ctx.out.error({ code: `doctor:${x.id}`, message: `${x.label}: ${x.detail}`, fix: x.fix });
      return { ...r, exit: r.ok ? EXIT.OK : EXIT.FAIL };
    },
  },
];

/** style / lang: show or set. @param {Ctx} ctx @param {string} field @param {string[]} allowed @param {string} what */
async function setField(ctx, field, allowed, what) {
  const root = ctx.project();
  const cfg = path.join(root, "src", "deck", "config.ts");
  const text = readFileSync(cfg, "utf8");
  const previous = readDeckField(text, field);
  const want = ctx.pos[0];
  if (!want) {
    ctx.out.line(`${field}: ${previous}`);
    return { [field]: previous, previous };
  }
  oneOf(want, allowed, what);
  writeFileSync(cfg, setDeckField(text, field, want));
  ctx.out.ok(`DECK.${field} = "${want}"${previous && previous !== want ? ` (was ${previous})` : ""}`);
  ctx.out.next(field === "style" ? ["npx sahna check --only walk,wow", "npx sahna open"] : ["npx sahna check --only walk,wow,overlap"]);
  return { [field]: want, previous };
}

/** Newest rehearsal*.json in the project, rehearsal/ or Downloads. @param {string} root */
export function findRehearsal(root) {
  const dirs = [root, path.join(root, "rehearsal"), path.join(os.homedir(), "Downloads")];
  let best = null, t = 0;
  for (const d of dirs) {
    let list = [];
    try { list = readdirSync(d); } catch { continue; }
    for (const f of list) {
      if (!/^rehearsal.*\.json$/i.test(f) || /sample/i.test(f)) continue;
      const m = statSync(path.join(d, f)).mtimeMs;
      if (m > t) { t = m; best = path.join(d, f); }
    }
  }
  return best;
}

/** Open a file:// URL in the default browser without a shell. */
export async function openUrl(url) {
  const [cmd, args] =
    process.platform === "win32" ? ["rundll32", ["url.dll,FileProtocolHandler", url]]
    : process.platform === "darwin" ? ["open", [url]]
    : ["xdg-open", [url]];
  const r = await run(cmd, args, {});
  return !r.error && r.code === 0;
}

/** @param {string} name */
export const findCommand = (name) => COMMANDS.find((x) => x.name === name);
export { findProjectRoot, resolveAssets, findPython, projectState };

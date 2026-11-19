// node --test test/   (no dependencies)
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { parse, isInteractive } from "../lib/cli.js";
import { addCodeScenePlugin, addGitignore, addWorldInstall, editPackageJson, readDeckField, sceneIds, setDeckField, slug, worldTs } from "../lib/edit.js";
import { findPython, pythonCandidates } from "../lib/python.js";
import { findNpm, quoteWin } from "../lib/proc.js";
import { findProjectRoot, resolveAssets, CLI_DIR } from "../lib/project.js";
import { parseCheckOutput, planChecks } from "../lib/checks.js";
import { buildMenu } from "../lib/tui.js";
import { MODULES, installModule, planCopies } from "../lib/modules.js";
import { nodeOk } from "../lib/doctor.js";

const ASSETS = path.resolve(CLI_DIR, "..");
const STARTER_CFG = readFileSync(path.join(ASSETS, "starter", "src", "deck", "config.ts"), "utf8");

// ── arg parsing ───────────────────────────────────────────────────────────
test("parse: command, flags, positionals, pass-through", () => {
  const p = parse(["new", "my talk", "--pack", "midnight", "--modules=diagram,data-viz", "--json"]);
  assert.equal(p.command, "new");
  assert.deepEqual(p.pos, ["my talk"]);
  assert.equal(p.opts.pack, "midnight");
  assert.equal(p.opts.modules, "diagram,data-viz");
  assert.equal(p.opts.json, true);
  const d = parse(["dev", "--", "--host", "--port", "5180"]);
  assert.deepEqual(d.rest, ["--host", "--port", "5180"]);
  assert.deepEqual(d.pos, []);
});

test("parse: global option values never become the command", () => {
  const p = parse(["-C", "new", "check", "--style", "all"]);
  assert.equal(p.command, "check");
  assert.equal(p.opts.project, "new");
  assert.equal(p.opts.style, "all");
});

test("parse: subcommands keep their positionals", () => {
  const p = parse(["module", "add", "code-scene", "world", "--no-install"]);
  assert.deepEqual(p.pos, ["add", "code-scene", "world"]);
  assert.equal(p.opts["no-install"], true);
});

test("parse: unknown command and unknown option are usage errors (exit 2)", () => {
  assert.throws(() => parse(["frobnicate"]), (e) => e.exit === 2 && /unknown command/.test(e.message));
  assert.throws(() => parse(["check", "--colour"]), (e) => e.exit === 2 && e.fix.includes("sahna check --help"));
  assert.throws(() => parse(["style", "--pack", "x"]), (e) => e.exit === 2);
});

test("parse: Windows paths with spaces and backslashes stay intact", () => {
  const p = parse(["new", "C:\\Users\\Dias\\My Talks\\q3 review", "--title", 'He said "hi" \\o/']);
  assert.deepEqual(p.pos, ["C:\\Users\\Dias\\My Talks\\q3 review"]);
  assert.equal(p.opts.title, 'He said "hi" \\o/');
});

test("isInteractive: CI, pipes and SAHNA_NO_MENU never get the menu", () => {
  const tty = { isTTY: true };
  assert.equal(isInteractive({}, tty, tty), true);
  assert.equal(isInteractive({ CI: "1" }, tty, tty), false);
  assert.equal(isInteractive({}, { isTTY: false }, tty), false);
  assert.equal(isInteractive({}, tty, {}), false);
  assert.equal(isInteractive({ SAHNA_NO_MENU: "1" }, tty, tty), false);
  assert.equal(isInteractive({ DECK_NO_MENU: "1" }, tty, tty), false);
});

// ── path resolution ───────────────────────────────────────────────────────
test("findProjectRoot walks up (posix and win32 path flavours)", () => {
  const files = new Set(["/w/deck/package.json", "/w/deck/src/deck/config.ts"]);
  assert.equal(findProjectRoot("/w/deck/src/scenes", { exists: (f) => files.has(f), pathMod: path.posix }), "/w/deck");
  assert.equal(findProjectRoot("/w/other", { exists: (f) => files.has(f), pathMod: path.posix }), null);
  const win = new Set(["C:\\Talks\\Q3 review\\package.json", "C:\\Talks\\Q3 review\\src\\deck\\config.ts"]);
  assert.equal(findProjectRoot("C:\\Talks\\Q3 review\\src\\scenes", { exists: (f) => win.has(f), pathMod: path.win32 }), "C:\\Talks\\Q3 review");
  assert.equal(findProjectRoot("D:\\", { exists: (f) => win.has(f), pathMod: path.win32 }), null);
});

test("resolveAssets: --assets > SAHNA_ASSETS > .sahna.json > next to the CLI", () => {
  assert.equal(resolveAssets({ env: {} }).dir, ASSETS);
  const r = resolveAssets({ flag: "/nope", env: { SAHNA_ASSETS: "/nope2" } });
  assert.equal(r.dir, ASSETS);
  assert.match(r.tried[0], /^--assets: /);
  assert.match(r.tried[1], /^SAHNA_ASSETS: /);
  const tmp = mkdtempSync(path.join(os.tmpdir(), "sahna-"));
  writeFileSync(path.join(tmp, ".sahna.json"), JSON.stringify({ assets: ASSETS }));
  assert.equal(resolveAssets({ env: {}, project: tmp, cliDir: "/elsewhere/cli" }).dir, ASSETS);
  assert.equal(resolveAssets({ env: {}, cliDir: "/elsewhere/cli" }).dir, null);
});

test("resolveAssets: the old DECK_ASSETS and .deck.json still work", () => {
  const r = resolveAssets({ flag: "/nope", env: { DECK_ASSETS: "/nope2" } });
  assert.match(r.tried[1], /^DECK_ASSETS: /);
  assert.match(resolveAssets({ env: { SAHNA_ASSETS: "/a", DECK_ASSETS: "/b" }, cliDir: "/elsewhere/cli" }).tried[0], /^SAHNA_ASSETS: /);
  const tmp = mkdtempSync(path.join(os.tmpdir(), "sahna-"));
  writeFileSync(path.join(tmp, ".deck.json"), JSON.stringify({ assets: ASSETS }));
  assert.equal(resolveAssets({ env: {}, project: tmp, cliDir: "/elsewhere/cli" }).dir, ASSETS);
});

test("planChecks: file URLs with ?style= and per-style report folders", () => {
  const jobs = planChecks({ root: "/d", report: "/d/report", styles: ["academic", "showcase"], only: ["walk", "seek", "wow", "modules"], modules: ["diagram", "data-viz", "code-scene"], locale: "kk", url: (q) => `file:///d/dist-single/index.html?${q}`, html: "/d/dist-single/index.html" });
  const walk = jobs.filter((j) => j.check === "walk");
  assert.equal(walk.length, 2);
  assert.ok(walk[0].args.includes("file:///d/dist-single/index.html?style=academic"));
  assert.ok(walk[1].args.includes(path.join("/d/report", "showcase", "walk")));
  assert.equal(jobs.filter((j) => j.check === "seek").length, 1);
  const viz = jobs.find((j) => j.check === "module:data-viz");
  assert.deepEqual(viz.args.slice(-2), ["--lang", "kk"]);
  assert.equal(jobs.filter((j) => j.check === "module:code-scene").length, 0);
});

// ── python discovery ──────────────────────────────────────────────────────
test("python candidates per OS, SAHNA_PYTHON first, project .venv next", () => {
  assert.deepEqual(pythonCandidates({ platform: "win32", env: {} }), [["py", "-3"], ["python"], ["python3"]]);
  assert.deepEqual(pythonCandidates({ platform: "linux", env: {} }), [["python3"], ["python"]]);
  const w = pythonCandidates({ platform: "win32", env: { SAHNA_PYTHON: "C:\\Py 3\\python.exe" }, project: "C:\\T\\deck", exists: (f) => f === "C:\\T\\deck\\.venv\\Scripts\\python.exe" });
  assert.deepEqual(w.slice(0, 2), [["C:\\Py 3\\python.exe"], ["C:\\T\\deck\\.venv\\Scripts\\python.exe"]]);
  assert.deepEqual(pythonCandidates({ platform: "linux", env: { DECK_PYTHON: "/opt/py/bin/python3" } })[0], ["/opt/py/bin/python3"]);
});

test("findPython skips the Store stub, Python 2 and old 3.x; uses sys.executable", () => {
  const answers = {
    "py -3": { ok: false, code: 1, out: "", missing: true },
    python: { ok: false, code: 9009, out: "", missing: false },
    python3: { ok: true, code: 0, out: "3.12.4\r\nC:\\Python312\\python.exe", missing: false },
  };
  const r = findPython({ platform: "win32", env: {}, probe: (cmd, args) => answers[[cmd, ...args.slice(0, args.indexOf("-c"))].join(" ")], exists: (f) => f === "C:\\Python312\\python.exe" });
  assert.equal(r.python.cmd, "C:\\Python312\\python.exe");
  assert.deepEqual(r.python.pre, []);
  assert.equal(r.python.version, "3.12.4");
  assert.match(r.tried[1].result, /Store stub/);
  const old = findPython({ platform: "linux", env: {}, probe: (cmd) => (cmd === "python3" ? { ok: true, code: 0, out: "3.6.9\n/usr/bin/python3" } : { ok: true, code: 0, out: "2.7.18\n/usr/bin/python" }) });
  assert.equal(old.python, null);
  assert.match(old.tried[0].result, /3\.6\.9 \(need 3\.9\+\)/);
});

test("findNpm: npm-cli.js through node (no npm.cmd, no shell) on Windows", () => {
  const n = findNpm({ platform: "win32", env: {}, execPath: "C:\\Program Files\\nodejs\\node.exe", exists: (f) => f === "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js" });
  assert.deepEqual(n, { cmd: "C:\\Program Files\\nodejs\\node.exe", pre: ["C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js"], shell: false });
  const viaNpx = findNpm({ platform: "win32", env: { npm_execpath: "C:\\nvm\\v22\\node_modules\\npm\\bin\\npx-cli.js" }, execPath: "C:\\nvm\\v22\\node.exe", exists: (f) => f.endsWith("npm-cli.js") && f.startsWith("C:\\nvm") });
  assert.equal(viaNpx.pre[0], "C:\\nvm\\v22\\node_modules\\npm\\bin\\npm-cli.js");
  assert.deepEqual(findNpm({ platform: "win32", env: {}, execPath: "C:\\x\\node.exe", exists: () => false }), { cmd: "npm.cmd", pre: [], shell: true });
  assert.equal(findNpm({ platform: "linux", env: {}, execPath: "/usr/local/bin/node", exists: (f) => f === "/usr/local/lib/node_modules/npm/bin/npm-cli.js" }).pre[0], "/usr/local/lib/node_modules/npm/bin/npm-cli.js");
});

test("quoteWin quotes spaces and quotes for cmd.exe", () => {
  assert.equal(quoteWin("install"), "install");
  assert.equal(quoteWin("C:\\My Talks\\x"), '"C:\\My Talks\\x"');
  assert.equal(quoteWin('a"b'), '"a\\"b"');
  assert.equal(quoteWin("C:\\dir with space\\"), '"C:\\dir with space\\\\"');
});

test("nodeOk follows Vite 8's engines", () => {
  assert.equal(nodeOk("20.18.0"), false);
  assert.equal(nodeOk("20.19.1"), true);
  assert.equal(nodeOk("22.11.0"), false);
  assert.equal(nodeOk("22.12.0"), true);
  assert.equal(nodeOk("24.1.0"), true);
});

// ── config edits ──────────────────────────────────────────────────────────
test("DECK field read/write keeps `as Style` and comments", () => {
  assert.equal(readDeckField(STARTER_CFG, "style"), "balanced");
  assert.equal(readDeckField(STARTER_CFG, "locale"), "en");
  assert.equal(readDeckField(STARTER_CFG, "title"), "Deck title");
  const t = setDeckField(STARTER_CFG, "style", "academic");
  assert.match(t, /\n  style: "academic" as Style,\n/);
  assert.equal(t.length, STARTER_CFG.length); // "academic" and "balanced" have the same length: nothing else changed
  const l = setDeckField(t, "locale", "kk");
  assert.equal(readDeckField(l, "locale"), "kk");
  assert.equal(readDeckField(l, "style"), "academic");
  // only the DECK.style line, not the word "style" in comments
  assert.equal((l.match(/academic/g) ?? []).length, (STARTER_CFG.match(/academic/g) ?? []).length + 1);
});

test("title with quotes, $ and Kazakh letters is escaped, CRLF kept", () => {
  const crlf = STARTER_CFG.replace(/\n/g, "\r\n");
  const t = setDeckField(crlf, "title", 'Қазақ "тілі" $1 \\ ok');
  assert.equal(readDeckField(t, "title"), 'Қазақ "тілі" $1 \\ ok');
  assert.ok(!/[^\r]\n/.test(t), "no bare LF");
  const add = setDeckField("export const DECK = {\r\n  title: \"x\",\r\n};\r\n", "locale", "ru");
  assert.equal(add, 'export const DECK = {\r\n  locale: "ru",\r\n  title: "x",\r\n};\r\n');
});

test("package.json edit: deps sorted, pins kept, pre-hooks chained, idempotent", () => {
  const src = JSON.stringify({ name: "d", scripts: { dev: "vite", predev: "node x.mjs" }, dependencies: { react: "^19" }, devDependencies: { elkjs: "0.9.0" } }, null, 2) + "\n";
  const a = editPackageJson(src, { dependencies: { "simple-icons": "^16" }, devDependencies: { elkjs: "^0.12.1" }, scripts: { predev: "node scripts/layout.mjs", layout: "node scripts/layout.mjs" } });
  const p = JSON.parse(a);
  assert.deepEqual(Object.keys(p.dependencies), ["react", "simple-icons"]);
  assert.equal(p.devDependencies.elkjs, "0.9.0");
  assert.equal(p.scripts.predev, "node x.mjs && node scripts/layout.mjs");
  assert.equal(editPackageJson(a, { scripts: { predev: "node scripts/layout.mjs" } }), a);
});

test("vite.config.ts: codeScene() first in plugins, once", () => {
  const v = readFileSync(path.join(ASSETS, "starter", "vite.config.ts"), "utf8");
  const out = addCodeScenePlugin(v);
  assert.match(out, /import \{ viteSingleFile \} from "vite-plugin-singlefile";\nimport \{ codeScene \} from "\.\/vite-plugin-code-scene\.ts";\n/);
  assert.match(out, /plugins: \[codeScene\(\), react\(\)/);
  assert.equal(addCodeScenePlugin(out), out);
  assert.equal(addCodeScenePlugin(v.replace(/\n/g, "\r\n")).includes("\r\nimport { codeScene }"), true);
  // the showreel's config (installed by hand) is recognised
  const sr = readFileSync(path.join(ASSETS, "showreel", "vite.config.ts"), "utf8");
  assert.equal(addCodeScenePlugin(sr), sr);
});

test("main.tsx: installWorld after the imports, once", () => {
  const m = readFileSync(path.join(ASSETS, "starter", "src", "main.tsx"), "utf8");
  const out = addWorldInstall(m);
  const i = out.indexOf("installWorld(WORLD);");
  assert.ok(i > out.lastIndexOf('from "./scenes/world";'));
  assert.ok(i < out.indexOf("createRoot("));
  assert.equal(addWorldInstall(out), out);
});

test("gitignore, scene ids, world.ts, slug", () => {
  assert.equal(addGitignore("node_modules\n", ["node_modules", "recordings/"]), "node_modules\nrecordings/\n");
  assert.equal(addGitignore("a", ["b"]), "a\nb\n");
  const ids = sceneIds(readFileSync(path.join(ASSETS, "starter", "src", "scenes", "index.ts"), "utf8"));
  assert.deepEqual(ids, [{ id: "cover", appendix: false }, { id: "results", appendix: false }, { id: "backup-method", appendix: true }]);
  assert.match(worldTs(["cover", "results"]), /world\(path\(\["cover","results"\]\)\)/);
  assert.equal(slug("Q3 Review (final)"), "q3-review-final");
  assert.equal(slug("Қазақ"), "deck");
});

// ── module install edits on a scratch project ─────────────────────────────
test("module install: files, package.json, vite/main edits, remote config kept", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "sahna proj "));
  for (const f of ["package.json", "vite.config.ts", "src/main.tsx", "src/scenes/index.ts", ".gitignore"]) {
    mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
    writeFileSync(path.join(root, f), readFileSync(path.join(ASSETS, "starter", f)));
  }
  const cs = installModule(ASSETS, root, "code-scene");
  assert.ok(cs.copied > 5);
  assert.deepEqual(cs.edited.sort(), ["package.json", "vite.config.ts"]);
  assert.equal(JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).devDependencies.shiki, MODULES["code-scene"].devDependencies.shiki);
  assert.equal(installModule(ASSETS, root, "code-scene").already, true);

  const w = installModule(ASSETS, root, "world");
  assert.ok(w.edited.includes("src/scenes/world.ts") && w.edited.includes("src/main.tsx"));
  assert.match(readFileSync(path.join(root, "src/scenes/world.ts"), "utf8"), /\["cover","results"\]/);

  mkdirSync(path.join(root, "remote"), { recursive: true });
  writeFileSync(path.join(root, "remote", "config.json"), '{"title":"mine"}');
  const r = installModule(ASSETS, root, "remote");
  assert.deepEqual(r.kept, ["remote/config.json"]);
  assert.equal(readFileSync(path.join(root, "remote", "config.json"), "utf8"), '{"title":"mine"}');
  const plan = planCopies(path.join(ASSETS, "modules", "remote"), root, MODULES.remote);
  assert.ok(!plan.some((f) => f.rel.includes("/test/")), "remote tests are not copied");
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  assert.equal(pkg.scripts.mix, "node remote/run.mjs --mix");
  assert.match(readFileSync(path.join(root, ".gitignore"), "utf8"), /remote\/config\.local\.json/);
});

// ── check output parsing ──────────────────────────────────────────────────
test("parseCheckOutput: summaries and FAIL lines of each script", () => {
  const walk = parseCheckOutput("ok    a press is ignored\nFAIL  Shift+→ finishes it\ncontact sheet: x.png (3 frames)\n1 FAILED\n", 1);
  assert.equal(walk.status, "FAIL");
  assert.deepEqual(walk.fails, ["FAIL  Shift+→ finishes it"]);
  assert.equal(walk.summary, "1 FAILED");
  const ok = parseCheckOutput("ok    cover\nok    results\n", 0);
  assert.equal(ok.summary, "2 ok");
  const seek = parseCheckOutput("[academic] cover: 1 labels\n24 checks, 0 failures, 0 page errors\n", 0);
  assert.equal(seek.summary, "24 checks, 0 failures, 0 page errors");
  const wow = parseCheckOutput("CLASSIC 02 results score 9 bullets\n\n1 classic, 0 with warnings → /r/report.md, /r/contact.png\n", 1);
  assert.equal(wow.summary, "1 classic, 0 with warnings");
  assert.equal(wow.fails.length, 1);
  const tb = parseCheckOutput("Traceback (most recent call last):\n  File x\nModuleNotFoundError: No module named 'img2pdf'\n", 1);
  assert.ok(tb.fails.includes("ModuleNotFoundError: No module named 'img2pdf'"));
});

// ── menu builder ──────────────────────────────────────────────────────────
test("menu: no deck vs inside a deck vs remote installed", () => {
  const none = buildMenu({ project: null, assets: "/a" }).map((i) => i.value);
  assert.deepEqual(none, ["new", "showreel", "packs", "doctor", "exit"]);
  const p = { style: "balanced", modules: ["diagram"], built: true, stale: false, title: "T", pack: "calm" };
  const inDeck = buildMenu({ project: p, assets: "/a" });
  assert.deepEqual(inDeck.map((i) => i.value), ["dev", "check", "export", "open", "style", "packs", "modules", "film", "rehearse", "doctor", "exit"]);
  assert.equal(inDeck.find((i) => i.value === "style").hint, "now balanced");
  const remote = buildMenu({ project: { ...p, modules: ["remote"] }, assets: null }).map((i) => i.value);
  assert.ok(["record", "stop", "mix", "links"].every((x) => remote.includes(x)));
});

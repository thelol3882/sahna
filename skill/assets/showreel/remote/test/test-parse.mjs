// Scene and speaker loading: the starter format (src/scenes/index.ts + src/deck/config.ts), a tricky
// variant (comments, single quotes, reordered fields, nested objects), and the deck's {type:"scenes"} manifest.
//
//   node remote/test/test-parse.mjs [deck root to also check, e.g. the starter]
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const require = createRequire(join(process.cwd(), "x.js"));
const WebSocket = require("ws");
const MOD = join(dirname(fileURLToPath(import.meta.url)), "..");
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

function fixture(indexTs, configTs) {
  const root = mkdtempSync(join(tmpdir(), "deck-parse-"));
  for (const d of ["src/scenes", "src/deck", "remote", "node_modules", "dist-single"]) mkdirSync(join(root, d), { recursive: true });
  symlinkSync(dirname(require.resolve("ws/package.json")), join(root, "node_modules/ws"), "dir");
  for (const f of ["server.mjs", "remote.html", "preflight.html", "rec-overlay.js"]) copyFileSync(join(MOD, f), join(root, "remote", f));
  writeFileSync(join(root, "dist-single/index.html"), "<html><body></body></html>");
  if (indexTs != null) writeFileSync(join(root, "src/scenes/index.ts"), indexTs);
  if (configTs != null) writeFileSync(join(root, "src/deck/config.ts"), configTs);
  return root;
}

async function boot(root) {
  const port = 19000 + Math.floor(Math.random() * 900);
  const p = spawn(process.execPath, [join(root, "remote/server.mjs")], { env: { ...process.env, PORT: String(port), REMOTE_KEY: "k", LEAD_KEY: "l", DECK_ROOT: root }, stdio: ["ignore", "pipe", "pipe"] });
  let out = ""; p.stdout.on("data", (d) => { out += d; }); p.stderr.on("data", (d) => { out += d; });
  for (let i = 0; i < 50 && !out.includes("listening"); i++) await sleep(100);
  assert.ok(out.includes("listening"), out);
  const page = await (await fetch(`http://127.0.0.1:${port}/remote?k=k`)).text();
  return { port, p, out, data: JSON.parse(/const DATA = (.*);\n/.exec(page)[1]) };
}

let passed = 0;
const ok = (n) => { passed++; console.log("  ok  " + n); };

// 1. tricky starter-style source
{
  const root = fixture(`import type { SceneDef } from "../deck";
// a comment with { braces } and id: "fake"
export const scenes: SceneDef[] = [
  {
    id: "cover",
    title: 'It\\'s the "cover"',
    steps: 0,
    notes: ["Hello, (and) welcome.", 'second, with a comma'],
    speaker: "a",           // speaker after notes
    hero: true,
    Component: Cover,
  },
  { id: "results", title: "Pages load {4x} faster", steps: 2, speaker: "b", source: DATA.latency.source, extra: { id: "nested", notes: ["no"] },
    notes: [
      "One.",
      "Two.",
      "Three.",
    ], Component: Results },
  /* { id: "commented-out", notes: ["x"] }, */
  {
    id: "backup",
    title: \`Backup\`,
    appendix: true,
    tags: ["method", "k6"],
    notes: ["Only if asked."],
    Component: Backup,
  },
];
export const other = [{ id: "not-a-scene", notes: ["x"] }];
`, `export const DECK = {
  title: "Team talk",
  speakers: [
    { id: "a", name: "Speaker One" },
    { name: "Speaker Two", id: "b" },
  ] as { id: string; name: string }[],
  enter: {} as Record<string, string>,
};`);
  const { p, data, out } = await boot(root);
  assert.equal(data.title, "Team talk");
  assert.deepEqual(data.speakers, [{ part: 1, id: "a", name: "Speaker One" }, { part: 2, id: "b", name: "Speaker Two" }]);
  assert.deepEqual(data.scenes.map((s) => [s.id, s.part, s.chunks.length, !!s.appendix]), [["cover", 1, 2, false], ["results", 2, 3, false], ["backup", 0, 1, true]]);
  assert.equal(data.scenes[0].title, 'It\'s the "cover"');
  assert.deepEqual(data.scenes[0].chunks, ["Hello, (and) welcome.", "second, with a comma"]);
  assert.match(out, /speakers: 1=Speaker One, 2=Speaker Two \(src\/deck\/config\.ts\)/);
  assert.ok(!out.includes("Warning"), "appendix scenes without a speaker are not a warning");
  p.kill();
  ok("starter format: reordered fields, quotes, comments, nested objects, appendix, DECK.speakers by id");
}

// 2. no source at all: the deck's manifest fills scenes and speakers
{
  const root = fixture(null, null);
  const { port, p } = await boot(root);
  const L = new WebSocket(`ws://127.0.0.1:${port}/ws?role=deck&k=k&lead=l`);
  const R = new WebSocket(`ws://127.0.0.1:${port}/ws?role=remote&k=k`);
  const got = [];
  R.on("message", (d) => got.push(JSON.parse(String(d))));
  await Promise.all([new Promise((r) => L.once("open", r)), new Promise((r) => R.once("open", r))]);
  L.send(JSON.stringify({ type: "scenes", speakers: [{ part: 1, id: "x", name: "Ann" }, { part: 2, id: "y", name: "Bo" }],
    scenes: [{ id: "a", title: "A", part: 1, speaker: "x", notes: ["n0", "n1"] }, { id: "b", title: "B", speaker: "y", notes: ["m"] }, { id: "q", title: "Q", part: 0, appendix: true, notes: ["?"] }] }));
  await sleep(200);
  const sc = got.filter((m) => m.type === "scenes").at(-1);
  assert.deepEqual(sc.scenes.map((s) => [s.id, s.part]), [["a", 1], ["b", 2], ["q", 0]]);
  assert.deepEqual(sc.speakers.map((s) => s.name), ["Ann", "Bo"]);
  // the phone of part 2 may move scene b only
  L.send(JSON.stringify({ type: "state", state: { index: 1, step: 0 } }));
  const cmds = []; L.on("message", (d) => { const m = JSON.parse(String(d)); if (m.type === "cmd") cmds.push(m); });
  await sleep(100);
  R.send(JSON.stringify({ type: "cmd", cmd: "next", part: 1 })); await sleep(100);
  R.send(JSON.stringify({ type: "cmd", cmd: "next", part: 2 })); await sleep(100);
  assert.equal(cmds.length, 1);
  L.close(); R.close(); p.kill();
  ok("deck manifest {type:\"scenes\"} sets scenes, speakers and part enforcement");
}

// 3. a real deck root (optional): just print what the server finds
if (process.argv[2]) {
  const root = fixture(null, null);
  for (const f of ["src/scenes/index.ts", "src/deck/config.ts"]) { try { copyFileSync(join(process.argv[2], f), join(root, f)); } catch {} }
  const { p, data, out } = await boot(root);
  console.log("  " + out.split("\n")[0]);
  assert.ok(data.scenes.length > 0);
  p.kill();
  ok(`parsed ${process.argv[2]}: ${data.scenes.map((s) => `${s.id}=${s.part}/${s.chunks.length}`).join(", ")}`);
}
console.log(`\n${passed} checks passed`);
process.exit(0);

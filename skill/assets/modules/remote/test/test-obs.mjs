// obs-websocket v5 automation in remote/server.mjs, against the fake OBS in fake-obs.mjs:
//
//   node remote/test/test-obs.mjs          (from a folder where `ws` resolves, e.g. the deck root)
//
// Checks: password auth (SHA-256 challenge), a wrong and a missing password, the deck link written into the
// Browser source, Start → StartRecord → OutputStarted → countdown → beep, Stop → phones stop → StopRecord →
// outputPath in timeline.json → mix pending; OBS already recording; StartRecord failing (REC does not start,
// the console gets the reason); OBS going away (manual path again), and coming back.
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { startFakeObs } from "./fake-obs.mjs";

const require = createRequire(join(process.cwd(), "x.js"));
const WebSocket = require("ws");
const MOD = join(dirname(fileURLToPath(import.meta.url)), "..");
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
let passed = 0;
const ok = (name) => { passed++; console.log("  ok  " + name); };

function fixture(config) {
  const root = mkdtempSync(join(tmpdir(), "deck-obs-"));
  for (const d of ["dist-single", "media", "remote", "node_modules"]) mkdirSync(join(root, d), { recursive: true });
  symlinkSync(dirname(require.resolve("ws/package.json")), join(root, "node_modules/ws"), "dir");
  writeFileSync(join(root, "dist-single/index.html"), "<!doctype html><html><body></body></html>");
  for (const f of ["server.mjs", "remote.html", "preflight.html", "rec-overlay.js"]) copyFileSync(join(MOD, f), join(root, "remote", f));
  writeFileSync(join(root, "remote/config.json"), JSON.stringify({
    title: "OBS test", speakers: [{ part: 1, name: "Alex" }], recording: { countdownMs: 300 }, ...config }));
  return root;
}

const KEY = "obskey1", LEAD = "obslead2";
async function boot(root, env = {}) {
  const port = 20000 + Math.floor(Math.random() * 900);
  const srv = spawn(process.execPath, [join(root, "remote/server.mjs")], {
    env: { ...process.env, PORT: String(port), REMOTE_KEY: KEY, LEAD_KEY: LEAD, OBS_RETRY_MS: "300", OBS_TAIL_MS: "100", UPLOAD_SETTLE_MS: "200",
      OBS_DECK_URL: `http://localhost:${port}/?remote&obs&k=${KEY}`, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  srv.out = "";
  srv.stdout.on("data", (d) => { srv.out += d; });
  srv.stderr.on("data", (d) => { srv.out += d; });
  for (let i = 0; i < 50 && !srv.out.includes("listening"); i++) await sleep(100);
  assert.ok(srv.out.includes("listening"), srv.out);
  srv.port = port;
  srv.status = async () => (await fetch(`http://127.0.0.1:${port}/api/status?k=${KEY}&lead=${LEAD}`)).json();
  srv.until = async (pred, what, ms = 4000) => {
    let st;
    for (let i = 0; i < ms / 100; i++) { st = await srv.status(); if (pred(st)) return st; await sleep(100); }
    assert.fail(`timeout waiting for ${what}: ${JSON.stringify({ obs: st?.obs, rec: st?.rec, mix: st?.mix })}\n${srv.out}`);
  };
  return srv;
}
function client(port, query) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?${query}`);
  ws.msgs = [];
  ws.on("message", (d) => ws.msgs.push(JSON.parse(String(d))));
  ws.ready = new Promise((res, rej) => { ws.once("open", res); ws.once("error", rej); });
  ws.json = (m) => ws.send(JSON.stringify(m));
  ws.take = (type) => { const out = ws.msgs.filter((m) => m.type === type); ws.msgs = ws.msgs.filter((m) => m.type !== type); return out; };
  return ws;
}

/* ------------------------------------------------------------------ password auth, source link, start/stop */

const obs = await startFakeObs({ password: "s3cret!", outputPath: "C:\\Users\\lead\\Videos\\2026-11-20 10-00-00.mkv" });
let root = fixture({ obs: { url: obs.url, password: "s3cret!" } });
let srv = await boot(root);
let st = await srv.until((s) => s.obs.state === "connected", "OBS connected");
assert.equal(st.obs.version, "5.5.0");
st = await srv.until((s) => s.obs.source === "updated", "source updated");
assert.equal(obs.inputs["Deck (browser)"].url, `http://localhost:${srv.port}/?remote&obs&k=${KEY}`);
assert.deepEqual(obs.requests.slice(0, 3), ["GetRecordStatus", "GetInputSettings", "SetInputSettings"]);
ok("password auth with the SHA-256 challenge; the Browser source gets this run's deck link");

const C = client(srv.port, `role=console&k=${KEY}&lead=${LEAD}`);
const R = client(srv.port, `role=remote&k=${KEY}`);
const O = client(srv.port, `role=overlay&kind=obs&k=${KEY}`);
await Promise.all([C.ready, R.ready, O.ready]); await sleep(150); R.take("rec"); O.take("rec");
C.json({ type: "rec", action: "start" });
await sleep(60);
st = await srv.status();
assert.equal(st.starting, true, "waiting for OBS"); assert.equal(st.rec.state, "idle");
assert.equal(R.take("rec").length, 0, "no countdown before OBS records");
st = await srv.until((s) => s.rec.state === "countdown" || s.rec.state === "recording", "countdown");
assert.equal(obs.state.recording, true); assert.equal(st.starting, false); assert.equal(st.obs.recording, true);
assert.ok(obs.state.startedAt <= st.rec.at, "OBS recorded before the countdown");
st = await srv.until((s) => s.rec.state === "recording", "beep");
assert.ok(O.take("rec").some((m) => m.beep), "the OBS deck beeps");
assert.ok(obs.requests.includes("StartRecord"));
ok("Start: StartRecord, wait for OutputStarted, then the phones' countdown and the beep");

const session = st.rec.session;
await fetch(`http://127.0.0.1:${srv.port}/upload?k=${KEY}&session=${session}&part=1&take=abcd1234&seq=0&t0=${Date.now()}&off=0`, { method: "POST", body: "x" });
C.json({ type: "rec", action: "stop" });
await sleep(30);
assert.equal(R.take("rec").at(-1).state, "stopped", "phones stop first");
assert.equal(obs.state.recording, true, "OBS still records the tail");
st = await srv.until((s) => !s.obs.recording, "OBS stopped");
await fetch(`http://127.0.0.1:${srv.port}/upload?k=${KEY}&session=${session}&part=1&take=abcd1234&seq=1`, { method: "POST", body: "y" });
st = await srv.until((s) => s.mix?.state === "pending", "mix pending");
const tl = JSON.parse(readFileSync(join(root, "recordings", session, "timeline.json"), "utf8"));
assert.equal(tl.obs.outputPath, obs.state.outputPath); assert.equal(tl.obs.driven, true);
assert.ok(tl.obs.stoppedAt >= tl.stoppedAt + 90, "OBS stopped after the phones (the tail)");
assert.equal(tl.events[0].obs, true);
ok("Stop: phones stop, then StopRecord; outputPath in timeline.json; then the mix is pending");

/* ------------------------------------------------------------------ OBS already recording; StartRecord fails */

obs.state.recording = true;   // the lead pressed Start Recording in OBS himself
C.json({ type: "rec", action: "start" });
st = await srv.until((s) => s.rec.state === "recording", "start with OBS already recording");
C.json({ type: "rec", action: "stop" });
await srv.until((s) => s.mix?.state === "pending" && !s.obs.recording, "stopped");
ok("OBS already recording: that recording is used, and stopped at Stop");

await obs.close();
const bad = await startFakeObs({ port: obs.port, password: "s3cret!", failStart: true });
st = await srv.until((s) => s.obs.state === "connected", "reconnect after OBS restart", 6000);
C.take("rec-error");
C.json({ type: "rec", action: "start" });
await sleep(400);
st = await srv.status();
assert.notEqual(st.rec.state, "countdown"); assert.equal(st.rec.state, "stopped", "no new take"); assert.equal(st.starting, false);
assert.match(C.take("rec-error")[0].text, /OBS did not start recording \(Disk full \(fake\)\)/);
ok("OBS restarted: reconnects; StartRecord fails: REC does not start, the console gets the reason");

/* ------------------------------------------------------------------ OBS gone: the manual path */

await bad.close();
st = await srv.until((s) => s.obs.state === "not-found", "OBS gone");
C.json({ type: "rec", action: "start" });
st = await srv.until((s) => s.rec.state === "countdown" || s.rec.state === "recording", "manual start");
C.json({ type: "rec", action: "stop" });
st = await srv.until((s) => s.mix?.state === "pending", "manual stop");
assert.equal(JSON.parse(readFileSync(join(root, "recordings", st.rec.session, "timeline.json"), "utf8")).obs, null);
ok("OBS not found: Start and Stop work at once without it (manual OBS), timeline has no OBS file");
for (const w of [C, R, O]) w.close();
srv.kill();

/* ------------------------------------------------------------------ wrong / missing password, no source */

const obs2 = await startFakeObs({ password: "right", inputs: {} });
root = fixture({ obs: { url: obs2.url, password: "wrong" } });
srv = await boot(root);
st = await srv.until((s) => s.obs.state === "auth", "auth failed");
assert.match(st.obs.error, /wrong OBS password/);
// the password is read again from config.json on every attempt (node mode: paste it, no restart)
writeFileSync(join(root, "remote/config.json"), JSON.stringify({ title: "OBS test", speakers: [{ part: 1, name: "Alex" }], obs: { url: obs2.url, password: "right" } }));
st = await srv.until((s) => s.obs.state === "connected", "connected after fixing the password", 6000);
st = await srv.until((s) => s.obs.source === "missing", "missing source reported");
srv.kill();
root = fixture({ obs: { url: obs2.url } });
srv = await boot(root);
st = await srv.until((s) => s.obs.state === "auth", "no password");
assert.match(st.obs.error, /asks for a password/);
srv.kill();
root = fixture({ obs: false });
srv = await boot(root);
assert.equal((await srv.status()).obs.state, "off");
srv.kill();
await obs2.close();
ok("wrong password (4009), fixed in config.json without a restart; no password; missing source; obs: false = off");

console.log(`\n${passed} checks passed`);
process.exit(0);

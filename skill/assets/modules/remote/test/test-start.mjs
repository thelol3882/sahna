// The npm commands end to end in a throwaway deck project (node mode, a fake cloudflared, a fake OBS):
//
//   node remote/test/test-start.mjs        (needs python3, npm, and ffmpeg for the mix part)
//
// npm run record → browser pages + clipboard + helper; again → reused (same keys); after a crash → cleaned up
// and started fresh; npm run links; a take driven through the fake OBS → the helper mixes final.mp4 and
// voices.wav by itself, the control page's "Open folder" reaches the helper; npm run mix again; npm run stop.
// Every line the tools print is checked: npm commands only, never "python".
import { createRequire } from "node:module";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, existsSync, symlinkSync, chmodSync, readdirSync, statSync, utimesSync } from "node:fs";
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

/* ------------------------------------------------------------------ fixture */

const root = mkdtempSync(join(tmpdir(), "deck-start-"));
for (const d of ["dist-single", "remote", "node_modules", "bin", "videos"]) mkdirSync(join(root, d), { recursive: true });
symlinkSync(dirname(require.resolve("ws/package.json")), join(root, "node_modules/ws"), "dir");
writeFileSync(join(root, "dist-single/index.html"), "<!doctype html><html><body></body></html>");
for (const f of ["server.mjs", "remote.html", "preflight.html", "rec-overlay.js", "start.py", "run.mjs", "mix.py", "qr.py", "compose.yaml"]) copyFileSync(join(MOD, f), join(root, "remote", f));
const real = JSON.parse(readFileSync(join(MOD, "../package.json"), "utf8")).scripts;
for (const s of ["record", "stop", "mix", "links"]) assert.ok(real[s]?.startsWith("node remote/run.mjs"), `package.json has npm run ${s}`);
writeFileSync(join(root, "package.json"), JSON.stringify({ name: "fixture", private: true, type: "module",
  scripts: { record: real.record, stop: real.stop, mix: real.mix, links: real.links } }));
utimesSync(join(root, "dist-single/index.html"), new Date(), new Date(Date.now() + 60000));   // the deck counts as built
ok("package.json: npm run record / stop / mix / links all go through remote/run.mjs");

const PORT = 21000 + Math.floor(Math.random() * 900);
const obsFile = join(root, "videos", "2026-11-20 10-00-00.mkv");
const ff = (args) => { const x = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]); assert.equal(x.status, 0, String(x.stderr)); };
// the fake OBS writes its "recording" when it is stopped: 8 s of video, the 1 kHz beep at 1.5 s
const obs = await startFakeObs({ password: "pw", outputPath: obsFile, onStop: (path) => ff(["-f", "lavfi", "-i", "color=c=gray:s=320x180:r=30:d=8",
  "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo:d=1.5", "-f", "lavfi", "-i", "sine=f=1000:d=0.2:r=48000", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo:d=6.3",
  "-filter_complex", "[2]aformat=channel_layouts=stereo[b];[1][b][3]concat=n=3:v=0:a=1[a]", "-map", "0:v", "-map", "[a]", "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", path]) });
writeFileSync(join(root, "remote/config.json"), JSON.stringify({
  title: "Start test", port: PORT, speakers: [{ part: 1, name: "Alex" }, { part: 2, name: "Sam" }],
  recording: { countdownMs: 300 }, obs: { url: obs.url, password: "pw" } }));
writeFileSync(join(root, "bin/cloudflared"), "#!/bin/sh\necho \"INF | https://fake-tunnel-words.trycloudflare.com |\" >&2\nexec sleep 3600\n");
chmodSync(join(root, "bin/cloudflared"), 0o755);

const LOG = join(root, "actions.jsonl");
const env = { ...process.env, PATH: `${join(root, "bin")}:${process.env.PATH}`, REMOTE_TEST_LOG: LOG, OBS_VIDEO_DIRS: "",
  OBS_TAIL_MS: "200", UPLOAD_SETTLE_MS: "500" };
const printed = [];
// async: the fake OBS lives in this process and must keep answering while npm runs
function npmRun(args) {
  return new Promise((done) => {
    const p = spawn("npm", ["run", "--silent", ...args], { cwd: root, env });
    let out = "";
    p.stdout.on("data", (d) => { out += d; }); p.stderr.on("data", (d) => { out += d; });
    const t = setTimeout(() => p.kill(), 150000);
    p.on("close", (status) => { clearTimeout(t); printed.push(out); done({ status, out }); });
  });
}
async function npm(...args) {
  const { status, out } = await npmRun(args);
  assert.equal(status, 0, `npm run ${args.join(" ")} failed:\n${out}`);
  return out;
}
const actions = () => existsSync(LOG) ? readFileSync(LOG, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
const state = () => JSON.parse(readFileSync(join(root, "remote/.run/state.json"), "utf8"));
const alive = (pid) => { try { process.kill(pid, 0); } catch { return false; } try { return readFileSync(`/proc/${pid}/stat`, "utf8").split(" ")[2] !== "Z"; } catch { return true; } };
const status = async (s) => (await fetch(`http://127.0.0.1:${PORT}/api/status?k=${s.key}&lead=${s.lead}`)).json();
async function until(s, pred, what, ms = 30000) {
  let st;
  for (let i = 0; i < ms / 200; i++) { st = await status(s).catch(() => null); if (st && pred(st)) return st; await sleep(200); }
  assert.fail(`timeout: ${what}: ${JSON.stringify({ rec: st?.rec, mix: st?.mix, obs: st?.obs, helper: st?.helper })}\n${readFileSync(join(root, "remote/.run/helper.log"), "utf8")}`);
}

/* ------------------------------------------------------------------ npm run record: start, reuse, recover */

let out = await npm("record", "--", "--mode", "node");
let s1 = state();
assert.equal(s1.mode, "node"); assert.equal(s1.tunnel, "https://fake-tunnel-words.trycloudflare.com");
for (const p of ["server", "tunnel", "helper"]) assert.ok(alive(s1.pids[p]), p + " runs");
const a1 = actions();
const opened = a1.filter((a) => a.kind === "open").map((a) => a.value);
assert.deepEqual(opened, [`http://localhost:${PORT}/preflight?k=${s1.key}&lead=${s1.lead}`, `http://localhost:${PORT}/?remote&k=${s1.key}&lead=${s1.lead}`]);
const clip = a1.find((a) => a.kind === "copy").value;
assert.match(clip, /Tap "I'm ready"/); assert.match(clip, /Alex: https:\/\/fake-tunnel-words\.trycloudflare\.com\/remote\?k=\w+#part1/);
assert.match(clip, /Sam: .*#part2/);
assert.match(out, /Opened in your browser: the control page and the lead deck/);
assert.match(out, /in your clipboard/); assert.match(out, /OBS: connected/);
assert.ok(existsSync(join(root, "remote/obs-scene-collection.json")));
let st = await until(s1, (x) => x.obs.state === "connected" && x.obs.source === "updated", "OBS source updated");
assert.equal(obs.inputs["Deck (browser)"].url, `http://localhost:${PORT}/?remote&obs&k=${s1.key}`);
ok("npm run record: server + tunnel + helper, opens the control page and the lead deck, team message copied, OBS found and its source updated");

writeFileSync(LOG, "");
out = await npm("record");
const s2 = state();
assert.match(out, /already running \(node mode\): reusing it/);
assert.equal(s2.key, s1.key); assert.deepEqual(s2.pids, s1.pids);
assert.ok(actions().some((a) => a.kind === "copy"));
ok("npm run record again: reuses the running remote (same keys and processes), copies the message again");

process.kill(s1.pids.server, "SIGKILL");   // a crashed or half-started run
await sleep(300);
writeFileSync(LOG, "");
out = await npm("record", "--", "--mode", "node");
const s3 = state();
assert.match(out, /Cleaning up the previous run first/);
assert.notEqual(s3.key, s1.key);
await sleep(300);
assert.ok(!alive(s1.pids.tunnel) && !alive(s1.pids.helper), "the old tunnel and helper were stopped");
for (const p of ["server", "tunnel", "helper"]) assert.ok(alive(s3.pids[p]), p + " runs again");
ok("npm run record after a crash: the leftovers are stopped, a fresh run starts");

out = await npm("links");
assert.match(out, new RegExp(`Control page  http://localhost:${PORT}/preflight\\?k=${s3.key}`));
assert.match(out, /Alex: https:\/\/fake-tunnel-words/);
ok("npm run links: the links and the team message of the running remote");

/* ------------------------------------------------------------------ a take through OBS, auto-mix by the helper */

const work = join(root, "audio"); mkdirSync(work);
const tone = (f, file) => ff(["-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono:d=2", "-f", "lavfi", "-i", `sine=f=${f}:d=0.5:r=48000`,
  "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono:d=1.5", "-filter_complex", "[0][1][2]concat=n=3:v=0:a=1", "-c:a", "libopus", "-b:a", "96k", join(work, file)]);
tone(440, "a.webm"); tone(880, "b.webm");
await until(s3, (x) => x.obs.state === "connected", "OBS connected to the fresh server");
const C = new WebSocket(`ws://127.0.0.1:${PORT}/ws?role=console&k=${s3.key}&lead=${s3.lead}`);
await new Promise((r) => C.once("open", r));
C.send(JSON.stringify({ type: "rec", action: "start" }));
st = await until(s3, (x) => x.rec.state === "recording", "recording", 10000);
assert.equal(obs.state.recording, true);
const send = async (part, file, startServer) => {
  const buf = readFileSync(join(work, file)); const n = 2, size = Math.ceil(buf.length / n);
  for (let i = 0; i < n; i++) {
    const r = await fetch(`http://127.0.0.1:${PORT}/upload?k=${s3.key}&session=${st.rec.session}&part=${part}&take=t${part}x${part}&seq=${i}&ext=webm&t0=${startServer}&off=0&rtt=20`,
      { method: "POST", body: buf.subarray(i * size, (i + 1) * size) });
    assert.equal(r.status, 200);
  }
};
await send(1, "a.webm", st.rec.beepAt - 1000);
C.send(JSON.stringify({ type: "rec", action: "stop" }));
await sleep(100);
await send(2, "b.webm", st.rec.beepAt + 500);   // Sam's chunks arrive after Stop (the last upload)
st = await until(s3, (x) => x.mix?.state === "mixing", "the helper starts mixing", 20000);
st = await until(s3, (x) => x.mix?.state === "done" || x.mix?.state === "error", "mix done", 60000);
assert.equal(st.mix.state, "done", JSON.stringify(st.mix));
const sdir = join(root, "recordings", st.rec.session);
assert.equal(st.mix.path, join(sdir, "final.mp4")); assert.equal(st.mix.video, obsFile);
assert.ok(statSync(join(sdir, "final.mp4")).size > 1000 && statSync(join(sdir, "voices.wav")).size > 1000);
const onsets = (file) => [...spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", "silencedetect=noise=-35dB:d=0.1", "-f", "null", "-"], { encoding: "utf8" })
  .stderr.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
const f = onsets(join(sdir, "final.mp4"));
// beep at 1.5 s → Alex's tone at 1.5 - 1.0 + 2.0 = 2.5, Sam's at 1.5 + 0.5 + 2.0 = 4.0
assert.ok(Math.abs(f[1] - 2.5) < 0.08 && Math.abs(f[2] - 4.0) < 0.08, "final onsets " + f);
ok(`after Stop the helper mixes by itself: OBS file from obs-websocket, final.mp4 + voices.wav (onsets ${f.slice(0, 3).map((x) => x.toFixed(2))})`);

writeFileSync(LOG, "");
C.send(JSON.stringify({ type: "open", what: "folder" }));
for (let i = 0; i < 30 && !actions().some((a) => a.kind === "folder"); i++) await sleep(200);
assert.deepEqual(actions().filter((a) => a.kind === "folder").map((a) => a.value), [sdir]);
C.close();
ok("Open folder on the control page: the helper opens recordings/<session>");

const before = statSync(join(sdir, "final.mp4")).mtimeMs;
out = await npm("mix");
assert.match(out, new RegExp(`Session: ${sdir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
assert.match(out, /OBS video: .*2026-11-20 10-00-00\.mkv/); assert.match(out, /Sync beep in the video at 1\.5/); assert.match(out, /Done: .*final\.mp4/);
assert.ok(statSync(join(sdir, "final.mp4")).mtimeMs > before);
out = await npm("mix", "--", "--no-video");
assert.match(out, /Done: .*voices\.wav/);
ok("npm run mix: the latest session, the OBS file found from timeline.json; -- --no-video");

/* ------------------------------------------------------------------ npm run stop */

out = await npm("stop");
assert.match(out, /Stopped/);
await sleep(500);
for (const p of ["server", "tunnel", "helper"]) assert.ok(!alive(s3.pids[p]), p + " stopped");
assert.ok(!existsSync(join(root, "remote/.run/state.json")));
const fail = await npmRun(["links"]);
assert.notEqual(fail.status, 0); assert.match(fail.out, /npm run record/);
ok("npm run stop: server, tunnel and helper stopped; npm run links then says to run npm run record");

const all = printed.join("\n");
assert.ok(!/python/i.test(all.replace(/PYTHON\w*/g, "")), "a tool printed a python command:\n" + all.split("\n").filter((l) => /python/i.test(l)).join("\n"));
ok("no printed line mentions python: npm commands only");

await obs.close();
console.log(`\n${passed} checks passed (fixture: ${root})`);
process.exit(0);

// End-to-end test of remote/server.mjs with fake decks, phones, console and overlay.
//
//   node remote/test/test-server.mjs          (run from a folder where `ws` resolves, e.g. the deck root)
//
// Builds a throwaway deck project in a temp folder (dist-single, media, src/scenes, remote/),
// starts the server there and checks: HTTP keys, Range serving, path traversal, relay, lead
// enforcement, late-join sync, part enforcement, debounce, level relay, ping/pong clock, heartbeat,
// recording (countdown, beep, chunk uploads, duplicates, order, takes, gaps, timeline.json), the /api for
// start.py and its helper (status, rec, mix jobs, open folder), Ctrl+R from the lead deck's overlay.
// OBS is not running here: REC takes the manual path (test-obs.mjs covers obs-websocket).
// With MIX_TEST=1 it also uploads ffmpeg-made tone files and runs mix.py on them (needs ffmpeg, python3).
import { createRequire } from "node:module";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, existsSync, readdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const require = createRequire(join(process.cwd(), "x.js"));
const WebSocket = require("ws");
const wsDir = dirname(require.resolve("ws/package.json"));
const MOD = join(dirname(fileURLToPath(import.meta.url)), "..");

/* ------------------------------------------------------------------ fixture */

const root = mkdtempSync(join(tmpdir(), "deck-remote-"));
for (const d of ["dist-single", "media", "src/scenes", "remote", "node_modules"]) mkdirSync(join(root, d), { recursive: true });
symlinkSync(wsDir, join(root, "node_modules/ws"), "dir");
writeFileSync(join(root, "dist-single/index.html"), "<!doctype html><html><body><div id=root></div><script>/*deck*/</script></body></html>");
const media = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 256));
writeFileSync(join(root, "media/clip.bin"), media);
writeFileSync(join(root, "src/scenes/index.ts"), `export const scenes = [
  { id: "cover", title: "Cover", speaker: "Alex", seconds: 8, Component: Cover, notes: "Hello. (click) We are a team." },
  { id: "problem", title: "The problem", speaker: "Sam", seconds: 30, Component: Problem, notes: ["One", "Two \\"quoted\\"", "Three"] },
  { id: "end", title: "Thanks", speaker: "Alex", seconds: 5, Component: End, notes: "Bye (→) really" },
];`);
for (const f of ["server.mjs", "remote.html", "preflight.html", "rec-overlay.js", "mix.py"]) copyFileSync(join(MOD, f), join(root, "remote", f));
writeFileSync(join(root, "remote/config.json"), JSON.stringify({
  title: "Test talk", port: 0, speakers: [{ part: 1, name: "Alex" }, { part: 2, name: "Sam" }], recording: { countdownMs: 300 },
}));

const PORT = 18000 + Math.floor(Math.random() * 1000);
const KEY = "testkey123", LEAD = "leadkey456";
const srv = spawn(process.execPath, [join(root, "remote/server.mjs")], {
  env: { ...process.env, PORT: String(PORT), REMOTE_KEY: KEY, LEAD_KEY: LEAD, HEARTBEAT_MS: "400", OBS_URL: "ws://127.0.0.1:9", UPLOAD_SETTLE_MS: "300" }, stdio: ["ignore", "pipe", "pipe"],
});
let srvOut = "";
srv.stdout.on("data", (d) => { srvOut += d; });
srv.stderr.on("data", (d) => { srvOut += d; });
const base = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
for (let i = 0; i < 50 && !srvOut.includes("listening"); i++) await sleep(100);
assert.ok(srvOut.includes("listening"), "server did not start:\n" + srvOut);
assert.match(srvOut, /scenes: 3 \(src\/scenes\/index\.ts\)/);

let passed = 0;
const ok = (name) => { passed++; console.log("  ok  " + name); };

/* ------------------------------------------------------------------ http */

const get = (path, headers = {}, method = "GET") => fetch(base + path, { headers, method });
assert.equal((await get("/")).status, 403);
assert.equal((await get("/?k=wrong")).status, 403);
let r = await get(`/?remote&k=${KEY}`);
assert.equal(r.status, 200);
assert.ok(!(await r.text()).includes("rec-overlay"), "follower decks get no overlay");
r = await get(`/?remote&obs&k=${KEY}`);
assert.ok((await r.text()).includes('<script src="/rec-overlay.js"></script></body>'));
ok("deck needs the key; OBS deck gets the sync overlay");

r = await get(`/remote?k=${KEY}`);
const remotePage = await r.text();
assert.equal(r.status, 200);
assert.ok(!remotePage.includes("__DATA__"));
const data = JSON.parse(/const DATA = (.*);\n/.exec(remotePage)[1]);
assert.deepEqual(data.scenes.map((s) => s.part), [1, 2, 1]);
assert.deepEqual(data.scenes[0].chunks, ["Hello.", "We are a team."]);
assert.deepEqual(data.scenes[1].chunks, ["One", 'Two "quoted"', "Three"]);
assert.deepEqual(data.scenes[2].chunks, ["Bye", "really"]);
assert.equal(data.title, "Test talk");
ok("phone page carries scenes, chunks (string, array, (→)) and speakers");

assert.equal((await get(`/preflight?k=${KEY}`)).status, 403);
assert.equal((await get(`/preflight?k=${KEY}&lead=nope`)).status, 403);
r = await get(`/preflight?k=${KEY}&lead=${LEAD}`);
assert.equal(r.status, 200);
assert.ok((await r.text()).includes('"media":["clip.bin"]'));
ok("pre-flight page needs the lead key and lists media");

for (const p of ["/api/status", `/api/status?k=${KEY}`, `/api/status?k=${KEY}&lead=nope`, `/api/helper?k=bad&lead=${LEAD}`]) assert.equal((await get(p)).status, 403, p);
r = await get(`/api/status?k=${KEY}&lead=${LEAD}`);
assert.equal(r.status, 200);
let api = await r.json();
assert.equal(api.type, "status"); assert.equal(api.rec.state, "idle"); assert.ok(["connecting", "not-found"].includes(api.obs.state), api.obs.state);
assert.equal(api.mix, null); assert.equal(api.helper.online, false); assert.equal(api.consoles, 0);
assert.equal((await get(`/api/nope?k=${KEY}&lead=${LEAD}`)).status, 404);
ok("/api needs the lead key; status JSON with OBS (not running here), mix, helper");

r = await get("/media/clip.bin");
assert.equal(r.status, 200); assert.equal(r.headers.get("accept-ranges"), "bytes"); assert.equal((await r.arrayBuffer()).byteLength, 1000);
r = await get("/media/clip.bin", { range: "bytes=10-19" });
assert.equal(r.status, 206); assert.equal(r.headers.get("content-range"), "bytes 10-19/1000");
assert.deepEqual([...new Uint8Array(await r.arrayBuffer())], [...media.subarray(10, 20)]);
r = await get("/media/clip.bin", { range: "bytes=990-" });
assert.equal(r.status, 206); assert.equal((await r.arrayBuffer()).byteLength, 10);
r = await get("/media/clip.bin", { range: "bytes=-5" });
assert.equal(r.headers.get("content-range"), "bytes 995-999/1000");
await r.arrayBuffer();
r = await get("/media/clip.bin", { range: "bytes=5000-" });
assert.equal(r.status, 416);
r = await get("/media/clip.bin", {}, "HEAD");
assert.equal(r.status, 200); assert.equal(r.headers.get("content-length"), "1000");
ok("media: full, Range (start-end, open, suffix), 416, HEAD");

for (const p of ["/media/%2e%2e/remote/server.mjs", "/media/..%2fremote%2fserver.mjs", "/remote/server.mjs", "/src/scenes/index.ts", "/media/"]) {
  assert.equal((await get(p)).status, 404, p);
}
assert.equal(await (await get("/healthz")).text(), "ok");
ok("no path traversal, no sources; healthz");

/* ------------------------------------------------------------------ ws helpers */

function client(query, opts) {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?${query}`, opts);
  ws.msgs = [];
  ws.on("message", (d) => ws.msgs.push(JSON.parse(String(d))));
  ws.on("error", () => {});
  ws.ready = new Promise((res, rej) => { ws.once("open", res); ws.once("unexpected-response", (_, resp) => rej(new Error("http " + resp.statusCode))); ws.once("close", () => rej(new Error("closed"))); });
  ws.json = (m) => ws.send(JSON.stringify(m));
  ws.take = (type) => { const out = ws.msgs.filter((m) => !type || m.type === type); ws.msgs = ws.msgs.filter((m) => type && m.type !== type); return out; };
  return ws;
}
const settle = () => sleep(120);

await assert.rejects(client(`role=deck&k=bad`).ready);
await assert.rejects(client(`role=console&k=${KEY}`).ready);
await assert.rejects(client(`role=console&k=${KEY}&lead=bad`).ready);
ok("ws rejects a wrong key and a console without the lead key");

const R1 = client(`role=remote&k=${KEY}`); await R1.ready; await settle();
assert.deepEqual(R1.take("deck"), [{ type: "deck", online: false }]);
assert.equal(R1.take("scenes")[0].scenes.length, 3);
assert.equal(R1.take("rec")[0].state, "idle");

const L = client(`role=deck&k=${KEY}&lead=${LEAD}`);
const F = client(`role=deck&k=${KEY}`);
const X = client(`role=deck&k=${KEY}&lead=wrong`);
await Promise.all([L.ready, F.ready, X.ready]); await settle();
assert.deepEqual(L.take("role"), [{ type: "role", lead: true }]);
assert.deepEqual(F.take("role"), [{ type: "role", lead: false }]);
assert.deepEqual(X.take("role"), [{ type: "role", lead: false }]);
assert.deepEqual(R1.take("deck").at(-1), { type: "deck", online: true });
ok("roles: lead key checked by the server, wrong lead = follower; phones see the deck online");

L.json({ type: "state", state: { index: 0, step: 0, steps: 1 } }); await settle();
assert.deepEqual(R1.take("state"), [{ type: "state", state: { index: 0, step: 0, steps: 1 } }]);
assert.deepEqual(F.take("sync"), [{ type: "sync", state: { index: 0, step: 0, steps: 1 } }]);
X.json({ type: "state", state: { index: 2, step: 0 } }); await settle();
assert.equal(R1.take("state").length, 0, "follower state ignored while a lead is open");
ok("lead state relayed to phones and synced to followers; follower state ignored");

X.json({ type: "cmd", cmd: "next" }); await settle();
assert.equal(F.take("cmd").length, 0, "follower cannot command");
L.json({ type: "cmd", cmd: "next" }); L.json({ type: "cmd", cmd: "jump", index: 1 }); L.json({ type: "cmd", cmd: "media-seek", t: 12.5 }); L.json({ type: "cmd", cmd: "rm -rf" }); await settle();
assert.deepEqual(F.take("cmd"), [{ type: "cmd", cmd: "media-seek", t: 12.5 }], "next/jump are not forwarded: followers follow the state");
assert.equal(X.take("cmd").length, 1); assert.equal(L.take("cmd").length, 0, "lead does not get its own command");
ok("lead media commands reach the other decks only; next/prev/jump not forwarded; unknown dropped");

const F2 = client(`role=deck&k=${KEY}`); await F2.ready; await settle();
assert.deepEqual(F2.take(), [{ type: "role", lead: false }, { type: "sync", state: { index: 0, step: 0, steps: 1 } }]);
ok("late joiner gets role and the lead's state");

const R2 = client(`role=remote&k=${KEY}`); await R2.ready; await settle(); R2.take();
for (const d of [L, F, X, F2]) d.take();
R2.json({ type: "cmd", cmd: "next", part: 2 }); await settle();
assert.equal(F.take("cmd").length, 0, "part 2 cannot move scene 0 (Alex)");
R1.json({ type: "cmd", cmd: "next", part: 1 }); R1.json({ type: "cmd", cmd: "next", part: 1 }); await settle();
assert.deepEqual(L.take("cmd"), [{ type: "cmd", cmd: "next" }], "double press debounced");
assert.equal(F.take("cmd").length, 0, "with a lead open, phones move only the lead");
await sleep(400);
R1.json({ type: "cmd", cmd: "replay", part: 1 }); R1.json({ type: "cmd", cmd: "hello", part: 0 }); await settle();
assert.deepEqual(L.take("cmd").map((m) => m.cmd), ["replay", "hello"]);
assert.deepEqual(F.take("cmd").map((m) => m.cmd), ["hello"], "hello goes to every deck");
R1.json({ type: "cmd", cmd: "next", part: 0 }); await settle();
assert.equal(L.take("cmd").length, 0, "watchers cannot move");
L.json({ type: "state", state: { index: 1, step: 0 } }); await settle();
R1.json({ type: "cmd", cmd: "replay", part: 1 }); await settle();
assert.equal(L.take("cmd").length, 0, "replay only on the first scene");
R2.json({ type: "cmd", cmd: "media-toggle", part: 2 }); R2.json({ type: "cmd", cmd: "media-skip", part: 2 }); await settle();
assert.equal(L.take("cmd").length, 0, "phones cannot pause or skip the video");
L.json({ type: "state", state: { index: 1, step: 0, media: { playing: true, t: 3, dur: 10, chapter: "A", ended: false } } }); await settle();
R2.json({ type: "cmd", cmd: "next", part: 2 }); await settle();
assert.equal(L.take("cmd").length, 0, "next waits while the video plays");
L.json({ type: "state", state: { index: 1, step: 0, media: { playing: false, t: 10, dur: 10, chapter: "A", ended: true } } }); await sleep(400);
R2.json({ type: "cmd", cmd: "next", part: 2 }); await settle();
assert.equal(L.take("cmd").length, 1, "next works after the video ended");
L.json({ type: "state", state: { index: 1, step: 0 } }); await settle();
ok("phone commands: lead only, part enforcement, debounce, replay rule, watchers, video gate");

R2.json({ type: "level", part: 2, v: 0.4567 }); R2.json({ type: "level", part: 9, v: 0.5 }); R2.json({ type: "level", part: 1, v: 3 }); await settle();
assert.deepEqual(F.take("level"), [{ type: "level", part: 2, v: 0.46 }]);
assert.equal(L.take("level").length, 1);
ok("voice level relayed to decks (rounded); bad part or value dropped");

{
  const jpeg = "data:image/jpeg;base64," + "A".repeat(400);
  R1.take(); R2.take();
  R2.json({ type: "frame", part: 2, t: Date.now(), data: jpeg });
  R2.json({ type: "frame", part: 2, t: Date.now(), data: jpeg });            // under 30 ms after: dropped
  R2.json({ type: "frame", part: 9, t: Date.now(), data: jpeg });            // no such part
  R2.json({ type: "frame", part: 2, t: Date.now(), data: "data:text/html,<b>" });
  await settle();
  assert.deepEqual(F.take("frame"), [{ type: "frame", part: 2, data: jpeg }]);
  assert.equal(L.take("frame").length, 1);
  assert.equal(R1.take("thumb").length, 1, "the other phone gets a thumbnail");
  assert.equal(R2.take("thumb").length, 0, "not the sender");
  const team = R1.take("team").pop();
  assert.ok(team && team.list.find((x) => x.part === 2)?.cam, "the team list says part 2 has a camera");
  ok("camera frames: to the decks, a thumbnail to the other phones, JPEG only, throttled; team shows the camera");
}

const t = Date.now();
R1.json({ type: "ping", t }); await settle();
const pong = R1.take("pong")[0];
assert.equal(pong.t, t); assert.ok(Math.abs(pong.server - Date.now()) < 1000);
ok("ping/pong carries the server clock");

// a socket that stops answering pings is dropped by the heartbeat
const dead = client(`role=remote&k=${KEY}`, { autoPong: false }); await dead.ready;
const closed = await Promise.race([new Promise((ok) => dead.once("close", () => ok(true))), sleep(2500).then(() => false)]);
assert.ok(closed, "dead socket was not dropped");
ok("heartbeat drops a dead socket");

/* ------------------------------------------------------------------ recording */

const C = client(`role=console&k=${KEY}&lead=${LEAD}`); await C.ready;
const O = client(`role=overlay&kind=obs&k=${KEY}`); await O.ready;
R1.json({ type: "status", part: 1, battery: 81, charging: false, mic: "granted", micOn: true, headphones: true, recording: false, rtt: 40, offset: 0 });
R2.json({ type: "status", part: 2, battery: 15, mic: "prompt", micOn: false, headphones: false });
await sleep(1200);
let st = C.take("status").at(-1);
assert.equal(st.lead.decks, 1); assert.equal(st.decks.obs, 1); assert.equal(st.decks.total, 4);
assert.deepEqual(st.speakers.map((s) => [s.name, s.connected, s.mic, s.micOn, s.headphones, s.battery]),
  [["Alex", true, "granted", true, true, 81], ["Sam", true, "prompt", false, false, 15]]);
assert.deepEqual(st.media, ["clip.bin"]);
assert.equal(st.consoles, 1); assert.equal(st.obs.state, "not-found"); assert.equal(st.starting, false);
R1.json({ type: "level", part: 1, v: 0.3 }); await settle();
assert.equal(C.take("level").length, 1);
ok("console status: lead, OBS overlay, decks, speakers' phone health, media; levels reach the console");

for (const w of [R1, R2, O]) w.take();
R1.json({ type: "rec", action: "start" }); F.json({ type: "rec", action: "start" }); await settle();
assert.equal(R1.take("rec").length, 0, "only the lead can start");
C.json({ type: "rec", action: "start" }); await settle();
const cd = R1.take("rec")[0];
assert.equal(cd.state, "countdown"); assert.equal(cd.countdownMs, 300);
assert.equal(O.take("rec")[0].state, "countdown");
await sleep(400);
const go = O.take("rec")[0];
assert.equal(go.state, "recording"); assert.equal(go.beep, true); assert.ok(go.beepAt >= cd.at + 290);
assert.equal(R1.take("rec")[0].state, "recording");
ok("REC: console starts, phones count down, overlay gets the beep after the countdown (OBS not found: manual path)");

const session = cd.session;
const up = (q, body) => fetch(`${base}/upload?k=${KEY}&session=${session}&${q}`, { method: "POST", body });
const t0 = go.beepAt - 1000;
r = await up(`part=1&take=aaaa1111&seq=0&ext=webm&mime=audio%2Fwebm&t0=${t0 - 50}&off=50&rtt=30`, Buffer.from("AAA"));
assert.equal(r.status, 200);
assert.equal((await up(`part=1&take=aaaa1111&seq=1`, Buffer.from("BBB"))).status, 200);
r = await up(`part=1&take=aaaa1111&seq=1`, Buffer.from("BBB"));
assert.deepEqual(await r.json(), { ok: true, dup: true, next: 2 });
r = await up(`part=1&take=aaaa1111&seq=5`, Buffer.from("ZZZ"));
assert.equal(r.status, 409); assert.equal((await r.json()).next, 2);
assert.equal((await up(`part=1&take=aaaa1111&seq=2`, Buffer.from("CCC"))).status, 200);
assert.equal((await up(`part=1&take=bbbb2222&seq=0&ext=mp4&t0=${t0 + 9000}&off=50`, Buffer.from("take2"))).status, 200);
assert.equal((await up(`part=2&take=cccc3333&seq=0&ext=webm&t0=${t0}&off=0`, Buffer.from("sam"))).status, 200);
assert.equal((await fetch(`${base}/upload?k=bad&session=${session}&part=1&take=aaaa1111&seq=3`, { method: "POST", body: "x" })).status, 403);
assert.equal((await fetch(`${base}/upload?k=${KEY}&session=old&part=1&take=aaaa1111&seq=3`, { method: "POST", body: "x" })).status, 410);
assert.equal((await up(`part=1&take=../etc&seq=0`, Buffer.from("x"))).status, 400);
const dir = join(root, "recordings", session);
assert.equal(readFileSync(join(dir, "alex.webm"), "utf8"), "AAABBBCCC");
assert.equal(readFileSync(join(dir, "alex-2.m4a"), "utf8"), "take2");
assert.equal(readFileSync(join(dir, "sam.webm"), "utf8"), "sam");
ok("uploads: in order, duplicate ack, 409 on a gap, second take, key/session/take checks");

R1.json({ type: "rec-gap", part: 1, state: "hidden", at: Date.now() - 50, offset: 50 });
L.json({ type: "state", state: { index: 2, step: 1 } });
await sleep(1200);
st = C.take("status").at(-1);
const alex = st.speakers[0];
assert.equal(alex.takes, 2); assert.equal(alex.bytes, 14); assert.ok(alex.lastChunkAgeMs >= 0 && alex.lastChunkAgeMs < 3000);
assert.equal(C.take("gap").length, 1);
C.json({ type: "rec", action: "stop" }); await settle();
assert.equal(R1.take("rec").at(-1).state, "stopped");
const hget = async () => (await get(`/api/helper?k=${KEY}&lead=${LEAD}`)).json();
let h = await hget();
assert.equal(h.session, session); assert.equal(h.state, "stopped"); assert.equal(h.mix.state, "waiting", "the mix waits for the last uploads");
assert.equal((await up(`part=2&take=cccc3333&seq=1`, Buffer.from("!"))).status, 200, "the last chunk after stop is kept");
await sleep(600);
const tl = JSON.parse(readFileSync(join(dir, "timeline.json"), "utf8"));
assert.equal(tl.session, session); assert.equal(tl.beepAt, go.beepAt); assert.ok(tl.stoppedAt > tl.beepAt);
const tr = Object.fromEntries(tl.tracks.map((x) => [x.file, x]));
assert.equal(tr["alex.webm"].startedAt, t0); assert.equal(tr["alex.webm"].clockOffsetMs, 50); assert.equal(tr["alex.webm"].chunks, 3);
assert.ok(tr["alex.webm"].firstChunkAt >= tl.startedAt);
assert.equal(tr["sam.webm"].bytes, 4);
const types = tl.events.map((e) => e.type);
assert.deepEqual(types.filter((x) => x !== "scene"), ["start", "beep", "gap", "stop"]);
assert.ok(tl.events.some((e) => e.type === "scene" && e.id === "end" && e.step === 1));
assert.ok(tl.events.find((e) => e.type === "gap").estAt > 0);
assert.equal(tl.obs, null, "no OBS file without obs-websocket");
ok("timeline.json: start, beep, scene steps, gap, stop, tracks with clock offsets");

// the helper: the mix becomes pending once the uploads settled (alex's newest take got nothing after Stop: 4 x settle cap)
for (let i = 0; i < 30 && (h = await hget()).mix.state !== "pending"; i++) await sleep(100);
assert.equal(h.mix.state, "pending");
let pst = await (await get(`/api/status?k=${KEY}&lead=${LEAD}`)).json();
assert.equal(pst.helper.online, true, "a helper poll marks it online");
const hpost = (body) => fetch(`${base}/api/helper?k=${KEY}&lead=${LEAD}`, { method: "POST", body: JSON.stringify(body) });
assert.equal((await hpost({ session: "other", mix: { state: "done", path: "/x" } })).status, 200);
assert.equal((await hget()).mix.state, "pending", "a post for another session is ignored");
await hpost({ session, mix: { state: "mixing", note: "mixing", folder: "/rec/" + session } });
await sleep(1100);
assert.equal(C.take("status").at(-1).mix.state, "mixing");
await hpost({ session, mix: { state: "done", path: "/rec/final.mp4", voices: "/rec/voices.wav", evil: "x" } });
pst = await (await get(`/api/status?k=${KEY}&lead=${LEAD}`)).json();
assert.deepEqual(pst.mix, { state: "done", path: "/rec/final.mp4", voices: "/rec/voices.wav" });
C.json({ type: "open", what: "folder" }); await settle();
assert.deepEqual((await hget()).jobs, [{ open: session, what: "folder" }]);
assert.deepEqual((await hget()).jobs, [], "jobs are handed out once");
ok("helper API: mix waits for uploads, then pending; progress shown to the console; open-folder job");

// Ctrl+R in the lead deck: the lead overlay may start and stop, the OBS overlay may not
const OL = client(`role=overlay&kind=lead&k=${KEY}&lead=${LEAD}`); await OL.ready;
O.json({ type: "rec", action: "toggle" }); await settle();
assert.equal((await hget()).state, "stopped", "the OBS overlay cannot start");
OL.json({ type: "rec", action: "toggle" }); await settle();
assert.equal((await hget()).state, "countdown");
r = await fetch(`${base}/api/rec?k=${KEY}&lead=${LEAD}&action=stop`, { method: "POST" });
assert.equal((await r.json()).rec.state, "stopped");
OL.close();
ok("Ctrl+R from the lead deck toggles REC; the OBS overlay cannot; POST /api/rec stops (npm run stop)");

/* ------------------------------------------------------------------ optional: real audio through mix.py */

if (process.env.MIX_TEST) {
  const ff = (args) => { const x = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]); assert.equal(x.status, 0, String(x.stderr)); };
  const work = join(root, "audio"); mkdirSync(work);
  // speaker 1: 2 s silence, then 0.5 s of 440 Hz; speaker 2: 2 s silence, then 0.5 s of 880 Hz
  const tone = (f, file) => ff(["-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono:d=2", "-f", "lavfi", "-i", `sine=f=${f}:d=0.5:r=48000`,
    "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono:d=1.5", "-filter_complex", "[0][1][2]concat=n=3:v=0:a=1", "-c:a", "libopus", "-b:a", "96k", join(work, file)]);
  tone(440, "a.webm"); tone(880, "b.webm");
  // a 6 s "OBS" video with the 1 kHz beep at 1.5 s
  ff(["-f", "lavfi", "-i", "color=c=gray:s=320x180:r=30:d=6", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo:d=1.5",
    "-f", "lavfi", "-i", "sine=f=1000:d=0.2:r=48000", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo:d=4.3",
    "-filter_complex", "[2]aformat=channel_layouts=stereo[b];[1][b][3]concat=n=3:v=0:a=1[a]", "-map", "0:v", "-map", "[a]",
    "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", join(work, "obs.mkv")]);

  C.json({ type: "rec", action: "start" }); await sleep(500);
  const tl2 = (await (async () => { for (let i = 0; i < 50; i++) { const s = await (await get(`/api/status?k=${KEY}&lead=${LEAD}`)).json(); if (s?.rec?.state === "recording" && s.rec.session !== session) return s.rec; await sleep(100); } })());
  assert.ok(tl2?.beepAt, "no beep: " + JSON.stringify(C.msgs.slice(-3)) + srvOut.slice(-600));
  // speaker 1 started 1.0 s before the beep, speaker 2 0.5 s after (clock offsets 120 and -80 ms)
  const send = async (part, file, startServer, off) => {
    const buf = readFileSync(join(work, file)); const n = 3, size = Math.ceil(buf.length / n);
    for (let i = 0; i < n; i++) {
      const res = await fetch(`${base}/upload?k=${KEY}&session=${tl2.session}&part=${part}&take=t${part}x${part}&seq=${i}&ext=webm&t0=${startServer - off}&off=${off}&rtt=20`,
        { method: "POST", body: buf.subarray(i * size, (i + 1) * size) });
      assert.equal(res.status, 200);
    }
  };
  await send(1, "a.webm", tl2.beepAt - 1000, 120);
  await send(2, "b.webm", tl2.beepAt + 500, -80);
  C.json({ type: "rec", action: "stop" }); await sleep(700);
  const sdir = join(root, "recordings", tl2.session);
  const onsets = (file) => {
    const x = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", "silencedetect=noise=-35dB:d=0.1", "-f", "null", "-"], { encoding: "utf8" });
    return [...x.stderr.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  };
  const mixEnv = { ...process.env, OBS_VIDEO_DIRS: "" };   // no guessing in the real ~/Videos here
  let x = spawnSync("python3", [join(root, "remote/mix.py"), sdir], { encoding: "utf8", env: mixEnv });
  assert.equal(x.status, 0, x.stdout + x.stderr);
  // no video: the earliest take (speaker 1) starts at 0 → tones at 2.0 and 1.5 + 2.0 = 3.5
  const v = onsets(join(sdir, "voices.wav"));
  assert.ok(Math.abs(v[0] - 2.0) < 0.06 && Math.abs(v[1] - 3.5) < 0.06, "voices onsets " + v);
  x = spawnSync("python3", [join(root, "remote/mix.py"), sdir, "--video", join(work, "obs.mkv")], { encoding: "utf8", env: mixEnv });
  assert.equal(x.status, 0, x.stdout + x.stderr);
  assert.match(x.stdout, /Sync beep in the video at 1\.5/);
  // beep at 1.5 → speaker 1 at 0.5 (tone 2.5), speaker 2 at 2.0 (tone 4.0)
  const f = onsets(join(sdir, "final.mp4"));
  assert.ok(Math.abs(f[0] - 1.5) < 0.06 && Math.abs(f[1] - 2.5) < 0.06 && Math.abs(f[2] - 4.0) < 0.06, "final onsets " + f);
  const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name", "-of", "csv=p=0", join(sdir, "final.mp4")], { encoding: "utf8" }).stdout;
  assert.match(probe, /h264,video/); assert.match(probe, /aac,audio/);
  // with the video, voices.wav is on the video's timeline too (no deck audio, no beep)
  const vw = onsets(join(sdir, "voices.wav"));
  assert.ok(Math.abs(vw[0] - 2.5) < 0.06 && Math.abs(vw[1] - 4.0) < 0.06, "voices.wav with video " + vw);
  ok(`mix.py aligns real opus takes by timeline.json (voices ${v.map((n) => n.toFixed(2))}, video ${f.map((n) => n.toFixed(2))})`);
}

for (const w of [R1, R2, L, F, X, F2, C, O]) w.close();
srv.kill();
console.log(`\n${passed} checks passed (fixture: ${root})`);
process.exit(0);

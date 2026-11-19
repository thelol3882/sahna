// Browser run of the whole recording flow (Playwright Chromium, fake microphone, fake OBS, fake cloudflared):
//
//   PW=/opt/npm-tools/node_modules/playwright node remote/test/e2e-browser.mjs <shots dir>
//
// npm run record (node mode) → control page, lead deck, OBS deck, 4 phones (390×844) that join with one tap each
// → READY → Start (fake OBS records) → slide changes from the phones and the lead deck → Stop → the helper mixes
// final.mp4 under the fake OBS video → npm run stop. Screenshots of every screen go to <shots dir>.
import { createRequire } from "node:module";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, statSync, chmodSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { startFakeObs } from "./fake-obs.mjs";

const MOD = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = join(MOD, "..");
const SHOTS = process.argv[2] || join(ROOT, "shots");
mkdirSync(SHOTS, { recursive: true });
const pw = createRequire(join(process.env.PW || "/opt/npm-tools/node_modules/playwright", "x.js"))("playwright");
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const tmp = mkdtempSync(join(tmpdir(), "deck-e2e-"));
const ff = (args) => { const x = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]); assert.equal(x.status, 0, String(x.stderr)); };
const taps = { lead: [], phone: [] };

// four speakers for this run, whatever the deck's own config says: a temporary config.local.json (merged over
// config.json), removed on exit unless the project already had one
const names = ["Alex", "Sam", "Kim", "Lee"];
const LOCAL = join(MOD, "config.local.json");
if (!existsSync(LOCAL)) {
  writeFileSync(LOCAL, JSON.stringify({ speakers: names.map((name, i) => ({ part: i + 1, name })) }, null, 2));
  process.on("exit", () => { try { unlinkSync(LOCAL); } catch { /* already gone */ } });
}
const tap = (who, what) => taps[who].push(what);

// a voice-like fake microphone: a 180 Hz tone with a syllable rhythm
const wav = join(tmp, "voice.wav");
ff(["-f", "lavfi", "-i", "aevalsrc=0.4*sin(2*PI*180*t)*(0.55+0.45*sin(2*PI*3*t))*gt(sin(2*PI*0.4*t)\\,-0.3):s=48000:d=60", "-ac", "1", wav]);

// fake OBS on the default port, with a password; on StopRecord it writes an mkv with the beep where the deck beeped
let server = null;
const obsFile = join(tmp, "Videos", "2026-11-20 10-00-00.mkv");
mkdirSync(dirname(obsFile), { recursive: true });
const obs = await startFakeObs({ port: 4455, password: "e2e-pass", outputPath: obsFile, onStop: async (path, st) => {
  const s = await server.status();
  const beep = Math.max(0.2, (s.rec.beepAt - st.startedAt) / 1000), dur = (st.stoppedAt - st.startedAt) / 1000 + 0.5;
  ff(["-f", "lavfi", "-i", `color=c=0x10141f:s=640x360:r=30:d=${dur}`, "-f", "lavfi", "-i", `anullsrc=r=48000:cl=stereo:d=${beep}`,
    "-f", "lavfi", "-i", "sine=f=1000:d=0.2:r=48000", "-f", "lavfi", "-i", `anullsrc=r=48000:cl=stereo:d=${dur - beep - 0.2}`,
    "-filter_complex", "[2]aformat=channel_layouts=stereo[b];[1][b][3]concat=n=3:v=0:a=1[a]", "-map", "0:v", "-map", "[a]",
    "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", path]);
} });

// fake cloudflared: the phones use localhost here, the tunnel address only has to be printed
const bin = join(tmp, "bin"); mkdirSync(bin);
writeFileSync(join(bin, "cloudflared"), "#!/bin/sh\necho \"INF | https://e2e-fake-words.trycloudflare.com |\" >&2\nexec sleep 3600\n");
chmodSync(join(bin, "cloudflared"), 0o755);
const LOG = join(tmp, "actions.jsonl");
const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, REMOTE_TEST_LOG: LOG, OBS_PASSWORD: "e2e-pass", OBS_VIDEO_DIRS: "" };
const npm = (...args) => new Promise((done) => {
  const p = spawn("npm", ["run", "--silent", ...args], { cwd: ROOT, env });
  let out = ""; p.stdout.on("data", (d) => { out += d; }); p.stderr.on("data", (d) => { out += d; });
  p.on("close", (status) => done({ status, out }));
});

let r = await npm("stop");
r = await npm("record", "--", "--mode", "node", "--fresh", "--no-build");
console.log(r.out);
assert.equal(r.status, 0);
tap("lead", "terminal: npm run record");
const st = JSON.parse(readFileSync(join(MOD, ".run/state.json"), "utf8"));
const base = `http://localhost:${st.port}`;
server = { status: async () => (await fetch(`${base}/api/status?k=${st.key}&lead=${st.lead}`)).json() };
const opened = readFileSync(LOG, "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((a) => a.kind === "open").map((a) => a.value);
assert.equal(opened.length, 2);
tap("lead", "chat: paste the team message (already in the clipboard)");

const browser = await pw.chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${wav}`, "--autoplay-policy=no-user-gesture-required"] });
const errors = [];
const watch = (page, name) => { page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`)); page.on("console", (m) => { if (m.type() === "error") errors.push(`${name}: ${m.text()}`); }); };

// the two pages npm run record opened, and OBS's browser source
const desk = await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 });
const control = await desk.newPage(); watch(control, "control");
await control.goto(opened[0]);
const leadDeck = await desk.newPage(); watch(leadDeck, "lead");
await leadDeck.setViewportSize({ width: 1440, height: 810 });
await leadDeck.goto(opened[1]);
const obsCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const obsDeck = await obsCtx.newPage(); watch(obsDeck, "obs");
await obsDeck.goto(`${base}/?remote&obs&k=${st.key}#cover`);
await sleep(2500);
assert.equal(await leadDeck.evaluate(() => window.__deckBackgroundFrames), true, "lead deck keeps animating in a background tab");
await control.screenshot({ path: join(SHOTS, "control-1-waiting.png") });

// four phones, one tap each
const phones = [];
for (let i = 0; i < 4; i++) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, permissions: ["microphone"] });
  const p = await ctx.newPage(); watch(p, names[i]);
  await p.goto(`${base}/remote?k=${st.key}#part${i + 1}`);
  phones.push(p);
}
await sleep(800);
await phones[1].screenshot({ path: join(SHOTS, "phone-1-join.png") });
for (const [i, p] of phones.entries()) {
  assert.ok(await p.locator("#join").isVisible(), "join screen");
  await p.locator("#ready").tap(); tap("phone", `${names[i]}: I'm ready`);
}
for (const p of phones) await p.locator("#talk").waitFor({ state: "visible", timeout: 5000 });   // talk screen after one tap
// regression: "I'm ready" right after the page loads must keep the microphone (an early timer used to close it)
await phones[3].reload();
await phones[3].locator("#ready").tap();
await phones[3].locator("#talk").waitFor({ state: "visible", timeout: 5000 });
await sleep(2500);
assert.equal(await phones[3].evaluate(() => micLive()), true, "mic still on after a fast tap");
assert.equal(await phones[3].locator("#micWarn").isVisible(), false);
let s;
for (let i = 0; i < 60; i++) { s = await server.status(); if (s.speakers.every((x) => x.micOn && x.headphones)) break; await sleep(200); }   // phones report every 3 s
await sleep(400);
assert.deepEqual(s.speakers.map((x) => [x.name, x.connected, x.micOn, x.headphones]), names.map((n) => [n, true, true, true]));
const waitReady = async () => {
  try { await control.waitForFunction(() => document.getElementById("big").textContent === "READY", null, { timeout: 8000 }); }   // status comes 1/s
  catch (e) {
    const dbg = await Promise.all(phones.map((p) => p.evaluate(() => ({ mic: !!mic, tracks: mic ? mic.stream.getAudioTracks().map((t) => [t.readyState, t.muted, t.enabled]) : null, joined, levelOn, recState, ctx: mic && mic.ctx.state }))));
    throw new Error("control page not READY: " + await control.locator("#big").textContent() + " " + JSON.stringify((await server.status()).speakers.map((x) => [x.name, x.connected, x.mic, x.micOn, x.headphones, x.phones])) + "\n" + JSON.stringify(dbg));
  }
};
await waitReady();
assert.match(await control.locator("#obsText").textContent(), /OBS connected/);
await control.screenshot({ path: join(SHOTS, "control-2-ready.png") });
await phones[0].screenshot({ path: join(SHOTS, "phone-2-talk-own-part.png") });
await phones[1].screenshot({ path: join(SHOTS, "phone-3-talk-not-own.png") });
assert.equal(await phones[0].locator("#fwd").isDisabled(), false, "speaker 1 can press Next on the cover");
assert.equal(await phones[1].locator("#fwd").isDisabled(), true, "speaker 2 cannot");
assert.ok(await phones[0].locator("#turnPill").isVisible());
await phones[0].locator("#more").tap();
await sleep(300);
await phones[0].screenshot({ path: join(SHOTS, "phone-4-details-sheet.png") });
await phones[0].locator("#sheetClose").tap();

// Start: OBS first, then the countdown on every phone
await waitReady();
console.log("before Start:", await control.locator("#big").textContent(), "|", await control.locator("#primary").textContent(), "|", JSON.stringify((await server.status()).obs));
await control.locator("#primary").click(); tap("lead", "control: Start recording");
await sleep(350);
await control.screenshot({ path: join(SHOTS, "control-3-starting.png") });
for (let i = 0; i < 100 && !(await phones[2].locator("#count").isVisible()); i++) await sleep(50);
await phones[2].screenshot({ path: join(SHOTS, "phone-5-countdown.png") });
s = await server.status();
assert.equal(obs.state.recording, true, "fake OBS records");
for (let i = 0; i < 50 && (await server.status()).rec.state !== "recording"; i++) await sleep(100);

// the talk: the speakers' phones move through the first scenes, the lead's arrow key too
const stateIdx = async () => (await server.status()).state;
const before = await stateIdx();
await sleep(1500);
// Next is live only on the phone whose speaker owns the scene on screen: two presses, each by that phone
for (let press = 0; press < 2; press++) {
  let k = -1;
  for (let t = 0; t < 40 && k < 0; t++) {
    for (const [i, p] of phones.entries()) if (!(await p.locator("#fwd").isDisabled())) { k = i; break; }
    if (k < 0) await sleep(150);
  }
  assert.ok(k >= 0, "some phone owns the scene on screen");
  await phones[k].locator("#fwd").tap(); tap("phone", `${names[k]}: Next`);
  await sleep(3000);   // the deck ignores Next while a slide animates in
}
const after = await stateIdx();
assert.ok(after.index > before.index || after.step > before.step, `phones moved the deck: ${JSON.stringify(before)} → ${JSON.stringify(after)}`);
await leadDeck.bringToFront();
await leadDeck.keyboard.press("ArrowRight");
await sleep(2500);
const afterLead = await stateIdx();
console.log(`deck: ${JSON.stringify(before)} → phones ${JSON.stringify(after)} → lead key ${JSON.stringify(afterLead)}`);
assert.ok(afterLead.index > after.index || afterLead.step > after.step, "the lead deck's arrow key moved every deck");
await phones[0].screenshot({ path: join(SHOTS, "phone-6-recording.png") });
await phones[1].screenshot({ path: join(SHOTS, "phone-7-recording-not-own.png") });
await leadDeck.screenshot({ path: join(SHOTS, "lead-deck-recording.png") });
await sleep(7000);   // at least one 5 s chunk from every phone
await control.screenshot({ path: join(SHOTS, "control-4-recording.png") });
s = await server.status();
for (const x of s.speakers) assert.ok(x.bytes > 0 && x.recording, `${x.name} uploads`);

// Stop: click twice (the second confirms), then the mix runs by itself
await control.locator("#primary").click(); tap("lead", "control: Stop");
await control.locator("#primary").click(); tap("lead", "control: Stop (confirm)");
await sleep(400);
await control.screenshot({ path: join(SHOTS, "control-5-mixing.png") });
for (let i = 0; i < 150 && !["done", "error"].includes((await server.status()).mix?.state); i++) await sleep(200);
s = await server.status();
assert.equal(s.mix.state, "done", JSON.stringify(s.mix));
await sleep(500);
await control.screenshot({ path: join(SHOTS, "control-6-done.png") });
const final = s.mix.path;
assert.ok(statSync(final).size > 10000 && existsSync(join(dirname(final), "voices.wav")));
const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name:format=duration", "-of", "csv=p=0", final], { encoding: "utf8" }).stdout;
const tl = JSON.parse(readFileSync(join(dirname(final), "timeline.json"), "utf8"));
console.log(`final.mp4: ${final}\n${probe.trim()}\ntracks: ${tl.tracks.map((t) => `${t.name} ${t.chunks} chunks ${t.bytes} B`).join(", ")}\nevents: ${tl.events.map((e) => e.type).join(" ")}`);
assert.equal(tl.obs.outputPath, obsFile);
assert.ok(tl.events.filter((e) => e.type === "scene").length >= 3, "scene events in timeline.json");

// the lead's Ctrl+R in the deck starts and (twice) stops a second take
await leadDeck.bringToFront();
await leadDeck.keyboard.press("Control+r");
for (let i = 0; i < 60 && (await server.status()).rec.state !== "recording"; i++) await sleep(100);
assert.equal((await server.status()).rec.state, "recording", "Ctrl+R started");
await sleep(1200);
await leadDeck.keyboard.press("Control+r");
await sleep(200);
assert.equal((await server.status()).rec.state, "recording", "one Ctrl+R does not stop");
await leadDeck.keyboard.press("Control+r");
await sleep(300);
assert.equal((await server.status()).rec.state, "stopped", "Ctrl+R twice stops");
assert.ok(leadDeck.url().includes("lead="), "no reload");
for (let i = 0; i < 150 && !["done", "error"].includes((await server.status()).mix?.state); i++) await sleep(200);

writeFileSync(join(SHOTS, "taps.json"), JSON.stringify(taps, null, 2));
await browser.close();
r = await npm("stop");
console.log(r.out);
tap("lead", "terminal: npm run stop");
await obs.close();
const real = errors.filter((e) => !/favicon|Failed to load resource/.test(e));
console.log(real.length ? "page errors:\n" + real.join("\n") : "no page errors");
console.log(`taps: lead ${taps.lead.length} (${taps.lead.join("; ")}), each phone ${taps.phone.filter((t) => t.includes("ready")).length / 4}`);
assert.equal(real.length, 0);
console.log("E2E OK");
process.exit(0);

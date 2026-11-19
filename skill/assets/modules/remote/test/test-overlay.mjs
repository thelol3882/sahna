// rec-overlay.js in the lead deck: while the tab is hidden, animation frames come from a worker (the deck's GSAP
// keeps running, so phone Next presses are not stuck); visible = the browser's own requestAnimationFrame.
// The tab's hidden state is faked (headless Chromium never hides a page).
//
//   PW=/opt/npm-tools/node_modules/playwright node remote/test/test-overlay.mjs
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const pw = createRequire(join(process.env.PW || "/opt/npm-tools/node_modules/playwright", "x.js"))("playwright");
const overlay = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../rec-overlay.js"), "utf8");
const srv = createServer((q, r) => { r.writeHead(200, { "content-type": "text/html" }); r.end(`<body><script>
let hidden = false; Object.defineProperty(document, "hidden", { get: () => hidden });
window.native = 0; const nr = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => { window.native++; return nr(cb); };
window.setHidden = (h) => { hidden = h; };
</script><script>${overlay}</script></body>`); }).listen(0);
const b = await pw.chromium.launch();
const p = await b.newPage();
await p.goto(`http://127.0.0.1:${srv.address().port}/?remote&k=x&lead=y`);
const res = await p.evaluate(() => new Promise((ok) => {
  setHidden(true); window.native = 0;
  let n = 0; const f = () => { n++; requestAnimationFrame(f); }; requestAnimationFrame(f);
  setTimeout(() => { const hiddenFrames = n, nat = window.native; setHidden(false); window.native = 0; setTimeout(() => ok({ hiddenFrames, nat, visibleNative: window.native, flag: window.__deckBackgroundFrames }), 500); }, 1000);
}));
assert.ok(res.flag); assert.equal(res.nat, 0); assert.ok(res.hiddenFrames >= 20 && res.hiddenFrames <= 40, JSON.stringify(res)); assert.ok(res.visibleNative > 10);
assert.equal(await p.evaluate(() => new Promise((ok) => { setHidden(true); let hit = false; const id = requestAnimationFrame(() => { hit = true; }); cancelAnimationFrame(id); setTimeout(() => ok(hit), 300); })), false);
const obsPage = await b.newPage();
await obsPage.goto(`http://127.0.0.1:${srv.address().port}/?remote&obs&k=x`);
assert.equal(await obsPage.evaluate(() => window.__deckBackgroundFrames), undefined, "the OBS deck keeps the browser's frames");
console.log(`  ok  hidden lead deck: ${res.hiddenFrames} frames/s from the worker, none native; visible: native; cancel works; OBS deck untouched\n\n1 checks passed`);
await b.close(); srv.close();

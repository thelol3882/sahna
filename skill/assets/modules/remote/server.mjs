// Deck remote: a small relay between the deck (laptop, OBS, viewers), the speakers' phones and
// the lead's pre-flight console. It can also collect a local recording from every phone.
//
//   node remote/server.mjs                       # usually started by: npm run record
//
// Env: REMOTE_KEY (random if missing), LEAD_KEY (no lead deck and no console if empty),
// PORT (default from remote/config.json or 8787), HOST (default 127.0.0.1; Docker sets 0.0.0.0),
// RECORDINGS_DIR (default <deck>/recordings), OBS_URL / OBS_PASSWORD (override config.json "obs"),
// OBS_DECK_URL (the OBS link: written into the OBS Browser source when OBS connects).
//
// Routes (protocol and formats: remote/NOTES.md):
//   /?k=KEY[&remote][&lead=LEAD][&obs]   the built deck (dist-single/, else dist/)
//   /remote?k=KEY#partN                  the phone remote
//   /preflight?k=KEY&lead=LEAD           the lead's control page: READY, REC, OBS, mix
//   /api/status?k=KEY&lead=LEAD          the control page's status as JSON (npm run record / stop)
//   /api/rec?k=KEY&lead=LEAD&action=…    POST: start | stop the recording (npm run stop)
//   /api/helper?k=KEY&lead=LEAD          GET: jobs for the host helper (mix, open folder); POST: its progress
//   /ws?k=KEY&role=deck|remote|console|overlay
//   POST /upload?k=KEY&session=…          a chunk of a phone recording
//   /media/...                           files from media/ with Range support (video seeking)
//   /rec-overlay.js                      sync beep for the OBS and lead decks (injected)
//   /healthz                             "ok"
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync, createReadStream, readdirSync, mkdirSync, appendFileSync, writeFileSync, renameSync } from "node:fs";
import { randomBytes, createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, sep, extname } from "node:path";
import { WebSocketServer, WebSocket } from "ws";

const here = dirname(fileURLToPath(import.meta.url));
const root = process.env.DECK_ROOT ? resolve(process.env.DECK_ROOT) : join(here, "..");

/* ------------------------------------------------------------------ config */

function readJson(file) {
  try { return JSON.parse(readFileSync(file, "utf8")); } catch (e) {
    if (existsSync(file)) console.error(`Cannot read ${file}: ${e.message}`);
    return null;
  }
}
// config.local.json (git-ignored) is merged over config.json: secrets such as the OBS password go there
const readConfig = () => {
  const base = readJson(join(here, "config.json")) ?? {};
  const local = readJson(join(here, "config.local.json")) ?? {};
  return { ...base, ...local, obs: local.obs === false || base.obs === false && !local.obs ? false : { ...(base.obs || {}), ...(local.obs || {}) } };
};
const CONFIG = readConfig();
const PORT = Number(process.env.PORT ?? CONFIG.port ?? 8787);
const HOST = process.env.HOST ?? "127.0.0.1";
const KEY = process.env.REMOTE_KEY || randomBytes(6).toString("hex");
// the presenter's own deck adds &lead=<LEAD_KEY>: its keys then move every other open deck
const LEAD = process.env.LEAD_KEY ?? "";
// next and prev are not forwarded: the other decks follow the state of the lead (slide and step) instead
const LEAD_CMDS = ["replay", "media-toggle", "media-skip", "media-seek"];
// the demo video belongs to the lead laptop: phones cannot pause or skip it
const REMOTE_CMDS = ["next", "prev", "hello", "replay"];
// two presses closer than this (two people at once, a double tap) count as one
const MIN_GAP_MS = 350;
const HEARTBEAT_MS = Number(process.env.HEARTBEAT_MS ?? 15000);
const MAX_MSG_BYTES = 256 * 1024;
const MAX_CHUNK_BYTES = 32 * 1024 * 1024;
const COUNTDOWN_MS = Number(CONFIG.recording?.countdownMs ?? 3000);

const DECK_DIR = ["dist-single", "dist"].map((d) => join(root, d)).find((d) => existsSync(join(d, "index.html")));
// media folder: MEDIA_DIR env (Docker) > config.json "mediaDir" (relative to the deck project) > media/
const MEDIA_DIR = process.env.MEDIA_DIR ? resolve(process.env.MEDIA_DIR) : CONFIG.mediaDir ? resolve(root, CONFIG.mediaDir) : join(root, "media");
const REC_DIR = resolve(process.env.RECORDINGS_DIR ?? join(root, "recordings"));

/* ------------------------------------------------------------------ speakers and scenes */

// Where the scene list comes from, best first:
//   1. remote/scenes.json                          (explicit, written by hand or by a build step)
//   2. {type:"scenes"} from the lead deck          (exact: the deck describes its own meta at runtime)
//   3. src/scenes/index.ts, parsed                 (literals only; field order and line breaks do not matter)
// Speakers: remote/config.json, else src/deck/config.ts (DECK.speakers, part = position + 1),
// else the deck's manifest, else the speaker names of the scenes in order.

/** Top-level object literals of the array after `export const scenes … = [`, as text. */
function sceneObjects(src) {
  const m = /export\s+const\s+scenes\b[^=]*=\s*\[/.exec(src);
  if (!m) return [];
  const out = [];
  let depth = 0, start = -1;
  for (let i = m.index + m[0].length; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") { i = skipString(src, i); continue; }
    if (c === "/" && src[i + 1] === "/") { i = src.indexOf("\n", i); if (i < 0) break; continue; }
    if (c === "/" && src[i + 1] === "*") { i = src.indexOf("*/", i + 2) + 1; if (i <= 0) break; continue; }
    if (c === "{" || c === "[" || c === "(") { if (depth === 0 && c === "{") start = i; depth++; }
    else if (c === "}" || c === "]" || c === ")") {
      if (depth === 0) break;          // the end of the scenes array
      depth--;
      if (depth === 0 && c === "}" && start >= 0) { out.push(src.slice(start + 1, i)); start = -1; }
    }
  }
  return out;
}
function skipString(src, i) {
  const q = src[i];
  for (i++; i < src.length; i++) { if (src[i] === "\\") i++; else if (src[i] === q) return i; }
  return i;
}
function literal(text) {
  text = text.trim();
  if (/^".*"$/s.test(text)) return JSON.parse(text);
  if (/^'.*'$/s.test(text)) return JSON.parse('"' + text.slice(1, -1).replace(/\\'/g, "'").replace(/"/g, '\\"') + '"');
  if (/^`[^$]*`$/s.test(text)) return text.slice(1, -1);
  return undefined;
}
/** Fields of one object literal at its own top level: key: "x" | 'x' | `x` | [literals] | number | true/false. */
function fields(body) {
  const out = {};
  let depth = 0;
  const STR = String.raw`"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|` + "`[^`$]*`";
  const re = new RegExp(String.raw`([A-Za-z_$][\w$]*)\s*:\s*(${STR}|\[(?:\s*(?:${STR})\s*,?)*\s*\]|-?\d+(?:\.\d+)?|true|false)`, "y");
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '"' || c === "'" || c === "`") { i = skipString(body, i); continue; }
    if (c === "{" || c === "[" || c === "(") { depth++; continue; }
    if (c === "}" || c === "]" || c === ")") { depth--; continue; }
    if (depth !== 0 || !/[A-Za-z_$]/.test(c) || /[\w$]/.test(body[i - 1] ?? "")) continue;
    re.lastIndex = i;
    const m = re.exec(body);
    if (!m) continue;
    const v = m[2];
    if (v.startsWith("[")) {
      const items = [...v.matchAll(new RegExp(STR, "g"))].map((x) => literal(x[0]));
      out[m[1]] = items;
    } else out[m[1]] = /^[-\d]/.test(v) ? Number(v) : v === "true" ? true : v === "false" ? false : literal(v);
    i = re.lastIndex - 1;
  }
  return out;
}

function parseSource() {
  const file = join(root, "src/scenes/index.ts");
  if (!existsSync(file)) return [];
  return sceneObjects(readFileSync(file, "utf8")).map(fields).filter((f) => typeof f.id === "string");
}

/** DECK.speakers and DECK.title from src/deck/config.ts (the starter), if present. */
function parseDeckConfig() {
  const file = join(root, "src/deck/config.ts");
  if (!existsSync(file)) return {};
  const src = readFileSync(file, "utf8");
  const out = {};
  const t = /\btitle\s*:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/.exec(src);
  if (t) out.title = literal(t[1]);
  const sp = /\bspeakers\s*:\s*\[([\s\S]*?)\]/.exec(src);
  if (sp) {
    const list = [];
    for (const o of sp[1].matchAll(/\{([^{}]*)\}/g)) {
      const f = fields(o[1]);
      if (f.name) list.push({ part: list.length + 1, id: f.id != null ? String(f.id) : undefined, name: String(f.name) });
    }
    if (list.length) out.speakers = list;
  }
  return out;
}

const DECK_CONFIG = parseDeckConfig();
const TITLE = CONFIG.title ?? DECK_CONFIG.title ?? "Deck remote";
const cleanSpeakers = (list) => (Array.isArray(list) ? list : [])
  .filter((s) => s && Number(s.part) >= 1 && s.name)
  .map((s) => ({ part: Number(s.part), name: String(s.name), ...(s.id != null ? { id: String(s.id) } : {}) }));
let SPEAKERS = cleanSpeakers(CONFIG.speakers);
let SPEAKER_SOURCE = SPEAKERS.length ? "remote/config.json" : "";
if (!SPEAKERS.length && DECK_CONFIG.speakers) { SPEAKERS = DECK_CONFIG.speakers; SPEAKER_SOURCE = "src/deck/config.ts"; }

const MARK = /\((?:click|→|->)\)/;
const chunksOf = (notes) =>
  Array.isArray(notes) ? notes.map((n) => String(n ?? "").trim()) : String(notes ?? "").split(MARK).map((c) => c.trim());

/** A scene's speaker (id, name, first name or part number) → part; 0 = nobody (backup slides). */
function partOf(speaker, derive) {
  if (typeof speaker === "number") return speaker;
  if (speaker == null || speaker === "") return 0;
  const want = String(speaker).trim().toLowerCase();
  const hit = SPEAKERS.find((s) => s.id != null && s.id.toLowerCase() === want)
    ?? SPEAKERS.find((s) => s.name.toLowerCase() === want)
    ?? SPEAKERS.find((s) => s.name.toLowerCase().split(/\s+/)[0] === want.split(/\s+/)[0]);
  if (hit) return hit.part;
  if (!derive) return 0;
  // no speaker list anywhere: every new speaker name gets the next part
  const part = SPEAKERS.length + 1;
  SPEAKERS.push({ part, name: String(speaker) });
  return part;
}

/** [{ id, title, speaker?, part?, notes: string | string[] }] → [{ id, title, speaker, part, chunks }] */
function normalize(list) {
  const derive = !SPEAKER_SOURCE || SPEAKER_SOURCE === "scenes";
  if (derive) { SPEAKERS = []; SPEAKER_SOURCE = "scenes"; }
  return (Array.isArray(list) ? list : []).filter((s) => s && s.id).map((s) => ({
    id: String(s.id),
    title: String(s.title ?? s.id),
    speaker: s.speaker == null ? "" : String(s.speaker),
    part: Number(s.part) >= 1 ? Number(s.part) : partOf(s.speaker, derive),
    chunks: chunksOf(s.notes),
    ...(s.appendix ? { appendix: true } : {}),
  }));
}

let SCENE_SOURCE = "none";
function loadScenes() {
  const file = join(here, "scenes.json");
  if (existsSync(file)) { SCENE_SOURCE = "remote/scenes.json"; return normalize(readJson(file)); }
  const parsed = parseSource();
  if (parsed.length) { SCENE_SOURCE = "src/scenes/index.ts"; return normalize(parsed); }
  SCENE_SOURCE = "none";
  return [];
}
let SCENES = loadScenes();

/* ------------------------------------------------------------------ http helpers */

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".gif": "image/gif", ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2",
  ".ttf": "font/ttf", ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime", ".m4v": "video/mp4",
  ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".wav": "audio/wav", ".ogg": "audio/ogg", ".vtt": "text/vtt",
  ".glb": "model/gltf-binary", ".txt": "text/plain; charset=utf-8", ".pdf": "application/pdf",
};

/** A file inside dir, or null (no "..", no absolute paths, no folders). */
function inside(dir, rel) {
  let p;
  try { p = resolve(dir, "." + sep + decodeURIComponent(rel)); } catch { return null; }
  if (p !== dir && !p.startsWith(dir + sep)) return null;
  try { return statSync(p).isFile() ? p : null; } catch { return null; }
}

function sendFile(req, res, file) {
  const size = statSync(file).size;
  const type = TYPES[extname(file).toLowerCase()] ?? "application/octet-stream";
  const head = { "content-type": type, "accept-ranges": "bytes", "cache-control": "no-cache" };
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
  if (m && (m[1] || m[2])) {
    let start, end;
    if (!m[1]) { start = Math.max(0, size - Number(m[2])); end = size - 1; }      // bytes=-500: the last 500
    else { start = Number(m[1]); end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1; }
    if (start >= size || start > end) { res.writeHead(416, { "content-range": `bytes */${size}` }).end(); return; }
    res.writeHead(206, { ...head, "content-range": `bytes ${start}-${end}/${size}`, "content-length": end - start + 1 });
    if (req.method === "HEAD") { res.end(); return; }
    createReadStream(file, { start, end }).on("error", () => res.destroy()).pipe(res);
    return;
  }
  res.writeHead(200, { ...head, "content-length": size });
  if (req.method === "HEAD") { res.end(); return; }
  createReadStream(file).on("error", () => res.destroy()).pipe(res);
}

const json = (x) => JSON.stringify(x).replace(/</g, "\\u003c");
const html = (res, body) => { res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }); res.end(body); };
const sendJson = (res, code, x) => { res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(x)); };

function page(file, data) {
  return readFileSync(join(here, file), "utf8").replace("__DATA__", json(data));
}
const pageData = () => ({ title: TITLE, speakers: SPEAKERS, scenes: SCENES, recording: CONFIG.recording ?? {} });

function mediaFiles() {
  try { return readdirSync(MEDIA_DIR, { withFileTypes: true }).filter((d) => d.isFile() && !d.name.startsWith(".")).map((d) => d.name); }
  catch { return []; }
}

/** The deck page; the OBS and lead decks also get the small sync-beep script. */
function deckPage(url) {
  let body = readFileSync(join(DECK_DIR, "index.html"), "utf8");
  const p = url.searchParams;
  if (p.has("remote") && (p.has("obs") || p.has("lead"))) {
    const tag = `<script src="/rec-overlay.js"></script>`;
    body = body.includes("</body>") ? body.replace(/<\/body>(?![\s\S]*<\/body>)/, tag + "</body>") : body + tag;
  }
  return body;
}

function readBody(req, limit) {
  return new Promise((ok, fail) => {
    const parts = []; let size = 0;
    req.on("data", (c) => { size += c.length; if (size > limit) { fail(new Error("too big")); req.destroy(); } else parts.push(c); });
    req.on("end", () => ok(Buffer.concat(parts)));
    req.on("error", fail);
  });
}

/* ------------------------------------------------------------------ http */

const server = createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url, "http://x"); } catch { res.writeHead(400).end(); return; }
  const keyOk = url.searchParams.get("k") === KEY;
  const leadOk = keyOk && LEAD !== "" && url.searchParams.get("lead") === LEAD;
  try {
    if (req.method === "POST" && url.pathname === "/upload") {
      if (!keyOk) { sendJson(res, 403, { error: "key" }); return; }
      await upload(req, res, url.searchParams);
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      // the laptop's own tools (start.py, its helper): lead key only
      if (!leadOk) { sendJson(res, 403, { error: "lead key" }); return; }
      if (url.pathname === "/api/status" && req.method === "GET") sendJson(res, 200, statusMsg());
      else if (url.pathname === "/api/rec" && req.method === "POST") await apiRec(res, url.searchParams.get("action"));
      else if (url.pathname === "/api/helper" && req.method === "GET") helperGet(res);
      else if (url.pathname === "/api/helper" && req.method === "POST") await helperPost(req, res);
      else sendJson(res, 404, { error: "no such api" });
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405).end(); return; }
    if (url.pathname === "/healthz") {
      res.writeHead(200, { "content-type": "text/plain" }).end("ok");
    } else if (url.pathname === "/" || url.pathname === "/index.html") {
      if (!keyOk) { res.writeHead(403).end("Wrong or missing key"); return; }
      if (!DECK_DIR) { res.writeHead(503).end("The deck is not built: run npm run build:single (or npm run build)."); return; }
      html(res, deckPage(url));
    } else if (url.pathname === "/remote") {
      if (!keyOk) { res.writeHead(403).end("Wrong or missing key"); return; }
      html(res, page("remote.html", pageData()));
    } else if (url.pathname === "/preflight") {
      if (!leadOk) { res.writeHead(403).end("The pre-flight page needs the key and the lead key"); return; }
      html(res, page("preflight.html", { ...pageData(), media: mediaFiles() }));
    } else if (url.pathname === "/rec-overlay.js") {
      res.writeHead(200, { "content-type": "text/javascript", "cache-control": "no-store" });
      res.end(readFileSync(join(here, "rec-overlay.js")));
    } else if (url.pathname.startsWith("/media/")) {
      // media is loaded by <video src="media/…"> without the key; the tunnel address itself is random
      const file = inside(MEDIA_DIR, url.pathname.slice("/media/".length));
      if (!file) { res.writeHead(404).end("Not found"); return; }
      sendFile(req, res, file);
    } else {
      // assets of the multi-file build (dist/assets/…); never the remote folder or the sources
      const file = DECK_DIR && inside(DECK_DIR, url.pathname.slice(1));
      if (!file || file === join(DECK_DIR, "index.html")) { res.writeHead(404).end("Not found"); return; }
      sendFile(req, res, file);
    }
  } catch (e) {
    if (!res.headersSent) res.writeHead(500).end(String(e?.message ?? e));
    else res.destroy();
  }
});

/* ------------------------------------------------------------------ OBS (obs-websocket v5, built into OBS 28+) */

// OBS → Tools → WebSocket Server Settings: enable it; the password goes to remote/config.local.json "obs" (git-ignored).
// When OBS answers, Start REC starts the OBS recording first and Stop stops it (and learns the file).
// When it does not, everything works as before: the lead starts and stops OBS by hand.
function obsConfig() {
  // config.json is read again on every attempt, so a password pasted while the server runs is picked up
  const c = readConfig().obs;
  if (c === false || process.env.OBS_URL === "off") return null;
  return {
    url: process.env.OBS_URL || c?.url || "ws://127.0.0.1:4455",
    password: process.env.OBS_PASSWORD || c?.password || "",
    source: c?.source || "Deck (browser)",
    deckUrl: process.env.OBS_DECK_URL || "",
  };
}
const OBS_RETRY_MS = Number(process.env.OBS_RETRY_MS ?? 3000);
// state: off | connecting | not-found | auth | connected
const obs = { state: obsConfig() ? "connecting" : "off", error: "", recording: false, version: "", source: null, ws: null,
  seq: 0, pending: new Map(), waiters: [], timer: null, lastPath: null };

function obsNote(text) { console.log("OBS: " + text); toAll(consoles, { type: "note", text: "OBS: " + text }); }
const sha = (s) => createHash("sha256").update(s).digest("base64");

function obsConnect() {
  clearTimeout(obs.timer);
  const cfg = obsConfig();
  if (!cfg) { obs.state = "off"; return; }
  let ws;
  try { ws = new WebSocket(cfg.url, "obswebsocket.json", { handshakeTimeout: 3000 }); }
  catch (e) { obs.state = "not-found"; obs.error = String(e.message ?? e); obs.timer = setTimeout(obsConnect, OBS_RETRY_MS); return; }
  obs.ws = ws;
  let identified = false, authFailed = false;
  ws.on("error", (e) => { if (!identified) obs.error = String(e.code ?? e.message ?? e); });
  ws.on("message", (data) => {
    let m; try { m = JSON.parse(String(data)); } catch { return; }
    const d = m.d ?? {};
    if (m.op === 0) {            // Hello
      const ident = { rpcVersion: 1, eventSubscriptions: 1 << 6 };   // Outputs: RecordStateChanged
      if (d.authentication) {
        if (!cfg.password) { authFailed = true; obs.state = "auth"; obs.error = "OBS asks for a password"; ws.close(); return; }
        ident.authentication = sha(sha(cfg.password + d.authentication.salt) + d.authentication.challenge);
      }
      obs.version = d.obsWebSocketVersion ?? "";
      ws.send(JSON.stringify({ op: 1, d: ident }));
    } else if (m.op === 2) {     // Identified
      identified = true;
      const was = obs.state;
      obs.state = "connected"; obs.error = "";
      if (was !== "connected") obsNote(`connected (${cfg.url})`);
      obsSync(cfg).catch(() => {});
    } else if (m.op === 5 && d.eventType === "RecordStateChanged") {
      const e = d.eventData ?? {};
      obs.recording = !!e.outputActive;
      if (e.outputPath) obs.lastPath = e.outputPath;
      for (const w of obs.waiters.filter((x) => x.state === e.outputState)) { w.done(e); }
      obs.waiters = obs.waiters.filter((x) => x.state !== e.outputState);
    } else if (m.op === 7) {     // RequestResponse
      const p = obs.pending.get(d.requestId);
      if (!p) return;
      obs.pending.delete(d.requestId); clearTimeout(p.timer);
      p.done({ ok: !!d.requestStatus?.result, code: d.requestStatus?.code, comment: d.requestStatus?.comment ?? "", data: d.responseData ?? {} });
    }
  });
  ws.on("close", (code) => {
    if (obs.ws === ws) obs.ws = null;
    for (const p of obs.pending.values()) { clearTimeout(p.timer); p.done({ ok: false, code: -1, comment: "OBS disconnected", data: {} }); }
    obs.pending.clear();
    if (authFailed || code === 4009) { obs.state = "auth"; obs.error = code === 4009 ? "wrong OBS password" : obs.error; }
    else { if (obs.state === "connected") obsNote("disconnected"); obs.state = "not-found"; }
    obs.recording = false;
    obs.timer = setTimeout(obsConnect, obs.state === "auth" ? OBS_RETRY_MS * 2 : OBS_RETRY_MS);
  });
}

function obsRequest(requestType, requestData, ms = 6000) {
  return new Promise((done) => {
    const ws = obs.ws;
    if (!ws || ws.readyState !== 1 || obs.state !== "connected") { done({ ok: false, code: -1, comment: "OBS is not connected", data: {} }); return; }
    const requestId = "r" + ++obs.seq;
    const timer = setTimeout(() => { obs.pending.delete(requestId); done({ ok: false, code: -2, comment: `no answer to ${requestType}`, data: {} }); }, ms);
    obs.pending.set(requestId, { done, timer });
    ws.send(JSON.stringify({ op: 6, d: { requestType, requestId, ...(requestData ? { requestData } : {}) } }));
  });
}
function obsWait(state, ms) {
  return new Promise((done) => {
    const w = { state, done: (e) => { clearTimeout(w.timer); done(e); } };
    w.timer = setTimeout(() => { obs.waiters = obs.waiters.filter((x) => x !== w); done(null); }, ms);
    obs.waiters.push(w);
  });
}

/** On connect: the current recording state, and the deck link (with this run's key) in the Browser source. */
async function obsSync(cfg) {
  const st = await obsRequest("GetRecordStatus");
  if (st.ok) obs.recording = !!st.data.outputActive;
  if (!cfg.deckUrl) { obs.source = null; return; }
  const cur = await obsRequest("GetInputSettings", { inputName: cfg.source });
  if (!cur.ok) { obs.source = "missing"; obsNote(`no source "${cfg.source}": import remote/obs-scene-collection.json once`); return; }
  if (cur.data.inputSettings?.url !== cfg.deckUrl) {
    const set = await obsRequest("SetInputSettings", { inputName: cfg.source, inputSettings: { url: cfg.deckUrl }, overlay: true });
    obs.source = set.ok ? "updated" : "missing";
    if (set.ok) obsNote(`deck link of "${cfg.source}" updated to this run's key`);
  } else obs.source = "ok";
}

const obsStatus = () => ({ state: obs.state, recording: obs.recording, error: obs.error, source: obs.source, version: obs.version, url: obsConfig()?.url ?? null });

/* ------------------------------------------------------------------ recording */

// One take = one MediaRecorder run on one phone. A phone that reloads or comes back from the
// background starts a new take, saved next to the first one (name-2.webm, …).
let rec = null; // { session, dir, startedAt, beepAt, stoppedAt, takes: Map, events: [], obs, mix }
const slug = (s) => String(s).normalize("NFKD").replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "speaker";
const recActive = () => !!(rec && !rec.stoppedAt);

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function recEvent(e) {
  if (!rec) return;
  const at = Date.now();
  rec.events.push({ at, t: at - rec.startedAt, ...e });
  saveTimeline();
}

let saveTimer = null;
function saveTimeline(now = false) {
  if (!rec) return;
  clearTimeout(saveTimer);
  const write = () => {
    const out = {
      version: 1,
      session: rec.session,
      title: TITLE,
      clock: "server milliseconds since the Unix epoch; t = milliseconds since startedAt",
      startedAt: rec.startedAt, countdownMs: COUNTDOWN_MS, beepAt: rec.beepAt, stoppedAt: rec.stoppedAt,
      speakers: SPEAKERS,
      // the OBS file of this take, when OBS was driven over obs-websocket (npm run mix finds it here)
      obs: rec.obs ?? null,
      tracks: [...rec.takes.values()].map(({ fd, ...t }) => t),
      events: rec.events,
    };
    const file = join(rec.dir, "timeline.json");
    try { writeFileSync(file + ".tmp", JSON.stringify(out, null, 2)); renameSync(file + ".tmp", file); }
    catch (e) { console.error("timeline.json:", e.message); }
  };
  if (now) write(); else saveTimer = setTimeout(write, 400);
}

let countdownTimer = null;
let starting = false;   // waiting for OBS to start recording
const OBS_START_MS = Number(process.env.OBS_START_MS ?? 10000);
const OBS_TAIL_MS = Number(process.env.OBS_TAIL_MS ?? 1000);

/** Start REC for everyone. With OBS connected: OBS starts recording first, then the countdown and the beep. */
async function recStart() {
  if (recActive() || starting) return;
  let viaObs = false;
  if (obs.state === "connected") {
    starting = true;
    toAll(consoles, statusMsg());
    try {
      const st = await obsRequest("GetRecordStatus");
      if (!(st.ok && st.data.outputActive)) {
        const started = obsWait("OBS_WEBSOCKET_OUTPUT_STARTED", OBS_START_MS);
        const r = await obsRequest("StartRecord");
        if (!r.ok) throw new Error(r.comment || `error ${r.code}`);
        if (!(await started)) throw new Error(`no recording after ${Math.round(OBS_START_MS / 1000)} s`);
        obsNote("recording started");
      } else obsNote("was already recording: using that recording");
      viaObs = true;
    } catch (e) {
      starting = false;
      const text = `OBS did not start recording (${e.message}). Start OBS by hand, then press Start again.`;
      obsNote(text);
      toAll(consoles, { type: "rec-error", text }); toAll(overlays, { type: "rec-error", text });
      toAll(consoles, statusMsg());
      return;
    }
    starting = false;
    if (recActive()) return;
  }
  beginTake(viaObs);
  toAll(consoles, statusMsg());
}

function beginTake(viaObs) {
  // a new folder per take, even when the lead restarts within the same second
  let session = stamp(), n = 1;
  while (existsSync(join(REC_DIR, session))) session = `${stamp()}-${++n}`;
  const dir = join(REC_DIR, session);
  mkdirSync(dir, { recursive: true });
  rec = { session, dir, startedAt: Date.now(), beepAt: null, stoppedAt: null, takes: new Map(), events: [],
    obs: viaObs ? { driven: true, outputPath: null } : null, mix: null };
  recEvent({ type: "start", obs: viaObs });
  if (lastState?.state) recEvent(sceneEvent(lastState.state));
  const msg = { type: "rec", state: "countdown", session, at: rec.startedAt, countdownMs: COUNTDOWN_MS };
  toAll(remotes, msg); toAll(consoles, msg); toAll(overlays, msg);
  console.log(`REC ${session}: countdown${viaObs ? " (OBS recording)" : ""}`);
  countdownTimer = setTimeout(() => {
    if (!recActive()) return;
    // the clap: OBS and lead decks beep and flash now; mix.py finds it in the OBS audio
    rec.beepAt = Date.now();
    recEvent({ type: "beep" });
    const go = { type: "rec", state: "recording", session, at: rec.startedAt, beepAt: rec.beepAt };
    toAll(overlays, { ...go, beep: true }); toAll(remotes, go); toAll(consoles, go);
  }, COUNTDOWN_MS);
}

function recStop() {
  if (!recActive()) return;
  clearTimeout(countdownTimer);
  rec.stoppedAt = Date.now();
  recEvent({ type: "stop" });
  saveTimeline(true);
  const r = rec;
  r.mix = { state: "waiting", note: r.obs?.driven ? "stopping OBS" : "saving the last uploads" };
  const msg = { type: "rec", state: "stopped", session: rec.session, at: rec.startedAt, stoppedAt: rec.stoppedAt };
  toAll(remotes, msg); toAll(consoles, msg); toAll(overlays, msg);
  toAll(consoles, statusMsg());
  console.log(`REC ${rec.session}: stopped, files in ${rec.dir}`);
  // late chunks (the last one comes after stop) are still accepted until the next session
  const obsDone = !r.obs?.driven ? Promise.resolve() : new Promise((done) => {
    // a short tail, so the last word is in the video too; then OBS stops and tells where the file is
    setTimeout(async () => {
      let path = null;
      if (obs.state === "connected") {
        const stopped = obsWait("OBS_WEBSOCKET_OUTPUT_STOPPED", 8000);
        const res = await obsRequest("StopRecord", null, 8000);
        path = res.data?.outputPath || (await stopped)?.outputPath || obs.lastPath;
        obsNote(res.ok ? `recording stopped: ${path ?? "file unknown"}` : `StopRecord failed (${res.comment}): stop OBS by hand`);
      } else obsNote("not connected at Stop: stop OBS by hand");
      r.obs.outputPath = path ?? null;
      r.obs.stoppedAt = Date.now();
      if (rec === r) saveTimeline(true);
      done();
    }, OBS_TAIL_MS);
  });
  // the helper mixes once OBS has stopped and the phones' last chunks are in
  Promise.all([obsDone, uploadsSettled(r)]).then(() => { if (r.mix?.state === "waiting") { r.mix = { state: "pending" }; if (rec === r) toAll(consoles, statusMsg()); } });
}

const SETTLE_MS = Number(process.env.UPLOAD_SETTLE_MS ?? 2500);
/** After Stop: every take has sent a chunk since Stop (its last one), or 10 s have passed. */
function uploadsSettled(r) {
  return new Promise((done) => {
    const check = () => {
      const age = Date.now() - r.stoppedAt;
      // the newest take of each speaker (an older one ended at a gap and gets nothing more)
      const newest = new Map();
      for (const t of r.takes.values()) if (!newest.has(t.part) || (t.firstChunkAt ?? 0) > (newest.get(t.part).firstChunkAt ?? 0)) newest.set(t.part, t);
      const allIn = [...newest.values()].every((t) => (t.lastChunkAt ?? 0) >= r.stoppedAt - 300);
      if ((age >= SETTLE_MS && allIn) || age >= SETTLE_MS * 4) { done(); return; }
      setTimeout(check, 250);
    };
    check();
  });
}

/** POST /api/rec: npm run stop ends a running take cleanly. */
async function apiRec(res, action) {
  if (action === "start") recStart(); else if (action === "stop") recStop();
  sendJson(res, 200, { ok: true, rec: recMsg() });
}

/* ------------------------------------------------------------------ host helper (auto-mix) */

// remote/start.py runs a small helper on the laptop (in Docker mode too): it polls /api/helper,
// mixes a stopped take with ffmpeg and posts its progress, which the control page shows.
let helperSeenAt = 0;
const helperJobs = [];
const helperOnline = () => Date.now() - helperSeenAt < 5000;
function helperGet(res) {
  helperSeenAt = Date.now();
  const jobs = helperJobs.splice(0);
  sendJson(res, 200, { session: rec?.session ?? null, state: recMsg().state, mix: rec?.mix ?? null, jobs });
}
async function helperPost(req, res) {
  let body;
  try { body = JSON.parse(String(await readBody(req, 64 * 1024))); } catch { sendJson(res, 400, { error: "json" }); return; }
  helperSeenAt = Date.now();
  if (rec && body.session === rec.session && body.mix && typeof body.mix === "object") {
    const m = body.mix;
    const clean = { state: ["mixing", "done", "error", "waiting"].includes(m.state) ? m.state : "error" };
    for (const k of ["note", "path", "voices", "folder", "error", "video"]) if (m[k] != null) clean[k] = String(m[k]).slice(0, 600);
    rec.mix = clean;
    toAll(consoles, statusMsg());
  }
  sendJson(res, 200, { ok: true });
}

const recMsg = () => !rec ? { type: "rec", state: "idle" }
  : { type: "rec", state: rec.stoppedAt ? "stopped" : rec.beepAt ? "recording" : "countdown", session: rec.session, at: rec.startedAt, beepAt: rec.beepAt, stoppedAt: rec.stoppedAt, countdownMs: COUNTDOWN_MS };

function sceneEvent(st) {
  const s = SCENES[st.index];
  return { type: "scene", index: st.index, step: st.step, id: s?.id, title: s?.title, part: s?.part };
}

const EXT = { webm: "webm", mp4: "m4a", m4a: "m4a", ogg: "ogg", wav: "wav" };
async function upload(req, res, q) {
  const part = Number(q.get("part")), seq = Number(q.get("seq")), take = q.get("take") ?? "";
  if (!rec || q.get("session") !== rec.session) { sendJson(res, 410, { error: "no such session" }); req.resume(); return; }
  if (!(Number.isInteger(part) && part >= 1) || !Number.isInteger(seq) || seq < 0 || !/^[a-z0-9]{4,24}$/i.test(take)) {
    sendJson(res, 400, { error: "bad chunk" }); req.resume(); return;
  }
  const id = `${part}:${take}`;
  let t = rec.takes.get(id);
  if (!t) {
    const name = SPEAKERS.find((s) => s.part === part)?.name ?? `part${part}`;
    const n = [...rec.takes.values()].filter((x) => x.part === part).length + 1;
    const ext = EXT[(q.get("ext") ?? "webm").toLowerCase()] ?? "webm";
    const t0 = Number(q.get("t0")), off = Number(q.get("off")), rtt = Number(q.get("rtt"));
    t = {
      part, name, take, file: `${slug(name)}${n > 1 ? "-" + n : ""}.${ext}`, mime: q.get("mime") ?? "",
      // when the phone's MediaRecorder started, in server time (phone clock + measured offset)
      startedAt: Number.isFinite(t0) && Number.isFinite(off) ? Math.round(t0 + off) : null,
      phoneStartedAt: Number.isFinite(t0) ? t0 : null,
      clockOffsetMs: Number.isFinite(off) ? Math.round(off) : null, rttMs: Number.isFinite(rtt) ? Math.round(rtt) : null,
      firstChunkAt: null, lastChunkAt: null, chunks: 0, bytes: 0, nextSeq: 0,
    };
    rec.takes.set(id, t);
  }
  if (seq < t.nextSeq) { req.resume(); sendJson(res, 200, { ok: true, dup: true, next: t.nextSeq }); return; }
  if (seq > t.nextSeq) { req.resume(); sendJson(res, 409, { error: "out of order", next: t.nextSeq }); return; }
  let body;
  try { body = await readBody(req, MAX_CHUNK_BYTES); } catch { sendJson(res, 413, { error: "chunk too big" }); return; }
  appendFileSync(join(rec.dir, t.file), body);
  const now = Date.now();
  if (t.firstChunkAt == null) t.firstChunkAt = now;
  t.lastChunkAt = now; t.chunks++; t.bytes += body.length; t.nextSeq++;
  saveTimeline();
  sendJson(res, 200, { ok: true, next: t.nextSeq, bytes: t.bytes });
}

/* ------------------------------------------------------------------ relay */

const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MSG_BYTES });
let lastState = null;
let lastCmdAt = 0;
const decks = new Set();
const remotes = new Set();
const leads = new Set();
const consoles = new Set();  // the lead's pre-flight page
const overlays = new Set();  // the sync-beep script inside the OBS and lead decks

function send(ws, msg) {
  if (ws.readyState !== 1) return;
  try { ws.send(typeof msg === "string" ? msg : JSON.stringify(msg)); } catch { /* the heartbeat drops it */ }
}
function toAll(set, msg, except) { const s = JSON.stringify(msg); for (const ws of set) if (ws !== except) send(ws, s); }
const scenesMsg = () => ({ type: "scenes", scenes: SCENES, speakers: SPEAKERS });
const maxPart = () => Math.max(SPEAKERS.length, ...SPEAKERS.map((s) => s.part), ...SCENES.map((s) => s.part), 1);

/** What the pre-flight page shows, once a second. */
function statusMsg() {
  const now = Date.now();
  const phones = [...remotes].map((ws) => ws.info).filter((i) => i && i.part >= 1);
  const speakers = SPEAKERS.map((s) => {
    const mine = phones.filter((i) => i.part === s.part);
    const i = mine.sort((a, b) => (b.seenAt ?? 0) - (a.seenAt ?? 0))[0];
    const takes = rec ? [...rec.takes.values()].filter((t) => t.part === s.part) : [];
    const last = takes.reduce((m, t) => Math.max(m, t.lastChunkAt ?? 0), 0);
    return {
      part: s.part, name: s.name, phones: mine.length, connected: !!i,
      battery: i?.battery ?? null, charging: i?.charging ?? null, mic: i?.mic ?? "unknown", micOn: !!i?.micOn,
      headphones: !!i?.headphones, recording: !!i?.recording, hidden: !!i?.hidden, queue: i?.queue ?? 0,
      rttMs: i?.rtt ?? null, clockOffsetMs: i?.offset ?? null, mime: i?.mime ?? null,
      takes: takes.length, bytes: takes.reduce((n, t) => n + t.bytes, 0), lastChunkAgeMs: last ? now - last : null,
    };
  });
  const overlayKinds = [...overlays].map((o) => o.kind);
  return {
    type: "status", now,
    lead: { keySet: LEAD !== "", decks: leads.size, hidden: [...overlays].some((o) => o.kind === "lead") && [...overlays].filter((o) => o.kind === "lead").every((o) => o.hidden) },
    consoles: consoles.size,
    decks: { total: decks.size, followers: decks.size - leads.size, obs: overlayKinds.filter((k) => k === "obs").length },
    scenes: { count: SCENES.length, source: SCENE_SOURCE, orphans: SCENES.filter((s) => s.part === 0 && !s.appendix).map((s) => s.id) },
    state: lastState?.state ?? null,
    speakers, rec: recMsg(), media: mediaFiles(),
    obs: obsStatus(), starting, mix: rec?.mix ?? null, helper: { online: helperOnline() },
    recDir: rec?.dir ?? null,
  };
}

server.on("upgrade", (req, socket, head) => {
  let url;
  try { url = new URL(req.url, "http://x"); } catch { socket.destroy(); return; }
  const q = url.searchParams;
  const leadOk = LEAD !== "" && q.get("lead") === LEAD;
  const asked = q.get("role");
  const role = asked === "deck" ? "deck" : asked === "console" ? "console" : asked === "overlay" ? "overlay" : "remote";
  if (url.pathname !== "/ws" || q.get("k") !== KEY || (role === "console" && !leadOk)) {
    socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.isAlive = true;
    ws.on("pong", () => { ws.isAlive = true; });
    ws.on("error", () => {});
    const isLead = role === "deck" && leadOk;
    ({ deck: decks, remote: remotes, console: consoles, overlay: overlays })[role].add(ws);
    if (isLead) leads.add(ws);

    if (role === "deck") {
      send(ws, { type: "role", lead: isLead });
      // a deck that joins late goes straight to the slide of the lead
      if (!isLead && leads.size && lastState) send(ws, { type: "sync", state: lastState.state });
      toAll(remotes, { type: "deck", online: true });
    } else if (role === "remote") {
      ws.info = { part: 0, seenAt: Date.now() };
      send(ws, { type: "deck", online: decks.size > 0 });
      send(ws, scenesMsg());
      send(ws, recMsg());
      if (lastState) send(ws, lastState);
    } else if (role === "overlay") {
      ws.kind = q.get("kind") === "lead" && leadOk ? "lead" : "obs";
      send(ws, recMsg());
    } else {
      send(ws, statusMsg());
    }

    ws.on("message", (data) => {
      ws.isAlive = true;
      let m;
      try { m = JSON.parse(String(data)); } catch { return; }
      if (!m || typeof m !== "object") return;

      // clock: phones measure their offset to the server clock NTP-style (server = phone + offset)
      if (m.type === "ping") { send(ws, { type: "pong", t: m.t, server: Date.now() }); return; }

      if (role === "deck" && m.type === "state" && m.state && typeof m.state === "object") {
        // with a lead deck open, only its state counts; the other decks follow it
        if (leads.size && !leads.has(ws)) return;
        const prev = lastState?.state;
        lastState = { type: "state", state: m.state };
        toAll(remotes, lastState);
        if (leads.has(ws)) for (const d of decks) if (!leads.has(d)) send(d, { type: "sync", state: m.state });
        if (recActive() && (!prev || prev.index !== m.state.index || prev.step !== m.state.step)) recEvent(sceneEvent(m.state));
      } else if (role === "deck" && m.type === "scenes" && Array.isArray(m.scenes)) {
        // optional manifest: the deck describes its own scenes (exact); only remote/scenes.json wins over it
        if (leads.size && !leads.has(ws)) return;
        if (SCENE_SOURCE === "remote/scenes.json") return;
        if (SPEAKER_SOURCE === "scenes" || !SPEAKER_SOURCE) {
          const sp = cleanSpeakers(m.speakers);
          if (sp.length) { SPEAKERS = sp; SPEAKER_SOURCE = "deck"; }
        }
        const next = normalize(m.scenes);
        if (!next.length) return;
        const changed = JSON.stringify(next) !== JSON.stringify(SCENES);
        SCENES = next;
        SCENE_SOURCE = "deck";
        if (changed) { toAll(remotes, scenesMsg()); console.log(`Scenes from the deck: ${SCENES.length}`); }
      } else if (role === "deck" && m.type === "cmd" && leads.has(ws) && LEAD_CMDS.includes(m.cmd)) {
        toAll(decks, { type: "cmd", cmd: m.cmd, index: m.index, t: m.t }, ws);
      } else if ((role === "console" || (role === "deck" && leads.has(ws)) || (role === "overlay" && ws.kind === "lead")) && m.type === "rec") {
        // only the lead starts and stops the recording for everyone (console, lead deck, or Ctrl+R in the lead deck)
        if (m.action === "start") recStart();
        else if (m.action === "stop") recStop();
        else if (m.action === "toggle") { if (recActive()) recStop(); else recStart(); }
      } else if (role === "overlay" && ws.kind === "lead" && m.type === "vis") {
        ws.hidden = !!m.hidden;   // the lead deck's tab is in the background (the control page shows it)
      } else if (role === "console" && m.type === "open" && rec) {
        // "Open folder" on the control page: the helper on the laptop opens it
        helperJobs.push({ open: rec.session, what: m.what === "file" ? "file" : "folder" });
      } else if (role === "remote" && m.type === "level") {
        // the voice level from a speaker's phone microphone, so the deck can show who really speaks
        const part = Number(m.part), v = Number(m.v);
        if (!(Number.isInteger(part) && part >= 1 && part <= maxPart()) || !(v >= 0 && v <= 1)) return;
        const out = JSON.stringify({ type: "level", part, v: Math.round(v * 100) / 100 });
        for (const d of decks) send(d, out);
        for (const c of consoles) send(c, out);
      } else if (role === "remote" && m.type === "status") {
        // optional phone health for the pre-flight page
        const n = (x) => (Number.isFinite(Number(x)) ? Number(x) : null);
        const part = Number(m.part);
        ws.info = {
          part: Number.isInteger(part) && part >= 0 ? part : 0, seenAt: Date.now(),
          battery: n(m.battery), charging: typeof m.charging === "boolean" ? m.charging : null,
          mic: ["granted", "denied", "prompt", "unknown"].includes(m.mic) ? m.mic : "unknown",
          micOn: !!m.micOn, headphones: !!m.headphones, recording: !!m.recording, hidden: !!m.hidden,
          queue: n(m.queue) ?? 0, rtt: n(m.rtt), offset: n(m.offset), mime: typeof m.mime === "string" ? m.mime.slice(0, 60) : null,
        };
      } else if (role === "remote" && m.type === "rec-gap") {
        // the phone was in the background or locked: its recording may have a hole here
        if (!recActive()) return;
        const part = Number(m.part);
        if (!(part >= 1)) return;
        const off = Number(m.offset);
        const toServer = (x) => (Number.isFinite(Number(x)) ? Math.round(Number(x) + (Number.isFinite(off) ? off : 0)) : null);
        recEvent({ type: "gap", part, state: m.state === "visible" ? "visible" : "hidden", phoneAt: Number(m.at) || null, estAt: toServer(m.at), hiddenMs: Number(m.hiddenMs) || null, resumed: !!m.resumed });
        toAll(consoles, { type: "gap", part, state: m.state });
      } else if (role === "remote" && m.type === "cmd" && REMOTE_CMDS.includes(m.cmd)) {
        const part = Number(m.part);
        const index = lastState?.state?.index ?? -1;
        if (Number.isInteger(part) && part >= 0 && ws.info) { ws.info.part = part; ws.info.seenAt = Date.now(); }
        // Next and Back from the phones wait for the end of a playing video
        const md = lastState?.state?.media;
        if ((m.cmd === "next" || m.cmd === "prev") && md && !md.ended) return;
        if (m.cmd === "replay") {
          // the intro can be replayed by any speaker, only while the first scene is on screen
          if (index !== 0 || !(part >= 1)) return;
        } else if (m.cmd !== "hello") {
          // whose part is on screen decides who may move the deck: the server checks it, not only the phone
          if (!(part >= 1)) return;
          if (SCENES.length) {
            const onScreen = SCENES[index];
            if (!onScreen || onScreen.part !== part) return;
          }
          const now = Date.now();
          if (now - lastCmdAt < MIN_GAP_MS) return;
          lastCmdAt = now;
        }
        // with a lead open, the phones move only the lead, and the other decks follow its state
        toAll(leads.size && m.cmd !== "hello" ? leads : decks, { type: "cmd", cmd: m.cmd });
      }
    });

    ws.on("close", () => {
      decks.delete(ws); remotes.delete(ws); leads.delete(ws); consoles.delete(ws); overlays.delete(ws);
      if (role === "deck") toAll(remotes, { type: "deck", online: decks.size > 0 });
    });
  });
});

// drop sockets that stopped answering (a phone that went to sleep, a closed laptop lid)
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch { ws.terminate(); }
  }
}, HEARTBEAT_MS);
heartbeat.unref();
const statusTimer = setInterval(() => { if (consoles.size) toAll(consoles, statusMsg()); }, 1000);
statusTimer.unref();

/* ------------------------------------------------------------------ start */

server.on("error", (e) => {
  console.error(e.code === "EADDRINUSE" ? `Port ${PORT} is busy: another remote is running? (npm run stop)` : String(e));
  process.exit(1);
});
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { if (recActive()) recStop(); server.close(); process.exit(0); });

server.listen(PORT, HOST, () => {
  const parts = SPEAKERS.map((s) => `${s.part}=${s.name}`).join(", ") || "none";
  console.log(`Deck: ${DECK_DIR ? DECK_DIR.slice(root.length + 1) : "NOT BUILT"} · scenes: ${SCENES.length} (${SCENE_SOURCE}) · speakers: ${parts} (${SPEAKER_SOURCE || "none"})`);
  const orphans = SCENES.filter((s) => s.part === 0 && !s.appendix).map((s) => s.id);
  if (orphans.length) console.log(`Warning: no speaker part for ${orphans.join(", ")}: no phone can move these scenes (the lead deck still can).`);
  if (!SCENES.length) console.log("No scene notes yet: phones work as plain clickers until a deck sends its scenes (see NOTES.md).");
  console.log(`Remote listening on http://${HOST}:${PORT}  key ${KEY}${LEAD ? "  (lead key set)" : ""}`);
  if (obsConfig()) obsConnect();
});

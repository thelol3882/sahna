// Checks whether OBS answers on its WebSocket server with the given password (used by `npm run obs`).
//   node remote/obs-check.mjs <url> [password]
// Prints one JSON line: {"state":"connected"|"auth"|"wrong-password"|"not-found","version":"…","error":"…"}
import { createRequire } from "node:module";
import { createHash } from "node:crypto";

const require = createRequire(import.meta.url);
let WebSocket;
try { WebSocket = require("ws"); } catch {
  console.log(JSON.stringify({ state: "not-found", error: "the ws package is missing: run npm install" }));
  process.exit(0);
}
const [url = "ws://127.0.0.1:4455", password = ""] = process.argv.slice(2);
const sha = (s) => createHash("sha256").update(s).digest("base64");
const done = (r) => { console.log(JSON.stringify(r)); process.exit(0); };
setTimeout(() => done({ state: "not-found", error: "timeout" }), 5000);

let ws;
try { ws = new WebSocket(url, "obswebsocket.json", { handshakeTimeout: 3000 }); }
catch (e) { done({ state: "not-found", error: String(e.message ?? e) }); }
let version = "";
ws.on("error", (e) => done({ state: "not-found", error: String(e.code ?? e.message ?? e) }));
ws.on("close", (code) => done(code === 4009 ? { state: "wrong-password" } : { state: "not-found", error: `closed (${code})` }));
ws.on("message", (data) => {
  let m; try { m = JSON.parse(String(data)); } catch { return; }
  const d = m.d ?? {};
  if (m.op === 0) {
    version = d.obsWebSocketVersion ?? "";
    const ident = { rpcVersion: 1, eventSubscriptions: 0 };
    if (d.authentication) {
      if (!password) done({ state: "auth", version });
      ident.authentication = sha(sha(password + d.authentication.salt) + d.authentication.challenge);
    }
    ws.send(JSON.stringify({ op: 1, d: ident }));
  } else if (m.op === 2) {
    done({ state: "connected", version });
  }
});

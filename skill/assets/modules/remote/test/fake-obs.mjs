// A tiny fake of the obs-websocket v5 server built into OBS 28+, for the tests and the browser run.
//
//   import { startFakeObs } from "./fake-obs.mjs";
//   const obs = await startFakeObs({ password: "secret", outputPath: "/tmp/obs.mkv", onStop: (path) => makeVideo(path) });
//   obs.url  → ws://127.0.0.1:<port>      obs.requests → [{ requestType, requestData }]
//
// Speaks: Hello (with the SHA-256 challenge when a password is set), Identify → Identified (or close 4009),
// GetRecordStatus, StartRecord / StopRecord (RecordStateChanged events, outputPath), GetInputSettings,
// SetInputSettings. Options: failStart (StartRecord answers an error), inputs ({ name: settings }).
import { createRequire } from "node:module";
import { createHash, randomBytes } from "node:crypto";
import { join } from "node:path";

const require = createRequire(join(process.cwd(), "x.js"));
const { WebSocketServer } = require("ws");
const sha = (s) => createHash("sha256").update(s).digest("base64");

export function startFakeObs(opts = {}) {
  const password = opts.password ?? "";
  const inputs = opts.inputs ?? { "Deck (browser)": { url: "http://localhost:8787/?remote&obs&k=OLD" } };
  const state = { recording: false, requests: [], clients: 0, outputPath: opts.outputPath ?? "/tmp/obs-fake.mkv" };
  const wss = new WebSocketServer({ port: opts.port ?? 0, host: "127.0.0.1", handleProtocols: (p) => (p.has("obswebsocket.json") ? "obswebsocket.json" : false) });
  const event = (ws, eventType, eventData) => ws.send(JSON.stringify({ op: 5, d: { eventType, eventIntent: 64, eventData } }));
  const all = (type, data) => { for (const c of wss.clients) if (c.identified) event(c, type, data); };

  wss.on("connection", (ws) => {
    state.clients++;
    const salt = randomBytes(8).toString("base64"), challenge = randomBytes(8).toString("base64");
    ws.send(JSON.stringify({ op: 0, d: { obsWebSocketVersion: "5.5.0", rpcVersion: 1, ...(password ? { authentication: { challenge, salt } } : {}) } }));
    ws.on("message", async (data) => {
      const m = JSON.parse(String(data));
      if (m.op === 1) {
        if (password && m.d.authentication !== sha(sha(password + salt) + challenge)) { ws.close(4009, "Authentication failed."); return; }
        ws.identified = true;
        ws.send(JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } }));
        return;
      }
      if (m.op !== 6 || !ws.identified) return;
      const { requestType, requestId, requestData } = m.d;
      state.requests.push({ requestType, requestData });
      const reply = (ok, responseData, code = ok ? 100 : 500, comment) =>
        ws.send(JSON.stringify({ op: 7, d: { requestType, requestId, requestStatus: { result: ok, code, ...(comment ? { comment } : {}) }, ...(responseData ? { responseData } : {}) } }));
      if (requestType === "GetRecordStatus") reply(true, { outputActive: state.recording, outputPaused: false, outputDuration: 0, outputBytes: 0 });
      else if (requestType === "StartRecord") {
        if (opts.failStart) { reply(false, null, 500, "Disk full (fake)"); return; }
        if (state.recording) { reply(false, null, 500, "Output already running"); return; }
        reply(true);
        all("RecordStateChanged", { outputActive: false, outputState: "OBS_WEBSOCKET_OUTPUT_STARTING", outputPath: null });
        setTimeout(() => {
          state.recording = true; state.startedAt = Date.now();
          all("RecordStateChanged", { outputActive: true, outputState: "OBS_WEBSOCKET_OUTPUT_STARTED", outputPath: state.outputPath });
          opts.onStart?.(state.outputPath);
        }, opts.startDelayMs ?? 150);
      } else if (requestType === "StopRecord") {
        if (!state.recording) { reply(false, null, 501, "Output not running"); return; }
        state.recording = false; state.stoppedAt = Date.now();
        await opts.onStop?.(state.outputPath, state);
        reply(true, { outputPath: state.outputPath });
        all("RecordStateChanged", { outputActive: false, outputState: "OBS_WEBSOCKET_OUTPUT_STOPPED", outputPath: state.outputPath });
      } else if (requestType === "GetInputSettings") {
        const s = inputs[requestData?.inputName];
        if (!s) reply(false, null, 600, "No source was found by the name of " + requestData?.inputName);
        else reply(true, { inputKind: "browser_source", inputSettings: s });
      } else if (requestType === "SetInputSettings") {
        const s = inputs[requestData?.inputName];
        if (!s) { reply(false, null, 600, "No source"); return; }
        Object.assign(s, requestData.inputSettings);
        reply(true);
      } else reply(false, null, 204, "Unknown request type");
    });
  });

  return new Promise((ok) => wss.on("listening", () => ok({
    url: `ws://127.0.0.1:${wss.address().port}`,
    port: wss.address().port,
    state, inputs,
    get requests() { return state.requests.map((r) => r.requestType); },
    close: () => new Promise((done) => { for (const c of wss.clients) c.terminate(); wss.close(() => done()); }),
  })));
}

// run standalone for a manual try: node remote/test/fake-obs.mjs [port] [password] [outputPath]
if (import.meta.url === `file://${process.argv[1]}`) {
  const [port, password, outputPath] = process.argv.slice(2);
  startFakeObs({ port: Number(port || 4455), password: password || "", outputPath }).then((o) => console.log(`fake OBS on ${o.url}`));
}

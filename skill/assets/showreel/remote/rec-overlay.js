// Injected by server.mjs into the OBS deck (?remote&obs) and the lead deck (?remote&lead=…).
// When the lead starts a recording, it plays the sync "clap": a short 1 kHz beep and a white flash
// of a few frames. OBS records both, and mix.py finds the beep to line the phone tracks up with the video.
// The lead deck also shows a small REC badge; the OBS deck never does (it would be in the video).
// In the lead deck, Ctrl+R (Cmd+R on a Mac) starts the recording for everyone; stopping needs it twice.
(() => {
  const q = new URLSearchParams(location.search);
  const k = q.get("k") || "";
  const lead = q.get("lead");
  const kind = lead ? "lead" : "obs";
  // The lead deck in a background tab (the lead looks at the control page): Chrome stops requestAnimationFrame
  // there, so GSAP stops, slide entrances never finish and the phones' Next gets stuck. While this tab is
  // hidden, animation frames come from a worker's timer instead (~30 per second; workers are not throttled).
  // When the tab is visible nothing changes: the browser's own requestAnimationFrame runs.
  if (kind === "lead" && window.Worker && window.requestAnimationFrame) {
    try {
      const nativeRaf = window.requestAnimationFrame.bind(window), nativeCancel = window.cancelAnimationFrame.bind(window);
      const worker = new Worker(URL.createObjectURL(new Blob(["setInterval(() => postMessage(0), 33)"], { type: "text/javascript" })));
      const waiting = new Map();
      let seq = 0;
      worker.onmessage = () => {
        if (!waiting.size) return;
        const now = performance.now(), cbs = [...waiting.values()];
        waiting.clear();
        for (const cb of cbs) { try { cb(now); } catch (e) { setTimeout(() => { throw e; }); } }
      };
      window.requestAnimationFrame = (cb) => {
        if (!document.hidden) return nativeRaf(cb);
        const id = -(++seq);
        waiting.set(id, cb);
        return id;
      };
      window.cancelAnimationFrame = (id) => { if (id < 0) waiting.delete(id); else nativeCancel(id); };
      window.__deckBackgroundFrames = true;
    } catch { /* keep the browser's own */ }
  }

  let ctx = null;
  const audio = () => {
    try { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === "suspended") ctx.resume(); } catch {}
    return ctx;
  };
  // browsers allow sound only after a key or a click; OBS allows it at once
  addEventListener("keydown", audio, true);
  addEventListener("pointerdown", audio, true);
  audio();

  const flash = document.createElement("div");
  flash.style.cssText = "position:fixed;inset:0;background:#fff;opacity:0;pointer-events:none;z-index:2147483647";
  const badge = document.createElement("div");
  badge.style.cssText = "position:fixed;top:12px;left:12px;z-index:2147483647;display:none;padding:6px 12px;border-radius:999px;background:#d32f2f;color:#fff;font:700 14px system-ui,sans-serif;letter-spacing:.05em;pointer-events:none";
  const mount = () => { document.body.append(flash); if (kind === "lead") document.body.append(badge); };
  if (document.body) mount(); else addEventListener("DOMContentLoaded", mount);

  function beep() {
    const c = audio();
    if (c) {
      const o = c.createOscillator(), g = c.createGain(), t = c.currentTime + 0.02;
      o.frequency.value = 1000;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.6, t + 0.005);
      g.gain.setValueAtTime(0.6, t + 0.195);
      g.gain.linearRampToValueAtTime(0, t + 0.2);
      o.connect(g).connect(c.destination);
      o.start(t); o.stop(t + 0.22);
    }
    flash.style.transition = "none"; flash.style.opacity = "1";
    requestAnimationFrame(() => requestAnimationFrame(() => {
      setTimeout(() => { flash.style.transition = "opacity .25s"; flash.style.opacity = "0"; }, 80);
    }));
  }

  let timer = null, recState = "idle", sock = null, armedStop = 0, hintTimer = null;
  function hint(text, ms) {
    clearInterval(timer); clearTimeout(hintTimer);
    badge.style.display = "block"; badge.textContent = text;
    hintTimer = setTimeout(() => show({ state: recState }), ms);
  }
  if (kind === "lead") addEventListener("keydown", (e) => {
    if (!((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === "r" || e.key === "R"))) return;
    e.preventDefault(); e.stopPropagation();   // not a reload: the lead deck must stay open during the take
    if (!sock || sock.readyState !== 1) { hint("Not connected to the remote", 2500); return; }
    const on = recState === "countdown" || recState === "recording";
    if (!on) { sock.send(JSON.stringify({ type: "rec", action: "start" })); hint("Starting the recording…", 12000); return; }
    if (Date.now() - armedStop < 2500) { armedStop = 0; sock.send(JSON.stringify({ type: "rec", action: "stop" })); return; }
    armedStop = Date.now(); hint("Ctrl+R again to stop", 2500);
  }, true);
  function show(m) {
    clearInterval(timer); clearTimeout(hintTimer);
    recState = m.state || "idle";
    if (m.state === "countdown") { badge.style.display = "block"; badge.textContent = "REC in 3"; }
    else if (m.state === "recording") {
      badge.style.display = "block";
      const t0 = Date.now();
      const tick = () => { const s = Math.floor((Date.now() - t0) / 1000); badge.textContent = `● REC ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
      tick(); timer = setInterval(tick, 1000);
    } else badge.style.display = "none";
  }

  function connect() {
    const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws?role=overlay&kind=${kind}&k=${encodeURIComponent(k)}${lead ? "&lead=" + encodeURIComponent(lead) : ""}`;
    const s = new WebSocket(url);
    sock = s;
    s.onopen = () => { if (kind === "lead") s.send(JSON.stringify({ type: "vis", hidden: document.hidden })); };
    s.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.type === "rec-error" && kind === "lead") { hint("OBS did not start: see the control page", 5000); return; }
      if (m.type !== "rec") return;
      if (m.beep) beep();
      show(m);
    };
    s.onclose = () => setTimeout(connect, 1500);
  }
  if (kind === "lead") document.addEventListener("visibilitychange", () => {
    if (sock && sock.readyState === 1) sock.send(JSON.stringify({ type: "vis", hidden: document.hidden }));
  });
  connect();
})();

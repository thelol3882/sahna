import type { Msg } from "./types";

/**
 * Deck side of the phone remote (server: remote/server.mjs). Off unless the link has ?remote:
 * without it nothing connects and the deck works with zero server.
 *
 *   /?remote&k=<key>[&lead=<lead key>]#<scene>
 *
 * Protocol (unchanged from the reference server):
 *   deck → server  {type:"state", state}            every index/step/media change
 *                  {type:"cmd", cmd, index?, t?}     lead deck only: mirrored to every other deck
 *   server → deck  {type:"role", lead}               on connect
 *                  {type:"sync", state}              follower: the lead's state (also for late joiners)
 *                  {type:"cmd", cmd, index?, t?}     from the lead deck or a phone
 *                  {type:"level", part, v}           voice level 0..1 of a speaker's phone mic
 */
const params = () => new URLSearchParams(typeof location === "undefined" ? "" : location.search);

/** ?remote in the link (served over http by the remote server). */
export const REMOTE = params().has("remote");
/** Speaker chip: only in recording links (?remote) or with ?names. */
export const SHOW_NAMES = REMOTE || params().has("names");

/** Voice levels from the speakers' phones: part → level 0..1 and when it came. */
export const voice: Record<number, { v: number; at: number }> = {};

export type RemoteLink = { send: (m: Msg) => void; close: () => void };

/** Scene list for the remote server (exact notes and speakers per step for the phones, no source parsing). */
let manifest: (() => object) | null = null;
export function setRemoteManifest(fn: () => object) { manifest = fn; }

/** Opens the WebSocket with reconnect. Returns null when the deck is not in remote mode. */
export function connectRemote(onMsg: (m: Msg) => void): RemoteLink | null {
  if (!REMOTE || location.protocol === "file:") return null;
  const p = params();
  const lead = p.get("lead");
  const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws?role=deck&k=${encodeURIComponent(p.get("k") ?? "")}${lead ? `&lead=${encodeURIComponent(lead)}` : ""}`;
  let sock: WebSocket | null = null;
  let closed = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const open = () => {
    const s = new WebSocket(url);
    sock = s;
    s.onmessage = (e) => {
      let m: Msg;
      try { m = JSON.parse(String(e.data)) as Msg; } catch { return; }
      if (m.type === "level") voice[m.part] = { v: m.v, at: Date.now() };
      onMsg(m);
    };
    // let the deck send its state right away (the server keeps it for phones and late decks)
    s.onopen = () => {
      if (manifest) s.send(JSON.stringify({ type: "scenes", ...manifest() }));
      onMsg({ type: "cmd", cmd: "hello" });
    };
    s.onclose = () => { sock = null; if (!closed) retry = setTimeout(open, 1500); };
  };
  open();
  return {
    send: (m) => {
      // the server only understands state and remote cmds
      if (m.type !== "state" && !(m.type === "cmd" && m.cmd !== "return")) return;
      if (sock?.readyState === WebSocket.OPEN) sock.send(JSON.stringify(m));
    },
    close: () => { closed = true; clearTimeout(retry); sock?.close(); },
  };
}

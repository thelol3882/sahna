import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Msg } from "./types";
import { connectRemote, type RemoteLink } from "./remote-client";

/** Deck ↔ presenter window: BroadcastChannel, plus localStorage events as a fallback (deduplicated by id). */
const CHANNEL = "animated-web-deck";
let seq = 0;
const me = Math.random().toString(36).slice(2, 8);

/** Who sent a message: another local window (deck or presenter) or the remote server. */
export type Source = "deck" | "presenter" | "remote";

export function useChannel(onMsg: (m: Msg, from: Source) => void, { remote = false, role = "deck" as "deck" | "presenter" } = {}) {
  const cb = useRef(onMsg);
  cb.current = onMsg;
  const seen = useRef(new Set<string>());
  const bc = useMemo(() => {
    try { return new BroadcastChannel(CHANNEL); } catch { return null; }
  }, []);
  const link = useRef<RemoteLink | null>(null);

  useEffect(() => {
    if (!remote) return;
    link.current = connectRemote((m) => cb.current(m, "remote"));
    return () => { link.current?.close(); link.current = null; };
  }, [remote]);

  useEffect(() => {
    const take = (raw: { id?: string; m?: Msg; from?: Source } | null) => {
      if (!raw?.m || !raw.id || seen.current.has(raw.id)) return;
      seen.current.add(raw.id);
      if (seen.current.size > 200) seen.current = new Set([...seen.current].slice(-100));
      cb.current(raw.m, raw.from === "presenter" ? "presenter" : "deck");
    };
    const onBc = (e: MessageEvent) => take(e.data);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== CHANNEL || !e.newValue) return;
      try { take(JSON.parse(e.newValue)); } catch { /* not ours */ }
    };
    bc?.addEventListener("message", onBc);
    window.addEventListener("storage", onStorage);
    return () => { bc?.removeEventListener("message", onBc); window.removeEventListener("storage", onStorage); };
  }, [bc]);

  return useCallback((m: Msg) => {
    const env = { id: `${me}-${++seq}`, m, from: role };
    bc?.postMessage(env);
    try { localStorage.setItem(CHANNEL, JSON.stringify(env)); } catch { /* storage blocked: the channel is enough */ }
    link.current?.send(m);
  }, [bc, role]);
}

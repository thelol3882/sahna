import { useEffect, useState } from "react";
import { scenes } from "../scenes";
import { DECK } from "./config";
import { useChannel } from "./channel";
import type { DeckState } from "./types";
import { APPX, MAIN, slideNo, fmt, nameOf } from "./util";
import { letter } from "./keys";
import { REHEARSE, RehearsalReport, RehearsalStrip, useRehearsal } from "./rehearse";

/**
 * #presenter (second window, P on the deck): timers, the note for the current step, what comes next,
 * a ready/running chip, media state and the backup slides. Its keys drive the deck (local channel only).
 */
export function PresenterView() {
  const [st, setSt] = useState<DeckState>({ index: MAIN[0], step: 0, startedAt: null, speakerStartedAt: null });
  const [waiting, setWaiting] = useState(false);
  const [now, setNow] = useState(Date.now());
  const rec = useRehearsal();
  const [report, setReport] = useState(false);
  const send = useChannel((m) => {
    if (m.type === "state") { setSt(m.state); if (REHEARSE) rec.onState(m.state); }
    if (m.type === "wait") { setWaiting(m.waiting); if (REHEARSE) rec.onWait(m.index, m.step, m.waiting); }
  }, { role: "presenter" });
  useEffect(() => { document.title = `Presenter · ${DECK.title}`; send({ type: "cmd", cmd: "hello" }); }, [send]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (["ArrowRight", "PageDown", " "].includes(e.key)) { e.preventDefault(); send({ type: "cmd", cmd: "next" }); }
      else if (["ArrowLeft", "PageUp"].includes(e.key)) { e.preventDefault(); send({ type: "cmd", cmd: "prev" }); }
      else if (e.key === "Escape") send({ type: "cmd", cmd: "return" });
      else if (letter(e) === "k") send({ type: "cmd", cmd: "media-toggle" });
      else if (REHEARSE && letter(e) === "s") { if (rec.live) rec.stop(); else rec.start(); }
      else if (REHEARSE && letter(e) === "v") setReport((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [send, rec]);

  const cur = scenes[st.index] ?? scenes[0];
  const steps = st.steps ?? cur.steps;
  const m = MAIN.indexOf(st.index);
  const nextScene = m >= 0 ? scenes[MAIN[m + 1]] : undefined;
  const nextNote = st.step < steps ? cur.notes[st.step + 1] : nextScene?.notes[0];
  const total = st.startedAt ? now - st.startedAt : 0;
  const over = total > DECK.budget * 1000;
  const chip = st.returnTo
    ? { text: `in backup — Esc returns to ${slideNo(st.returnTo.index)}`, bg: "#5A3A0E" }
    : waiting ? { text: "ready — press →", bg: "#1E6B42" } : { text: "animation running", bg: "#3A3F4C" };
  const muted = "#9BA3B8";
  return (
    <div style={{ position: "fixed", inset: 0, overflow: "auto", background: "#10131A", color: "#F1F1EE", fontFamily: "var(--font-sans)", padding: 32, display: "grid", gridTemplateColumns: "1fr 340px", gap: 32 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 22, minWidth: 0 }}>
        {REHEARSE && <RehearsalStrip rec={rec} st={st} onReport={() => setReport((v) => !v)} />}
        {REHEARSE && report ? <RehearsalReport rec={rec} onClose={() => setReport(false)} /> : <>
        <div style={{ display: "flex", gap: 28, alignItems: "baseline", fontFamily: "var(--font-mono)" }}>
          <span style={{ fontSize: 56 }} className="tnum">{fmt(total)}</span>
          <span style={{ fontSize: 20, color: over ? "#FF6B76" : muted }}>target {fmt(DECK.budget * 1000)}</span>
          {cur.speaker && (
            <span style={{ fontSize: 26, marginLeft: "auto" }} className="tnum">
              {nameOf(cur.speaker)} · {st.speakerStartedAt ? fmt(now - st.speakerStartedAt) : "0:00"}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 16, alignItems: "center", fontFamily: "var(--font-mono)", fontSize: 20, color: muted, flexWrap: "wrap" }}>
          <span data-status style={{ background: chip.bg, color: "#fff", borderRadius: 999, padding: "6px 16px" }}>{chip.text}</span>
          <span>{slideNo(st.index)} · {cur.title} · {steps ? `step ${st.step} of ${steps}` : "no steps"}</span>
        </div>
        {st.media && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, color: "#F5AE58" }}>
            {st.media.ended ? "■ ended" : st.media.playing ? "▶ playing" : "❚❚ paused"} · {fmt(st.media.t * 1000)} / {fmt(st.media.dur * 1000)} · {st.media.chapter} · K pause
          </div>
        )}
        <p style={{ fontSize: 32, lineHeight: 1.5, margin: 0, maxWidth: 1100 }}>{cur.notes[st.step] ?? ""}</p>
        {nextNote && (
          <div style={{ fontSize: 22, lineHeight: 1.5, color: muted, maxWidth: 1100 }}>
            <b style={{ color: "#C3C6CE" }}>{st.step < steps ? "Next step →" : `Next scene → ${nextScene?.title}:`}</b> {nextNote}
          </div>
        )}
        <div style={{ fontSize: 17, color: muted, marginTop: "auto" }}>Here: ← → PageUp PageDown move the deck · Esc leaves a backup slide · K media pause{REHEARSE ? " · S start/stop a rehearsal run · V report" : ""}.</div>
        </>}
      </div>
      <aside style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 18 }}>
        <span style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.12em", color: muted }}>BACKUP SLIDES ({APPX.length})</span>
        {APPX.map((i) => (
          <button key={i} onClick={() => send({ type: "cmd", cmd: "jump", index: i })}
            style={{ textAlign: "left", background: i === st.index ? "#2A3140" : "#181C25", color: "#F1F1EE", border: "1px solid #2A2E38", borderRadius: 12, padding: "10px 14px", cursor: "pointer", font: "inherit" }}>
            <span style={{ fontFamily: "var(--font-mono)", color: muted, marginRight: 10 }}>{slideNo(i)}</span>{scenes[i].title}
            {scenes[i].tags && <div style={{ fontSize: 14, color: muted, marginTop: 4 }}>{scenes[i].tags!.join(" · ")}</div>}
          </button>
        ))}
        {APPX.length === 0 && <span style={{ color: muted }}>none</span>}
      </aside>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { scenes } from "../scenes";
import { DECK } from "./config";
import type { DeckState } from "./types";
import { MAIN, fmt, nameOf } from "./util";

/**
 * Rehearsal mode (presenter window only, `?rehearse`): records how long every scene and step really takes,
 * compares it with each scene's `seconds` target, and keeps the runs in localStorage. Nothing of it ever reaches
 * the audience screen. S starts/stops a run, V toggles the report, the report exports JSON for
 * scripts/rehearsal_report.py.
 */

export const REHEARSE = typeof location !== "undefined" && new URLSearchParams(location.search).has("rehearse");
const KEY = `awd-rehearsals:${DECK.title}`;
const MAX_RUNS = 20;

/** One visit of one step: from the moment the deck reached it until it left. */
export type Seg = { i: number; id: string; step: number; t0: number; ready: number | null; t1: number | null };
export type Run = { id: string; started: number; ended: number | null; segs: Seg[] };
export type Export = {
  deck: string; budget: number; exported: string;
  scenes: { id: string; title: string; seconds: number | null; speaker: string | null; steps: number; appendix: boolean }[];
  speakers: { id: string; name: string }[];
  runs: Run[];
};

const load = (): Run[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; } };
const save = (runs: Run[]) => { try { localStorage.setItem(KEY, JSON.stringify(runs.slice(-MAX_RUNS))); } catch { /* storage full or blocked */ } };

export function exportData(runs: Run[]): Export {
  return {
    deck: DECK.title, budget: DECK.budget, exported: new Date().toISOString(),
    scenes: scenes.map((s) => ({ id: s.id, title: s.title, seconds: s.seconds ?? null, speaker: s.speaker ?? null, steps: s.steps, appendix: !!s.appendix })),
    speakers: DECK.speakers, runs,
  };
}

/* ------------------------------------------------------------------ summary (same maths as rehearsal_report.py) */

export type SceneSum = { i: number; id: string; title: string; speaker?: string; target: number | null; actual: number; steps: number[]; anim: number; appendix: boolean };

export function summarize(run: Run, now = Date.now()) {
  const by = new Map<string, SceneSum>();
  for (const g of run.segs) {
    const s = scenes[g.i];
    if (!s) continue;
    const dur = ((g.t1 ?? run.ended ?? now) - g.t0) / 1000;
    let e = by.get(s.id);
    if (!e) { e = { i: g.i, id: s.id, title: s.title, speaker: s.speaker, target: s.seconds ?? null, actual: 0, steps: [], anim: 0, appendix: !!s.appendix }; by.set(s.id, e); }
    e.actual += dur;
    e.steps[g.step] = (e.steps[g.step] ?? 0) + dur;
    if (g.ready !== null) e.anim += Math.min(g.ready, dur * 1000) / 1000;
  }
  const rows = [...by.values()].sort((a, b) => (a.appendix === b.appendix ? MAIN.indexOf(a.i) - MAIN.indexOf(b.i) : a.appendix ? 1 : -1));
  const speakers = new Map<string, { actual: number; target: number }>();
  for (const r of rows) {
    if (r.appendix) continue;
    const k = r.speaker ?? "—";
    const v = speakers.get(k) ?? { actual: 0, target: 0 };
    v.actual += r.actual; v.target += r.target ?? 0;
    speakers.set(k, v);
  }
  const total = ((run.ended ?? now) - run.started) / 1000;
  const backup = rows.filter((r) => r.appendix).reduce((a, r) => a + r.actual, 0);
  const presses = run.segs.filter((g) => !scenes[g.i]?.appendix).length;
  return { rows, speakers, total, backup, presses, perStep: presses ? (total - backup) / presses : 0 };
}

/* ------------------------------------------------------------------ the recorder */

export function useRehearsal() {
  const [runs, setRuns] = useState<Run[]>(load);
  const [live, setLive] = useState<Run | null>(null);
  const liveRef = useRef<Run | null>(null);
  const last = useRef<DeckState | null>(null);

  const commit = (r: Run | null, all?: Run[]) => {
    liveRef.current = r;
    setLive(r ? { ...r, segs: [...r.segs] } : null);
    if (all) { setRuns(all); save(all); }
    else if (r) { const rest = load().filter((x) => x.id !== r.id); save([...rest, r]); } // in-progress runs survive a closed window
  };

  const onState = useCallback((st: DeckState) => {
    last.current = st;
    const r = liveRef.current;
    if (!r) return;
    const cur = r.segs[r.segs.length - 1];
    if (cur && cur.i === st.index && cur.step === st.step) return; // media/timer updates: same place
    const now = Date.now();
    if (cur && cur.t1 === null) cur.t1 = now;
    r.segs.push({ i: st.index, id: scenes[st.index]?.id ?? "?", step: st.step, t0: now, ready: null, t1: null });
    commit(r);
  }, []);

  const onWait = useCallback((index: number, step: number, waiting: boolean) => {
    const r = liveRef.current;
    const cur = r?.segs[r.segs.length - 1];
    if (!r || !cur || !waiting || cur.ready !== null || cur.i !== index || cur.step !== step) return;
    cur.ready = Date.now() - cur.t0;
    commit(r);
  }, []);

  const start = useCallback(() => {
    const now = Date.now();
    const st = last.current;
    const r: Run = { id: new Date(now).toISOString(), started: now, ended: null, segs: [] };
    if (st) r.segs.push({ i: st.index, id: scenes[st.index]?.id ?? "?", step: st.step, t0: now, ready: null, t1: null });
    commit(r);
  }, []);

  const stop = useCallback(() => {
    const r = liveRef.current;
    if (!r) return;
    const now = Date.now();
    const cur = r.segs[r.segs.length - 1];
    if (cur && cur.t1 === null) cur.t1 = now;
    r.ended = now;
    commit(null, [...load().filter((x) => x.id !== r.id), r].slice(-MAX_RUNS));
  }, []);

  const clear = useCallback(() => { commit(null, []); }, []);

  const download = useCallback(() => {
    const data = exportData(load());
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }));
    a.download = `rehearsal-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, []);

  useEffect(() => { const t = setInterval(() => liveRef.current && setLive({ ...liveRef.current }), 1000); return () => clearInterval(t); }, []);
  return { runs, live, onState, onWait, start, stop, clear, download };
}

/* ------------------------------------------------------------------ UI (presenter only) */

const MUTED = "#9BA3B8";
const sec = (s: number) => fmt(Math.max(0, s) * 1000);
const over = (a: number, t: number | null) => (t ? a > t * 1.15 ? "#FF6B76" : a > t ? "#F5AE58" : "#4CC384" : "#C3C6CE");

/** The thin strip at the top of the presenter: run clock, this scene vs its target, this step. */
export function RehearsalStrip({ rec, st, onReport }: { rec: ReturnType<typeof useRehearsal>; st: DeckState; onReport: () => void }) {
  const r = rec.live;
  const now = Date.now();
  const cur = scenes[st.index];
  const segs = r?.segs.filter((g) => g.i === st.index) ?? [];
  const inScene = segs.reduce((a, g) => a + ((g.t1 ?? now) - g.t0), 0) / 1000;
  const lastSeg = r?.segs[r.segs.length - 1];
  const inStep = lastSeg ? (now - lastSeg.t0) / 1000 : 0;
  const btn = { background: "#232836", color: "#F1F1EE", border: "1px solid #343A4A", borderRadius: 999, padding: "6px 16px", font: "inherit", cursor: "pointer" } as const;
  return (
    <div data-rehearsal style={{ display: "flex", gap: 18, alignItems: "center", fontFamily: "var(--font-mono)", fontSize: 18, color: MUTED, padding: "10px 16px", border: "1px solid #2A2E38", borderRadius: 14, background: "#151922" }}>
      <span style={{ color: r ? "#FF6B76" : MUTED, letterSpacing: "0.12em" }}>{r ? "● REC" : "REHEARSAL"}</span>
      {r ? (
        <>
          <span className="tnum" style={{ color: "#F1F1EE" }}>{sec((now - r.started) / 1000)}</span>
          <span className="tnum">scene <b style={{ color: over(inScene, cur?.seconds ?? null) }}>{sec(inScene)}</b>{cur?.seconds ? ` / ${sec(cur.seconds)}` : ""}</span>
          <span className="tnum">step {st.step} · {sec(inStep)}</span>
        </>
      ) : <span>S starts a run on the current scene · {rec.runs.length} saved</span>}
      <span style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
        <button style={btn} onClick={() => (r ? rec.stop() : rec.start())}>{r ? "Stop (S)" : "Start (S)"}</button>
        <button style={btn} onClick={onReport}>Report (V)</button>
      </span>
    </div>
  );
}

/** Report: which scenes run long, per-speaker totals, pacing (seconds per step). */
export function RehearsalReport({ rec, onClose }: { rec: ReturnType<typeof useRehearsal>; onClose: () => void }) {
  const all = rec.live ? [...rec.runs.filter((x) => x.id !== rec.live!.id), rec.live] : rec.runs;
  const [pick, setPick] = useState<string | null>(null);
  const run = all.find((x) => x.id === pick) ?? all[all.length - 1];
  const prev = run ? all[all.indexOf(run) - 1] : undefined;
  const btn = { background: "#232836", color: "#F1F1EE", border: "1px solid #343A4A", borderRadius: 999, padding: "6px 16px", font: "inherit", cursor: "pointer" } as const;
  if (!run) return (
    <div data-rehearsal-report style={{ fontSize: 22, color: MUTED }}>No runs yet. Press S, present, press S again. <button style={btn} onClick={onClose}>Back (V)</button></div>
  );
  const s = summarize(run);
  const ps = prev ? summarize(prev) : null;
  const maxT = Math.max(...s.rows.map((r) => Math.max(r.actual, r.target ?? 0)), 1);
  const th = { textAlign: "left", fontWeight: 500, color: MUTED, padding: "6px 10px", borderBottom: "1px solid #2A2E38", whiteSpace: "nowrap" } as const;
  const td = { padding: "8px 10px", borderBottom: "1px solid #1D212B", whiteSpace: "nowrap" } as const;
  return (
    <div data-rehearsal-report style={{ display: "flex", flexDirection: "column", gap: 18, fontSize: 18 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", fontFamily: "var(--font-mono)" }}>
        <span style={{ letterSpacing: "0.12em", color: MUTED }}>REHEARSAL REPORT</span>
        <select value={run.id} onChange={(e) => setPick(e.target.value)} style={{ ...btn, borderRadius: 10 }}>
          {all.map((x, k) => <option key={x.id} value={x.id}>run {k + 1} · {new Date(x.started).toLocaleString()}{x.ended ? "" : " (live)"}</option>)}
        </select>
        <span style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          <button style={btn} onClick={rec.download}>Export JSON</button>
          <button style={btn} onClick={() => { if (confirm("Delete all saved runs?")) rec.clear(); }}>Clear</button>
          <button style={btn} onClick={onClose}>Back (V)</button>
        </span>
      </div>
      <div style={{ display: "flex", gap: 28, fontFamily: "var(--font-mono)", fontSize: 22 }} className="tnum">
        <span>total <b style={{ color: over(s.total, DECK.budget) }}>{sec(s.total)}</b> / {sec(DECK.budget)}</span>
        <span>{s.perStep.toFixed(1)} s per step</span>
        {s.backup > 0 && <span>Q&A slides {sec(s.backup)}</span>}
        {ps && <span style={{ color: MUTED }}>previous run {sec(ps.total)} ({s.total - ps.total >= 0 ? "+" : "−"}{sec(Math.abs(s.total - ps.total))})</span>}
      </div>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead><tr><th style={th}>#</th><th style={th}>scene</th><th style={th}>speaker</th><th style={th}>actual / target</th><th style={{ ...th, width: "32%" }}></th><th style={th}>per step (s)</th><th style={th}>animation</th></tr></thead>
        <tbody>
          {s.rows.map((r) => (
            <tr key={r.id}>
              <td style={{ ...td, color: MUTED, fontFamily: "var(--font-mono)" }}>{r.appendix ? "Q&A" : String(MAIN.indexOf(r.i) + 1).padStart(2, "0")}</td>
              <td style={td}>{r.title}</td>
              <td style={{ ...td, color: MUTED }}>{r.speaker ? nameOf(r.speaker) : ""}</td>
              <td style={{ ...td, fontFamily: "var(--font-mono)", color: over(r.actual, r.target) }} className="tnum">{sec(r.actual)}{r.target ? ` / ${sec(r.target)}` : ""}</td>
              <td style={td}>
                <div style={{ position: "relative", height: 12, background: "#1D212B", borderRadius: 6 }}>
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${(r.actual / maxT) * 100}%`, background: over(r.actual, r.target), borderRadius: 6, opacity: 0.85 }} />
                  {r.target && <div style={{ position: "absolute", top: -4, bottom: -4, width: 2, left: `${(r.target / maxT) * 100}%`, background: "#F1F1EE" }} />}
                </div>
              </td>
              <td style={{ ...td, fontFamily: "var(--font-mono)", color: MUTED }} className="tnum">{r.steps.map((x) => (x ?? 0).toFixed(0)).join(" · ")}</td>
              <td style={{ ...td, fontFamily: "var(--font-mono)", color: MUTED }} className="tnum">{r.anim.toFixed(1)} s</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        {[...s.speakers].map(([k, v]) => (
          <span key={k} style={{ fontFamily: "var(--font-mono)", padding: "8px 14px", borderRadius: 12, background: "#181C25", border: "1px solid #2A2E38" }} className="tnum">
            {k === "—" ? "no speaker" : nameOf(k)} <b style={{ color: over(v.actual, v.target || null) }}>{sec(v.actual)}</b>{v.target ? ` / ${sec(v.target)}` : ""}
          </span>
        ))}
      </div>
      <div style={{ color: MUTED, fontSize: 16 }}>Colour: green on target, amber over, red more than 15 % over. "animation" = time from the press to the ready cue; the rest is talking.</div>
    </div>
  );
}

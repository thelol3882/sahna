import { useEffect, useMemo, useRef, useState } from "react";
import { scenes } from "../scenes";
import { APPX, MAIN, slideNo } from "./util";

/** Fuzzy score of `q` against a scene: title > tags > notes; 0 = no match. Every word must match somewhere. */
export function score(i: number, q: string) {
  const s = scenes[i];
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return 1;
  const title = s.title.toLowerCase();
  const tags = (s.tags ?? []).join(" ").toLowerCase();
  const notes = s.notes.join(" ").toLowerCase();
  let total = 0;
  for (const w of words) {
    if (title.startsWith(w)) total += 8;
    else if (title.includes(w)) total += 6;
    else if (tags.includes(w)) total += 4;
    else if (notes.includes(w)) total += 2;
    else if (subseq(title, w)) total += 1;
    else return 0;
  }
  return total;
}
const subseq = (h: string, n: string) => { let k = 0; for (const c of h) if (c === n[k]) k++; return k === n.length; };

/** Search palette (/ or Ctrl/Cmd+K): backup slides first, main scenes in a second group. */
export function Palette({ current, onPick, onClose }: { current: number; onPick: (i: number) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  const groups = useMemo(() => {
    const rank = (ids: number[]) => ids.map((i) => ({ i, s: score(i, q) })).filter((x) => x.s > 0)
      .sort((a, b) => (q ? b.s - a.s : 0) || a.i - b.i).map((x) => x.i);
    return [{ name: "Backup slides", ids: rank(APPX) }, { name: "Main scenes", ids: rank(MAIN) }];
  }, [q]);
  const flat = groups.flatMap((g) => g.ids);
  const pick = (i: number | undefined) => { if (i !== undefined) onPick(i); };
  const onKey = (e: React.KeyboardEvent) => {
    e.nativeEvent.stopPropagation(); // the deck's keys stay off while searching
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setSel((v) => Math.min(flat.length - 1, v + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((v) => Math.max(0, v - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); pick(flat[sel]); }
  };
  let k = -1;
  return (
    <div className="no-export absolute inset-0 flex justify-center pt-[150px]" style={{ background: "var(--color-scrim)", zIndex: 80 }} onPointerDown={onClose}>
      <div className="card w-[1100px] max-h-[760px] flex flex-col overflow-hidden" style={{ boxShadow: "var(--shadow-lg)" }} onPointerDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-5 px-8 py-6" style={{ borderBottom: "1px solid var(--color-line)" }}>
          <span className="mono text-[26px]" style={{ color: "var(--color-muted)" }}>/</span>
          <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }} onKeyDown={onKey}
            placeholder="Search backup slides by title, tag or note…" aria-label="Search slides"
            className="flex-1 bg-transparent outline-none text-[32px]" style={{ color: "var(--color-ink)" }} />
          <span className="mono text-[18px]" style={{ color: "var(--color-muted)" }}>Enter go · Esc close</span>
        </div>
        <div className="overflow-y-auto py-3">
          {groups.map((g) => g.ids.length > 0 && (
            <div key={g.name} className="px-4 pb-2">
              <div className="eyebrow px-4 py-3 text-[18px]">{g.name}</div>
              {g.ids.map((i) => {
                k += 1;
                const on = k === sel;
                const s = scenes[i];
                return (
                  <button key={i} data-scene={s.id} onClick={() => pick(i)}
                    className="w-full text-left flex items-center gap-6 px-4 py-3 rounded-[14px] cursor-pointer"
                    style={{ background: on ? "var(--color-primary-soft)" : "transparent", color: "var(--color-ink)" }}>
                    <span className="mono text-[18px] w-[90px] flex-none" style={{ color: "var(--color-muted)" }}>{slideNo(i)}</span>
                    <span className="text-[28px] font-semibold flex-1 truncate">{s.title}{i === current ? "  ·  on screen" : ""}</span>
                    {s.tags && <span className="text-[18px] mono truncate max-w-[360px]" style={{ color: "var(--color-muted)" }}>{s.tags.join(" · ")}</span>}
                  </button>
                );
              })}
            </div>
          ))}
          {flat.length === 0 && <div className="px-8 py-6 body-m">Nothing found.</div>}
        </div>
      </div>
    </div>
  );
}

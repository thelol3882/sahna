import { SceneRoot, useScene } from "../deck";
import { Heading, enterHeading } from "../ui/kit";
import { DATA } from "../data";
import { VIZ, fmtDate, fmtNum, fmtRatio, vizClass, type Loc } from "../data-viz";

/** Backup: the same numbers in en / ru / kk (what fmtNum prints). */
const LOCS: Loc[] = ["en", "ru", "kk"];
export function Formats() {
  const f = DATA.formats;
  const rows: { label: string; f: (l: Loc) => string }[] = [
    { label: "number", f: (l) => fmtNum(f.users, { locale: l }) },
    { label: "compact", f: (l) => fmtNum(f.users, { style: "compact", locale: l }) },
    { label: "percent", f: (l) => fmtNum(f.share, { style: "percent", decimals: 1, locale: l }) },
    { label: "tenge", f: (l) => fmtNum(f.revenue, { style: "currency", locale: l }) },
    { label: "tenge, compact", f: (l) => fmtNum(f.revenue, { style: "compact", locale: l }) + " ₸" },
    { label: "ratio", f: (l) => fmtRatio(840, 250, { locale: l }) },
    { label: "date", f: (l) => fmtDate(f.date, { month: "long", day: true, year: true, locale: l }) },
  ];
  const ref = useScene((tl, q) => {
    enterHeading(tl, q);
    tl.from(q(".fm-row"), { autoAlpha: 0, y: 14, duration: 0.4, stagger: 0.05 }, 0.3);
  });
  return (
    <SceneRoot ref={ref} hero={VIZ.dark}>
      <Heading eyebrow="Backup · formatting" title="One number, three locales" />
      <div className={vizClass("viz-card absolute left-[120px] top-[320px] w-[1680px] px-12 py-6")}>
        <div className="grid grid-cols-[260px_1fr_1fr_1fr] gap-x-10 py-3 viz-sub font-semibold" style={{ borderBottom: "1px solid var(--viz-grid)" }}>
          <span /> {LOCS.map((l) => <span key={l} className="mono">{l}</span>)}
        </div>
        {rows.map((r) => (
          <div key={r.label} className="fm-row grid grid-cols-[260px_1fr_1fr_1fr] gap-x-10 py-[14px]" style={{ borderBottom: "1px solid var(--viz-grid)" }}>
            <span className="viz-sub">{r.label}</span>
            {LOCS.map((l) => <span key={l} className="viz-value tnum" style={{ fontSize: 30 }}>{r.f(l)}</span>)}
          </div>
        ))}
      </div>
    </SceneRoot>
  );
}

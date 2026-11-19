import { SceneRoot, useScene } from "../deck";
import { Heading, enterHeading } from "../ui/kit";
import { DATA } from "../data";
import { BeforeAfter, RatioBars, VIZ, fmtNum, fmtRatio, ratioIn, splitSweep, vizEl } from "../data-viz";

/**
 * Speed comparison.
 * s0: the page as it was (skeleton still loading)  ·  s1: the divider sweeps, the new page is revealed
 * s2: two bars on one scale and the ratio, computed from the totals
 */
type Parts = { server: number; network: number; render: number };
const sum = (p: Parts) => p.server + p.network + p.render;
const PARTS: { key: keyof Parts; label: string; color: string }[] = [
  { key: "server", label: "Server", color: "var(--viz-s1)" },
  { key: "network", label: "Network", color: "var(--viz-s2)" },
  { key: "render", label: "Render", color: "var(--viz-s3)" },
];

function Page({ loaded, parts, max, align }: { loaded: boolean; parts: Parts; max: number; align: "left" | "right" }) {
  const total = sum(parts);
  const block = (w: string, h: number, extra: React.CSSProperties = {}) =>
    <div className="rounded-[10px]" style={{ width: w, height: h, background: loaded ? "var(--viz-q2)" : "var(--viz-empty)", ...extra }} />;
  return (
    <div className="absolute inset-0 p-[40px] flex flex-col gap-5" style={{ background: loaded ? "var(--viz-surface)" : "var(--viz-plane)" }}>
      <div className="flex items-center gap-4">
        <div className="w-[44px] h-[44px] rounded-full" style={{ background: loaded ? "var(--viz-hi)" : "var(--viz-empty)" }} />
        {block("220px", 20)}
        <div className="flex-1" />
        {block("120px", 20)}
      </div>
      <div className="rounded-[16px] h-[150px] flex items-center px-8" style={{ background: loaded ? "var(--viz-q1)" : "var(--viz-empty)" }}>
        {loaded ? <span className="text-[40px] font-bold" style={{ color: "var(--viz-ink)" }}>Dashboard</span>
          : <svg width="44" height="44" viewBox="0 0 44 44" aria-label="loading"><circle cx="22" cy="22" r="18" fill="none" stroke="var(--viz-base)" strokeWidth="5" strokeDasharray="80 40" /></svg>}
      </div>
      <div className="flex gap-4">{[0, 1, 2].map((i) => <div key={i} className="flex-1">{block("100%", 70)}</div>)}</div>
      {/* the time, and its parts on the shared scale (both pages use the same px per ms) */}
      <div className={`mt-auto mb-[64px] flex flex-col gap-3 ${align === "right" ? "items-end" : "items-start"}`}>
        <span className="viz-value" style={{ fontSize: 64, lineHeight: 1 }}>{fmtNum(total, { unit: DATA.speed.unit })}</span>
        <div className="flex gap-[2px]" style={{ width: `${(total / max) * 92}%` }}>
          {PARTS.map((p) => <div key={p.key} className="h-[22px] first:rounded-l-[6px] last:rounded-r-[6px]" style={{ flex: parts[p.key], background: p.color }} />)}
        </div>
        <span className="viz-sub whitespace-nowrap">{PARTS.map((p) => `${p.label} ${fmtNum(parts[p.key])}`).join(" · ")}</span>
      </div>
    </div>
  );
}

export function Speed() {
  const s = DATA.speed;
  const b = sum(s.before), a = sum(s.after);
  const ref = useScene((tl, q) => {
    const ba = vizEl(q, "ba"), rb = vizEl(q, "ratio");
    enterHeading(tl, q);
    tl.fromTo(ba, { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: 0.6 }, 0.4);
    tl.set(rb, { autoAlpha: 0 }, 0);
    tl.addLabel("s0");
    splitSweep(tl, ba, "s0");
    tl.addLabel("s1");
    tl.to(rb, { autoAlpha: 1, duration: 0.3 }, "s1");
    ratioIn(tl, rb, "s1+=0.1", { unit: s.unit });
    tl.addLabel("s2");
  });
  return (
    <SceneRoot ref={ref} hero={VIZ.dark}>
      <Heading eyebrow="p95 page load" title={`Slow pages load ${fmtRatio(b, a)} faster`} />
      <div className="absolute left-[120px] top-[330px]">
        <BeforeAfter id="ba" width={980} height={620}
          before={<Page loaded={false} parts={s.before} max={b} align="left" />}
          after={<Page loaded parts={s.after} max={b} align="right" />}
          beforeLabel="Before" afterLabel="After" />
      </div>
      <div className="absolute left-[1180px] top-[380px]">
        <RatioBars id="ratio" width={620} a={{ label: "Before", value: b }} b={{ label: "After", value: a }} format={{ unit: s.unit }} word="faster" />
      </div>
    </SceneRoot>
  );
}

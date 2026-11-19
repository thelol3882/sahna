import { useScene } from "../deck";
import { FxScene } from "../fx";
import { counter, enterHeading } from "../ui/kit";
import { PanelLight } from "./PanelLight";
import { DATA } from "../data";

/** entrance: three outcomes count up · step 1: the comparison with the old system */
const R = DATA.results;

export function Results() {
  const ref = useScene((tl, q) => {
    enterHeading(tl, q);
    tl.from(q(".rs-col"), { y: 40, autoAlpha: 0, duration: 0.6, stagger: 0.12 }, 0.35);
    counter(tl, q(".rs-p99")[0], R.p99, 0.5, { duration: 1.1 });
    counter(tl, q(".rs-av")[0], R.availability, 0.62, { from: 99, duration: 1.1, format: (v) => v.toFixed(3) });
    tl.addLabel("s0")
      .from(q(".rs-cmp"), { autoAlpha: 0, y: 20, duration: 0.5 }, "s0")
      .fromTo(q(".rs-cmp-new"), { scaleX: 0 }, { scaleX: 1, transformOrigin: "0% 50%", duration: 0.7 }, "s0+=0.2")
      .fromTo(q(".rs-cmp-old"), { scaleX: 0 }, { scaleX: 1, transformOrigin: "0% 50%", duration: 0.9 }, "s0+=0.2")
      .addLabel("s1");
  });
  const cols = [
    { n: <><span className="rs-p99">0</span><span className="text-[56px]"> ms</span></>, l: "p99, payer tap to merchant answer" },
    { n: <><span className="rs-av">99.000</span><span className="text-[56px]"> %</span></>, l: "availability over the last year" },
    { n: <>{R.lost}</>, l: "ledger entries lost, ever" },
  ];
  return (
    <FxScene ref={ref}>
      <PanelLight x="80%" y="10%" />
      <div className="absolute left-[120px] top-[130px] w-[1680px] flex flex-col gap-5">
        <span className="eyebrow h-eyebrow">Back on the surface</span>
        <h1 className="h1 h-title m-0">What the relay adds up to</h1>
      </div>
      <div className="absolute left-[120px] right-[120px] top-[380px] grid grid-cols-3 gap-8">
        {cols.map((c, i) => (
          <div key={i} className="rs-col flex flex-col gap-4 pt-8" style={{ borderTop: `3px solid ${i === 0 ? "var(--color-primary)" : "var(--color-line-strong)"}` }}>
            <span className="tnum text-[120px] leading-none font-bold tracking-[-0.04em]">{c.n}</span>
            <span className="body-l">{c.l}</span>
          </div>
        ))}
      </div>
      <div className="rs-cmp absolute left-[120px] right-[120px] top-[740px] flex flex-col gap-5">
        <span className="body-m">p99 before and after the rewrite</span>
        {[{ cls: "rs-cmp-new", ms: R.p99, label: "now", c: "var(--color-primary)" }, { cls: "rs-cmp-old", ms: R.before, label: "2024", c: "var(--color-line-strong)" }].map((b) => (
          <div key={b.cls} className="flex items-center gap-6">
            <span className="mono text-[22px] w-[80px]" style={{ color: "var(--color-muted)" }}>{b.label}</span>
            <div className="flex-1 h-[20px]"><div className={`${b.cls} h-full rounded-full`} style={{ width: `${(b.ms / R.before) * 100}%`, background: b.c, transform: "scaleX(0)" }} /></div>
            <span className="tnum mono text-[26px] w-[140px] text-right">{b.ms.toLocaleString("en-US")} ms</span>
          </div>
        ))}
      </div>
    </FxScene>
  );
}

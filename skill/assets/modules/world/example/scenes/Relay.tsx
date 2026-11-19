import { useScene } from "../deck";
import { FxScene } from "../fx";
import { Heading, counter, enterHeading } from "../ui/kit";
import { PanelLight } from "./PanelLight";
import { DATA } from "../data";

/**
 * entrance: the route draws, stations appear with their own time
 * step 1: the 180 ms budget fills, segment by segment
 */
const X0 = 200, X1 = 1720, Y = 560;
const STOPS = [...DATA.hops.map((h) => ({ name: h.name, ms: `${h.ms} ms` })), { name: "Settle", ms: "async" }];
const SEG = [...DATA.hops.map((h) => ({ name: h.name, ms: h.ms, tone: "var(--color-primary)" })), { name: "between hops", ms: DATA.network, tone: "var(--color-line-strong)" }];

export function Relay() {
  const ref = useScene((tl, q) => {
    enterHeading(tl, q);
    tl.from(q(".rl-line"), { drawSVG: "0%", duration: 1.1, ease: "power2.inOut" }, 0.35)
      .from(q(".rl-stop"), { y: 18, autoAlpha: 0, duration: 0.5, stagger: 0.12 }, 0.6)
      .addLabel("s0")
      .from(q(".rl-budget"), { autoAlpha: 0, y: 20, duration: 0.5 }, "s0")
      .fromTo(q(".rl-seg"), { scaleX: 0 }, { scaleX: 1, transformOrigin: "0% 50%", duration: 0.45, stagger: 0.18, ease: "power2.out" }, "s0+=0.25")
      .from(q(".rl-seg-l"), { autoAlpha: 0, duration: 0.3, stagger: 0.18 }, "s0+=0.45");
    counter(tl, q(".rl-total")[0], DATA.budget, "s0+=0.25", { duration: 1.1, format: (v) => `${Math.round(v)} ms` });
    tl.addLabel("s1");
  });
  let acc = 0;
  return (
    <FxScene ref={ref}>
      <PanelLight />
      <Heading eyebrow="The route" title="A payment is a relay, not a single call" />
      <svg className="absolute inset-0" width="1920" height="1080" aria-hidden>
        <line className="rl-line" x1={X0} y1={Y} x2={X1} y2={Y} style={{ stroke: "var(--color-line-strong)" }} strokeWidth="2" />
      </svg>
      {STOPS.map((s, i) => {
        const x = X0 + ((X1 - X0) * i) / (STOPS.length - 1);
        const last = i === STOPS.length - 1;
        return (
          <div key={s.name} className="rl-stop absolute flex flex-col items-center gap-4" style={{ left: x - 120, top: Y - 16, width: 240 }}>
            <span className="block w-[32px] h-[32px] rounded-full" style={{ background: last ? "var(--color-canvas)" : "var(--color-primary)", border: `3px solid ${last ? "var(--color-line-strong)" : "var(--color-primary)"}` }} />
            <span className="text-[34px] font-bold tracking-[-0.02em]">{s.name}</span>
            <span className="mono text-[24px]" style={{ color: last ? "var(--color-muted)" : "var(--color-accent)" }}>{s.ms}</span>
          </div>
        );
      })}
      <div className="rl-budget absolute left-[200px] right-[200px] top-[790px] flex flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <span className="body-m">p99 budget, end to end</span>
          <span className="rl-total tnum text-[40px] font-bold">0 ms</span>
        </div>
        <div className="relative h-[22px] rounded-full overflow-hidden" style={{ background: "var(--color-sunken)" }}>
          {SEG.map((s) => {
            const left = (acc / DATA.budget) * 100; acc += s.ms;
            return <span key={s.name} className="rl-seg absolute top-0 bottom-0" style={{ left: `${left}%`, width: `calc(${(s.ms / DATA.budget) * 100}% - 3px)`, background: s.tone, transform: "scaleX(0)" }} />;
          })}
        </div>
        <div className="relative h-[30px]">
          {(() => { let a = 0; return SEG.map((s, i) => { const l = (a / DATA.budget) * 100; a += s.ms;
            // segments under 20 ms have no room for a label (their time is on the station above)
            if (s.ms < 20) return null;
            const last = i === SEG.length - 1;
            return (
              <span key={s.name} className="rl-seg-l absolute mono text-[20px] whitespace-nowrap" style={{ ...(last ? { right: 0 } : { left: `${l}%` }), color: "var(--color-muted)" }}>{s.name} {s.ms} ms</span>
            ); }); })()}
        </div>
      </div>
    </FxScene>
  );
}

import { useScene } from "../deck";
import { FxScene } from "../fx";
import { enterHeading } from "../ui/kit";
import { PanelLight } from "./PanelLight";
import { DATA } from "../data";

/**
 * The room behind the ledger's window, one level down.
 * entrance: three phases of a write · step 1: the quorum (2 of 3 replicas) · step 2: nothing is updated in place
 */
const W = DATA.ledger.write;

export function Inside() {
  const ref = useScene((tl, q) => {
    enterHeading(tl, q);
    tl.from(q(".in-card"), { y: 40, autoAlpha: 0, duration: 0.6, stagger: 0.14 }, 0.35)
      .from(q(".in-arrow"), { autoAlpha: 0, x: -12, duration: 0.4, stagger: 0.14 }, 0.7)
      .addLabel("s0")
      .from(q(".in-rep"), { autoAlpha: 0, y: 10, duration: 0.4, stagger: 0.1 }, "s0")
      .from(q(".in-rep-on"), { autoAlpha: 0, scale: 0.4, duration: 0.3, stagger: 0.25 }, "s0+=0.45")
      .from(q(".in-quorum"), { autoAlpha: 0, duration: 0.4 }, "s0+=0.9")
      .addLabel("s1")
      .from(q(".in-rule"), { autoAlpha: 0, y: 24, duration: 0.6 }, "s1")
      .addLabel("s2");
  });
  return (
    <FxScene ref={ref}>
      <PanelLight x="50%" y="0%" />
      <div className="absolute left-[120px] top-[130px] w-[1680px] flex flex-col gap-5">
        <span className="eyebrow h-eyebrow">Inside the ledger · one level down</span>
        <h1 className="h1 h-title m-0">Append first, apply second, index last</h1>
      </div>
      <div className="absolute left-[120px] right-[120px] top-[390px] flex items-stretch gap-6">
        {W.map((p, i) => (
          <div key={p.name} className="contents">
            <div className="in-card flex-1 rounded-[24px] border px-10 py-9 flex flex-col gap-3" style={{ background: "var(--color-surface)", borderColor: i === 0 ? "var(--color-primary)" : "var(--color-line)" }}>
              <span className="mono text-[22px]" style={{ color: "var(--color-muted)" }}>0{i + 1}</span>
              <span className="text-[38px] font-bold tracking-[-0.02em]">{p.name}</span>
              <span className="body-m">{p.detail}</span>
              <span className="tnum text-[56px] font-bold mt-4" style={{ color: "var(--color-accent)" }}>{p.ms} ms</span>
              {i === 0 && (
                <div className="flex items-center gap-3 mt-2">
                  {[0, 1, 2].map((k) => (
                    <span key={k} className="in-rep relative block w-[22px] h-[22px] rounded-full" style={{ background: "var(--color-line-strong)" }}>
                      {k < 2 && <span className="in-rep-on absolute inset-0 rounded-full" style={{ background: "var(--color-success)" }} />}
                    </span>
                  ))}
                  <span className="in-quorum mono text-[22px] ml-2" style={{ color: "var(--color-success)" }}>2 of 3 ack → durable</span>
                </div>
              )}
            </div>
            {i < W.length - 1 && <span className="in-arrow self-center text-[40px]" style={{ color: "var(--color-line-strong)" }}>→</span>}
          </div>
        ))}
      </div>
      <div className="in-rule absolute left-[120px] right-[120px] top-[830px] rounded-[20px] px-10 py-7 flex items-baseline gap-6" style={{ background: "var(--color-primary-soft)" }}>
        <span className="text-[34px] font-bold">Nothing is updated in place.</span>
        <span className="body-m" style={{ color: "var(--color-ink-2)" }}>A correction is a new entry, so the log is the audit trail.</span>
      </div>
    </FxScene>
  );
}

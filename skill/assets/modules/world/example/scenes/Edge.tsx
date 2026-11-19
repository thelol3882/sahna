import { useScene } from "../deck";
import { FxScene } from "../fx";
import { counter, enterHeading } from "../ui/kit";
import { StopFrame } from "./Stop";
import { DATA } from "../data";

/** entrance: title, 12 ms counts, three facts · step 1: the idempotency fact comes forward */
const FACTS = [
  { k: `${DATA.edge.regions} regions`, v: "terminate TLS close to the payer" },
  { k: "Idempotency first", v: "the same key always gets the same answer, before any work is done" },
  { k: `${DATA.edge.malformed} % rejected`, v: "malformed requests never reach risk" },
];

export function Edge() {
  const ref = useScene((tl, q) => {
    enterHeading(tl, q);
    tl.from(q(".st-big"), { y: 30, autoAlpha: 0, duration: 0.6 }, 0.3);
    counter(tl, q(".st-n")[0], DATA.edge.ms, 0.4, { duration: 0.9 });
    tl.from(q(".ed-fact"), { x: 40, autoAlpha: 0, duration: 0.6, stagger: 0.12 }, 0.5)
      .addLabel("s0")
      .to(q(".ed-fact:not(.ed-key)"), { opacity: 0.4, duration: 0.4 }, "s0")
      .to(q(".ed-key"), { x: -24, duration: 0.5 }, "s0")
      .from(q(".ed-ring"), { autoAlpha: 0, duration: 0.5 }, "s0")
      .from(q(".ed-key-note"), { height: 0, autoAlpha: 0, duration: 0.5 }, "s0+=0.15")
      .addLabel("s1");
  });
  return (
    <FxScene ref={ref}>
      <StopFrame eyebrow="Stop 1 · Edge" title="Edge says yes or no in 12 ms" big="0" unit="ms" caption="p99, request in → decision out">
        <div className="absolute left-[1000px] top-[300px] w-[800px] flex flex-col gap-6">
          {FACTS.map((f, i) => (
            <div key={f.k} className={`ed-fact ${i === 1 ? "ed-key" : ""} relative rounded-[24px] border-2 px-10 py-8 flex flex-col gap-2`} style={{ background: "var(--color-surface)", borderColor: "var(--color-line)" }}>
              {i === 1 && <span className="ed-ring absolute inset-[-2px] rounded-[24px] pointer-events-none" style={{ border: "3px solid var(--color-primary)" }} />}
              <span className="text-[36px] font-bold tracking-[-0.02em]">{f.k}</span>
              <span className="body-m">{f.v}</span>
              {i === 1 && <span className="ed-key-note mono text-[22px] overflow-hidden" style={{ color: "var(--color-accent)" }}>retry ×3 → one charge</span>}
            </div>
          ))}
        </div>
      </StopFrame>
    </FxScene>
  );
}

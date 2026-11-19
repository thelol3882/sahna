import { useScene } from "../deck";
import { FxScene } from "../fx";
import { counter, enterHeading } from "../ui/kit";
import { StopFrame } from "./Stop";
import { DATA } from "../data";

/** entrance: 140 counts, the four signal families grow · step 1: the review share */
const MAX = Math.max(...DATA.risk.families.map((f) => f.n));

export function Risk() {
  const ref = useScene((tl, q) => {
    enterHeading(tl, q);
    tl.from(q(".st-big"), { y: 30, autoAlpha: 0, duration: 0.6 }, 0.3);
    counter(tl, q(".st-n")[0], DATA.risk.signals, 0.4, { duration: 1.1 });
    tl.from(q(".rk-card"), { autoAlpha: 0, y: 30, duration: 0.6 }, 0.45)
      .fromTo(q(".rk-bar"), { scaleX: 0 }, { scaleX: 1, transformOrigin: "0% 50%", duration: 0.8, stagger: 0.1, ease: "power3.out" }, 0.7)
      .addLabel("s0")
      .from(q(".rk-review"), { autoAlpha: 0, y: 24, duration: 0.6 }, "s0")
      .to(q(".rk-bar"), { opacity: 0.45, duration: 0.4 }, "s0")
      .addLabel("s1");
  });
  return (
    <FxScene ref={ref}>
      <StopFrame eyebrow="Stop 2 · Risk" title="Risk scores every payment in 38 ms" big="0" unit="signals" caption="read per payment, from four families">
        <div className="rk-card absolute left-[1000px] top-[300px] w-[800px] rounded-[24px] border px-12 py-10 flex flex-col gap-7" style={{ background: "var(--color-surface)", borderColor: "var(--color-line)" }}>
          <span className="body-m">Signals per family</span>
          {DATA.risk.families.map((f) => (
            <div key={f.name} className="flex flex-col gap-2">
              <div className="flex justify-between text-[28px]"><span className="font-semibold">{f.name}</span><span className="tnum mono" style={{ color: "var(--color-ink-2)" }}>{f.n}</span></div>
              <div className="h-[14px] rounded-full" style={{ background: "var(--color-sunken)" }}>
                <div className="rk-bar h-full rounded-full" style={{ width: `${(f.n / MAX) * 100}%`, background: "var(--color-primary)", transform: "scaleX(0)" }} />
              </div>
            </div>
          ))}
        </div>
        <div className="rk-review absolute left-[1000px] top-[810px] w-[800px] rounded-[20px] px-10 py-6 flex items-baseline gap-6" style={{ background: "var(--color-accent-soft)" }}>
          <span className="text-[48px] font-bold" style={{ color: "var(--color-accent)" }}>{DATA.risk.review} %</span>
          <span className="text-[28px]">go to a person for review</span>
        </div>
      </StopFrame>
    </FxScene>
  );
}

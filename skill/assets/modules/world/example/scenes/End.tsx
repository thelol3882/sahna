import { useScene } from "../deck";
import { FxScene } from "../fx";
import { PanelLight } from "./PanelLight";

/** Closing scene (hero). The camera reaches it via the overview: out to the whole map, then in. */
const STOPS = ["Route", "Edge", "Risk", "Ledger", "Inside", "Results"];

export function End() {
  const ref = useScene((tl, q) => {
    tl.from(q(".en-t"), { yPercent: 105, duration: 0.9, ease: "power4.out" }, 0.1)
      .from(q(".en-sub"), { y: 20, autoAlpha: 0, duration: 0.6 }, 0.45)
      .from(q(".en-stop"), { autoAlpha: 0, y: 10, duration: 0.4, stagger: 0.07 }, 0.6)
      .addLabel("s0");
  });
  return (
    <FxScene kind="hero" ref={ref}>
      <PanelLight x="50%" y="50%" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-10 text-center">
        <span className="eyebrow">Tessera · platform tour</span>
        <div className="overflow-hidden pb-2"><h1 className="en-t m-0 text-[150px] leading-[0.95] font-bold tracking-[-0.05em]">Questions</h1></div>
        <p className="en-sub body-l m-0 max-w-[1100px]">Every stop is still where we left it. Press O for the map, or a number to fly back.</p>
        <div className="flex gap-4 mt-4">
          {STOPS.map((s, i) => (
            <span key={s} className="en-stop mono text-[20px] rounded-full px-5 py-2" style={{ border: "1px solid var(--color-hero-line)", color: "var(--color-hero-muted)" }}>{String(i + 2).padStart(2, "0")} {s}</span>
          ))}
        </div>
      </div>
    </FxScene>
  );
}

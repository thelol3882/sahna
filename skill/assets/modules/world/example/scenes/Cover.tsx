import { useScene } from "../deck";
import { FxScene } from "../fx";
import { PanelLight } from "./PanelLight";

/** Opening scene (hero). The camera flies in from far away; the entrance starts as it arrives. */
export function Cover() {
  const ref = useScene((tl, q) => {
    tl.from(q(".cv-ring"), { drawSVG: "0%", duration: 1.6, ease: "power2.inOut", stagger: 0.14 }, 0)
      .from(q(".cv-dot"), { scale: 0, transformOrigin: "50% 50%", duration: 0.5, ease: "back.out(2)" }, 1.0)
      .from(q(".cv-eyebrow"), { y: 20, autoAlpha: 0, duration: 0.5 }, 0.15)
      .from(q(".cv-word"), { yPercent: 105, duration: 1.0, ease: "power4.out" }, 0.25)
      .from(q(".cv-sub"), { y: 24, autoAlpha: 0, duration: 0.7 }, 0.7)
      .from(q(".cv-meta > *"), { y: 12, autoAlpha: 0, duration: 0.5, stagger: 0.08 }, 0.95)
      .addLabel("s0");
  });
  return (
    <FxScene kind="hero" ref={ref}>
      <PanelLight x="74%" y="46%" />
      <svg className="absolute inset-0" width="1920" height="1080" aria-hidden>
        {[170, 290, 410].map((r, i) => (
          <circle key={r} className="cv-ring" cx="1430" cy="520" r={r} fill="none"
            style={{ stroke: i === 2 ? "var(--color-primary)" : "var(--color-hero-line)" }} strokeWidth={i === 2 ? 2 : 1.5} />
        ))}
        <circle className="cv-dot" cx={1430 + 410 * Math.cos(-0.6)} cy={520 + 410 * Math.sin(-0.6)} r="12" style={{ fill: "var(--color-accent)" }} />
        <circle className="cv-dot" cx="1430" cy="520" r="6" style={{ fill: "var(--color-hero-ink)" }} />
      </svg>
      <div className="absolute left-[140px] top-[300px] w-[1000px] flex flex-col gap-8">
        <span className="cv-eyebrow eyebrow">Platform tour · fictional system</span>
        <div className="overflow-hidden pb-2">
          <h1 className="cv-word m-0 text-[168px] leading-[0.95] font-bold tracking-[-0.05em]">Tessera</h1>
        </div>
        <p className="cv-sub body-l m-0 max-w-[860px]">One payment crosses five systems in 180 milliseconds. We fly along with it.</p>
        <div className="cv-meta mono flex gap-8 text-[20px] tracking-[0.08em] uppercase" style={{ color: "var(--color-hero-muted)" }}>
          <span>8 stops</span><span>·</span><span>9 minutes</span><span>·</span><span>press O for the map</span>
        </div>
      </div>
    </FxScene>
  );
}

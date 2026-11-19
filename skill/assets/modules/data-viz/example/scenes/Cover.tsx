import { SceneRoot, useScene } from "../deck";
import { SplitText } from "../gsap";
import { VIZ, Odometer, odometerIn } from "../data-viz";
import { allow } from "../fx/dial";

/** Hero cover for the data-viz examples. */
export function Cover() {
  const ref = useScene((tl, q) => {
    const split = new SplitText(q(".cv-title"), { type: "chars,words", mask: "chars" });
    tl.from(q(".cv-in"), { y: 24, autoAlpha: 0, duration: 0.6 }, 0.2)
      .from(split.chars, { yPercent: 110, duration: 0.6, stagger: 0.025 }, 0.4)
      .from(q(".cv-sub"), { y: 30, autoAlpha: 0, duration: 0.7, stagger: 0.1 }, 1.1);
    odometerIn(tl, q(".cv-odo")[0], 0.6);
    tl.from(q(".cv-bar"), { scaleY: 0, transformOrigin: "50% 100%", duration: 0.8, stagger: 0.08 }, 0.8)
      .addLabel("s0");
  });
  const bars = [38, 52, 46, 71, 100, 64];
  return (
    <SceneRoot hero={allow("darkHero")} ref={ref}>
      <div className="cv-in eyebrow absolute left-[120px] top-[230px]">animated-web-deck · data storytelling · {VIZ.style}</div>
      <h1 className="cv-title absolute left-[120px] top-[300px] m-0 max-w-[1000px] text-[120px] leading-[1.02] font-bold tracking-[-0.045em]">
        Numbers that land
      </h1>
      <p className="cv-sub absolute left-[120px] top-[470px] m-0 max-w-[860px] text-[40px] leading-[1.25] font-semibold">Big, animated, annotated, honest: every value from one data object, with its source.</p>
      <div className="absolute right-[160px] top-[250px] flex flex-col items-end gap-8">
        <span className="cv-odo text-[200px] font-bold tracking-[-0.05em] leading-none"><Odometer text="1,284" /></span>
        <div className="flex items-end gap-[10px] h-[260px]">
          {bars.map((b, i) => <div key={i} className="cv-bar w-[64px] rounded-t-[6px]" style={{ height: `${b}%`, background: i === 4 ? "var(--color-accent)" : allow("darkHero") ? "var(--color-hero-line)" : "var(--color-line)" }} />)}
        </div>
      </div>
    </SceneRoot>
  );
}

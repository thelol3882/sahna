import { useScene } from "../deck";
import { Aurora, FxScene, Grain, ProtagonistSlot, decode, maskLines, protagonist } from "../fx";
import { P } from "./states";

/**
 * Hero: aurora + grain around the orb, the title rises line by line, the orb (the protagonist) blooms.
 * Step 1: the subtitle decodes (showcase) / reveals (balanced, academic). On → the camera dives through the
 * title's full stop (meta exit.through) into the bento.
 */
export function Hero() {
  const ref = useScene((tl, q) => {
    protagonist.start(tl, q, P.heroIn);
    tl.from(q(".hr-chip"), { y: 16, autoAlpha: 0, duration: 0.9, ease: "expo.out" }, 0.15);
    maskLines(tl, q(".hr-title")[0], 0.3);
    protagonist.to(tl, P.hero, 0.55, { duration: 2, ease: "expo.out" });
    tl.from(q(".hr-dot"), { scale: 0, transformOrigin: "50% 50%", duration: 0.8, ease: "expo.out" }, 1.1)
      .from(q(".hr-rule"), { scaleX: 0, transformOrigin: "0% 50%", duration: 1.2, ease: "expo.inOut" }, 1.1)
      .addLabel("s0");
    decode(tl, q(".hr-decode")[0], "s0+=0.05");
    tl.from(q(".hr-meta"), { y: 12, autoAlpha: 0, duration: 0.7, ease: "expo.out" }, "s0+=0.9")
      .addLabel("s1");
  });
  return (
    <FxScene kind="hero" ref={ref}>
      <div className="pk-texture" />
      <Aurora hero at={[76, 40]} />
      <Grain />
      <ProtagonistSlot />
      <div className="absolute left-[160px] top-[210px] w-[1120px]">
        <span className="hr-chip fx-chip"><span className="fx-chip-dot" />Halo · launch keynote</span>
        <h1 className="hr-title display fx-grad-text m-0 mt-12 text-[150px]">
          Delivered by tonight, in every city<span className="hr-dot inline-block ml-[0.06em] w-[0.2em] h-[0.2em] rounded-full" style={{ background: "var(--color-primary)" }} />
        </h1>
        <div className="hr-rule mt-14 h-px w-[860px]" style={{ background: "linear-gradient(90deg, var(--color-line-strong), transparent)" }} />
        <p className="hr-decode m-0 mt-8 text-[26px] font-medium tracking-[0.16em]" style={{ fontFamily: "var(--font-display)", color: "var(--color-ink-2)" }}>
          SAME-DAY ROUTING · LIVE COURIERS · 10 CITIES
        </p>
      </div>
      <p className="hr-meta absolute left-[160px] bottom-[110px] m-0 body-m">Astana · 19 November 2026 · a fictional product</p>
    </FxScene>
  );
}

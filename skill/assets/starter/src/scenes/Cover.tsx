import { useScene } from "../deck";
import { Aurora, FxScene, Grain, decode, maskLines } from "../fx";

/**
 * Hero cover (dark from balanced up): soft aurora + grain behind the focus, the title rises line by line from
 * its mask, the subtitle decodes (showcase) or reveals (balanced, academic). The dot is the mark: replace it.
 * `.cv-dot` is also a good through-zoom target (meta `exit: { through: ".cv-dot" }`).
 */
export function Cover() {
  const ref = useScene((tl, q) => {
    tl.from(q(".cv-chip"), { y: 16, autoAlpha: 0, duration: 0.9, ease: "expo.out" }, 0.1);
    maskLines(tl, q(".cv-title")[0], 0.25);
    tl.from(q(".cv-dot"), { scale: 0, transformOrigin: "50% 50%", duration: 0.9, ease: "expo.out" }, 0.6);
    decode(tl, q(".cv-sub")[0], 0.9);
    tl.from(q(".cv-meta"), { y: 12, autoAlpha: 0, duration: 0.7, ease: "expo.out" }, 1.4)
      .addLabel("s0");
  });
  return (
    <FxScene kind="hero" ref={ref}>
      <div className="pk-texture" />
      <Aurora hero at={[76, 34]} />
      <Grain />
      <div className="cv-dot absolute left-[1500px] top-[330px] w-[200px] h-[200px] rounded-full"
        style={{ background: "radial-gradient(circle at 35% 30%, var(--color-hero-accent), var(--color-primary) 70%)",
          boxShadow: "0 0 80px 10px color-mix(in srgb, var(--color-primary) 35%, transparent)" }} />
      <div className="absolute left-[160px] top-[220px] w-[1180px]">
        <span className="cv-chip fx-chip"><span className="fx-chip-dot" />Course · Venue · November 2026</span>
        <h1 className="cv-title display fx-grad-text m-0 mt-12">One clear statement as the title</h1>
        <p className="cv-sub m-0 mt-10 text-[36px] leading-[1.3] font-medium" style={{ color: "var(--color-ink-2)" }}>
          A subtitle that says what the audience will learn
        </p>
      </div>
      <p className="cv-meta absolute left-[160px] bottom-[120px] m-0 body-m">Speaker One · Speaker Two</p>
    </FxScene>
  );
}

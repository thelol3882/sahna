import { useScene } from "../deck";
import { Aurora, FxScene, Grain, ProtagonistSlot, maskLines, protagonist, weight } from "../fx";
import { P } from "./states";

/** Close: the orb returns and morphs into Halo's mark; the line gains weight as a wave runs through it. */
export function Close() {
  const ref = useScene((tl, q) => {
    protagonist.start(tl, q, P.closeIn);
    protagonist.to(tl, P.close, 0.1, { duration: 1.4, ease: "expo.out" });
    protagonist.to(tl, P.closeMark, 1.0, { duration: 1.2, ease: "expo.inOut" });
    maskLines(tl, q(".cl-title")[0], 0.5);
    weight(tl, q(".cl-title")[0], 300, 640, 1.3, { duration: 0.9, stagger: 0.035 });
    tl.from(q(".cl-sub"), { y: 16, autoAlpha: 0, duration: 0.9, ease: "expo.out" }, 1.6)
      .addLabel("s0");
  });
  return (
    <FxScene kind="hero" ref={ref}>
      <div className="pk-texture" />
      <Aurora hero at={[50, 34]} top={false} />
      <Grain />
      <ProtagonistSlot />
      <div className="absolute left-0 right-0 top-[540px] flex flex-col items-center text-center">
        <h2 className="cl-title display m-0 text-[150px]" style={{ fontWeight: 640 }}>Every city, by tonight.</h2>
        <p className="cl-sub fx-lede m-0 mt-10">halo.example · a fictional product · questions welcome</p>
      </div>
    </FxScene>
  );
}

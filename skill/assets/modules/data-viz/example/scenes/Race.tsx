import { SceneRoot, useScene } from "../deck";
import { Heading, enterHeading } from "../ui/kit";
import { DATA } from "../data";
import { BarRace, FrameLabels, VIZ, barRaceIn, barRaceTo, frameLabelTo, vizEl } from "../data-viz";

/** Bar race: one quarter per step; ranks re-order, the scale stays fixed. */
export function Race() {
  const r = DATA.race;
  const ref = useScene((tl, q) => {
    const race = vizEl(q, "race");
    const fl = q(".race-frames")[0];
    enterHeading(tl, q);
    barRaceIn(tl, race, 0.5);
    frameLabelTo(tl, fl, 0, 0.5);
    tl.addLabel("s0");
    for (let k = 1; k < r.frames.length; k++) {
      barRaceTo(tl, race, k, `s${k - 1}`);
      frameLabelTo(tl, fl, k, `s${k - 1}`);
      tl.addLabel(`s${k}`, `s${k - 1}+=1.3`);
    }
  });
  return (
    <SceneRoot ref={ref} hero={VIZ.dark}>
      <Heading eyebrow="Orders by city" title="Astana overtook Almaty in Q4" />
      <div className="absolute left-[120px] top-[350px]">
        <BarRace id="race" entities={r.entities} frames={r.frames} width={1180} height={600} highlight="astana" />
      </div>
      <FrameLabels frames={r.frames} className="race-frames absolute right-[120px] top-[330px] w-[400px] h-[120px] text-[88px] font-bold tracking-[-0.04em] text-right" style={{ color: "var(--viz-muted, var(--color-muted))" }} />
      <p className="absolute right-[120px] top-[450px] w-[300px] body-m text-right m-0">orders per quarter, same scale in every quarter</p>
    </SceneRoot>
  );
}

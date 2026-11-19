import { SceneRoot, useScene } from "../deck";
import { Heading, enterHeading } from "../ui/kit";
import { DATA } from "../data";
import { BarChart, BigNumber, Callout, VIZ, barGeom, barsHighlight, barsIn, bigNumberIn, bigNumberToCard, calloutIn, fmtNum, vizEl } from "../data-viz";

/**
 * Launch metrics: big number → card → bars.
 * entrance (s0): one stat fills the stage, digits roll, context line
 * step 1 (s1): it shrinks into its card, heading in, daily bars grow from the baseline
 * step 2 (s2): the peak day turns into the highlight, callout explains it
 */
const W = 1080, H = 600;
export function Launch() {
  const d = DATA.launch;
  const peak = d.byDay.find((x) => x.key === d.peak)!;
  const share = (peak.value / d.signups) * 100;
  const g = barGeom(d.byDay, W, H);
  const cap = g.cap(d.peak);
  const ref = useScene((tl, q) => {
    const bn = vizEl(q, "signups"), bars = vizEl(q, "days");
    tl.set(bars, { autoAlpha: 0 }, 0);
    bigNumberIn(tl, bn, 0.2);
    tl.addLabel("s0");
    bigNumberToCard(tl, bn, "s0");
    enterHeading(tl, q, tl.labels.s0 + 0.5);
    tl.to(bars, { autoAlpha: 1, duration: 0.3 }, "s0+=0.6");
    barsIn(tl, bars, "s0+=0.7");
    tl.addLabel("s1");
    barsHighlight(tl, bars, "s1");
    calloutIn(tl, q(".viz-co")[0], "s1+=0.35");
    tl.addLabel("s2");
  });
  return (
    <SceneRoot ref={ref} hero={VIZ.dark}>
      <Heading eyebrow={`Launch week · ${d.week}`} title={`${fmtNum(share, { style: "percent" })} of sign-ups came on one day`} />
      <BigNumber id="signups" text={fmtNum(d.signups)} eyebrow={`Launch week · ${d.week}`} context="teams signed up in the first seven days"
        card={{ left: 120, top: 380, width: 520, height: 250 }} cardLabel="teams signed up in launch week" />
      <div className="absolute left-[720px] top-[340px]">
        <BarChart id="days" data={d.byDay} highlight={d.peak} width={W} height={H} axisLabel="sign-ups per day">
          <Callout x={cap.x + g.bw / 2 + 70} y={cap.y - 8} tx={cap.x + g.bw / 2} ty={cap.y + 60} w={330}>
            <b>{d.peakWhy}</b>: {fmtNum(peak.value)} sign-ups in one day
          </Callout>
        </BarChart>
      </div>
    </SceneRoot>
  );
}

import { useScene } from "../deck";
import { FxScene } from "../fx";
import { Heading, enterHeading } from "../ui/kit";
import { DATA } from "../data";
import { BarChart, BigNumber, Callout, barGeom, barsHighlight, barsIn, bigNumberIn, bigNumberToCard, calloutIn, fmtNum, vizEl } from "../data-viz";

/**
 * Data story 1: one big number → its card → the days behind it.
 * s0: the week's deliveries fill the stage, digits roll · s1: the number shrinks into its card, daily bars grow
 * s2: the peak day becomes the highlight, a callout says why.
 */
const W = 1080, H = 600;
export function Numbers() {
  const d = DATA.launch;
  const peak = d.byDay.find((x) => x.key === d.peak)!;
  const share = (peak.value / d.total) * 100;
  const g = barGeom(d.byDay, W, H);
  const cap = g.cap(d.peak);
  const ref = useScene((tl, q) => {
    const bn = vizEl(q, "week"), bars = vizEl(q, "days");
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
    <FxScene ref={ref}>
      <Heading eyebrow={`One week · ${d.week}`} title={`${fmtNum(share, { style: "percent" })} of the week came on one day`} />
      <BigNumber id="week" text={fmtNum(d.total)} eyebrow={`One week · ${d.week}`} context="deliveries in seven days"
        card={{ left: 120, top: 380, width: 520, height: 250 }} cardLabel="deliveries, one week" />
      <div className="absolute left-[720px] top-[340px]">
        <BarChart id="days" data={d.byDay} highlight={d.peak} width={W} height={H} axisLabel="deliveries per day">
          <Callout x={cap.x + g.bw / 2 + 70} y={cap.y - 8} tx={cap.x + g.bw / 2} ty={cap.y + 60} w={330}>
            <b>{d.peakWhy}</b>: {fmtNum(peak.value)} deliveries in one day
          </Callout>
        </BarChart>
      </div>
    </FxScene>
  );
}

import { SceneRoot, useScene } from "../deck";
import { Heading, enterHeading } from "../ui/kit";
import { DATA } from "../data";
import { LineChart, VIZ, fmtNum, lineBand, lineEnd, lineIn, lineNote, lineTo, pointIndex, vizEl, type Series } from "../data-viz";

/**
 * Growth story: the line draws chapter by chapter, each chapter pinned to a date.
 * s0: Jan 2025 → free tier · s1: → mobile app · s2: → today, Kazakh UI · s3: before/after band with the computed rates
 */
const monthly = (a: number, b: number, months: number) => ((b / a) ** (1 / months) - 1) * 100;
export function Growth() {
  const g = DATA.growth;
  const wau: Series = { key: "wau", label: "Weekly active", points: g.wau.map(([x, y]) => ({ x, y })) };
  const plan: Series = { key: "plan", label: "Plan", points: g.plan.map(([x, y]) => ({ x, y })) };
  const iFree = pointIndex(wau, g.events.free), iMob = pointIndex(wau, g.events.mobile), iKz = pointIndex(wau, g.events.kazakh);
  const last = wau.points.length - 1;
  const before = monthly(wau.points[0].y, wau.points[iMob - 1].y, iMob - 1);
  const after = monthly(wau.points[iMob].y, wau.points[last].y, last - iMob);
  const pct = (v: number) => fmtNum(v, { style: "percent", decimals: 1, signed: true });
  const ref = useScene((tl, q) => {
    const lc = vizEl(q, "wau");
    enterHeading(tl, q);
    lineIn(tl, lc, 0.4, { to: iFree, duration: 1.2 });
    lineNote(tl, lc, 0, 1.7);
    tl.addLabel("s0");
    lineTo(tl, lc, iMob, "s0", 1.4);
    lineNote(tl, lc, 1, "s0+=1.4");
    tl.addLabel("s1");
    lineTo(tl, lc, last, "s1", 1.6);
    lineNote(tl, lc, 2, "s1+=1.0");
    lineEnd(tl, lc, "s1+=1.6");
    tl.addLabel("s2", "s1+=2.4");
    lineBand(tl, lc, 0, "s2");
    tl.addLabel("s3");
  });
  return (
    <SceneRoot ref={ref} hero={VIZ.dark}>
      <Heading eyebrow="Weekly active users" title="Growth sped up after the mobile app" />
      <div className="absolute left-[120px] top-[330px]">
        <LineChart id="wau" series={[plan, wau]} main="wau" width={1680} height={640}
          xTicks={["2025-01", "2025-04", "2025-07", "2025-10", "2026-01", "2026-04", "2026-07", "2026-10"]}
          notes={[
            { x: g.events.free, text: <><b>Free tier</b> launched</>, dx: 40, dy: -170, w: 260 },
            { x: g.events.mobile, text: <><b>Mobile app</b> released</>, dx: -330, dy: -150, w: 280 },
            { x: g.events.kazakh, text: <><b>Kazakh interface</b> shipped</>, dx: 40, dy: 70, w: 300 },
          ]}
          bands={[{ from: g.events.mobile, to: wau.points[last].x, label: <>{pct(after)} a month · before: {pct(before)}</> }]} />
      </div>
    </SceneRoot>
  );
}

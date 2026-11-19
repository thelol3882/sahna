import { SceneRoot, useScene } from "../deck";
import { Heading, enterHeading } from "../ui/kit";
import { DATA } from "../data";
import { Callout, Funnel, VIZ, Waffle, calloutIn, fmtNum, funnelIn, vizEl, waffleFill, waffleIn } from "../data-viz";

/**
 * Units + funnel. s0: 100 visitors as dots · s1: the share that signs up lights up
 * s2: the funnel builds stage by stage · s3: the biggest drop gets the callout
 */
const FW = 760, ROW = 80, GAP = 52;
export function Convert() {
  const f = DATA.convert.funnel;
  const share = (f[1].value / f[0].value) * 100;
  // the stage with the lowest step conversion
  const conv = f.map((s, i) => (i ? s.value / f[i - 1].value : 1));
  const worst = conv.indexOf(Math.min(...conv.slice(1)));
  const barBottom = worst * (ROW + GAP) + ROW, bottom = f.length * ROW + (f.length - 1) * GAP;
  const ref = useScene((tl, q) => {
    const wf = vizEl(q, "waffle"), fn = vizEl(q, "funnel");
    enterHeading(tl, q);
    waffleIn(tl, wf, 0.4);
    tl.set(fn, { autoAlpha: 0 }, 0);
    tl.addLabel("s0");
    waffleFill(tl, wf, "s0");
    tl.addLabel("s1");
    tl.to(fn, { autoAlpha: 1, duration: 0.2 }, "s1");
    funnelIn(tl, fn, "s1+=0.1");
    tl.addLabel("s2");
    calloutIn(tl, q(".viz-co")[0], "s2");
    tl.addLabel("s3");
  });
  return (
    <SceneRoot ref={ref} hero={VIZ.dark}>
      <Heading eyebrow="Conversion · October 2026" title="Most teams that activate never pay" />
      <div className="absolute left-[120px] top-[360px]">
        <Waffle id="waffle" share={share} size={400} format={{ style: "percent", decimals: 1 }}
          label={<>of visitors sign up: {fmtNum(f[1].value)} of {fmtNum(f[0].value)}</>} />
      </div>
      <div className="absolute left-[1040px] top-[350px]">
        <Funnel id="funnel" stages={f} width={FW} rowH={ROW} gap={GAP} highlight={worst} />
        <Callout x={290} y={bottom + 34} tx={250 + (FW - 250) / 2} ty={barBottom} w={440}>
          Biggest drop: only <b>{fmtNum(conv[worst] * 100, { style: "percent" })}</b> of activated teams pay
        </Callout>
      </div>
    </SceneRoot>
  );
}

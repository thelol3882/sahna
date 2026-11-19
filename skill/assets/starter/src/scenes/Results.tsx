import { useScene } from "../deck";
import { Bento, BentoCard, FxScene, bentoIn, maskLines, odometer } from "../fx";
import { counter } from "../ui/kit";
import { DATA } from "../data";

/**
 * Content scene with two steps — the label and counter patterns:
 * entrance (→ s0): title, bento cards rise, the user count and growth roll (odometer: every style)
 * step 1 (→ s1): before/after bars grow from the baseline, values count
 * step 2 (→ s2): the conclusion card lights up (beam in showcase, hairline otherwise) and its ratio rolls
 */
const MAX = DATA.latency.before;
const BAR_H = 300;
const RATIO = Math.round(DATA.latency.before / DATA.latency.after);

export function Results() {
  const ref = useScene((tl, q) => {
    tl.from(q(".rs-eyebrow"), { y: 16, autoAlpha: 0, duration: 0.7, ease: "expo.out" }, 0);
    maskLines(tl, q(".rs-title")[0], 0.05);
    bentoIn(tl, q(".rs-grid")[0], 0.3, { formats: { b: (v) => `+${Math.round(v)}%` } });
    tl.addLabel("s0")
      .fromTo(q(".rs-bar"), { scaleY: 0 }, { scaleY: 1, duration: 0.9, stagger: 0.25, transformOrigin: "50% 100%", ease: "expo.out" }, "s0+=0.1");
    counter(tl, q(".rs-before")[0], DATA.latency.before, "s0+=0.1", { duration: 0.9 });
    counter(tl, q(".rs-after")[0], DATA.latency.after, "s0+=0.35", { duration: 0.9 });
    tl.addLabel("s1")
      // the card's content, not the card: bentoIn already tweens the card's autoAlpha in the entrance, and two tweens
      // on one property left the card lit at s0 after a press (and dim after a jump)
      .fromTo(q(".rs-callout > span"), { autoAlpha: 0.25 }, { autoAlpha: 1, duration: 0.6 }, "s1")
      .to(q(".rs-bar-after"), { backgroundColor: "var(--color-success)", duration: 0.4 }, "s1+=0.2");
    odometer(tl, q(".rs-ratio")[0], 1, RATIO, "s1+=0.1", { format: (v) => `${Math.round(v)}×`, duration: 1.2 });
    tl.addLabel("s2");
  });

  const bar = (v: number) => (v / MAX) * BAR_H;
  return (
    <FxScene ref={ref}>
      <div className="absolute left-[120px] top-[118px]">
        <span className="rs-eyebrow eyebrow">Results</span>
        <h1 className="rs-title h1 m-0 mt-5">Pages load four times faster</h1>
      </div>
      <Bento className="rs-grid absolute left-[120px] top-[360px] w-[1680px] h-[600px]" areas={["a c c d", "b c c d"]}>
        <BentoCard area="a" kind="stat" value={DATA.users.value} label={DATA.users.label} />
        <BentoCard area="b" kind="stat" value={DATA.growth.value} format={(v) => `+${Math.round(v)}%`} label="since spring" />
        <BentoCard area="c">
          <span className="body-m">{DATA.latency.label}, {DATA.latency.unit}</span>
          <div className="flex-1 flex items-end justify-around gap-10" style={{ borderBottom: "2px solid var(--color-line-strong)" }}>
            {[
              { cls: "rs-before", label: "before", color: "var(--color-line-strong)", v: DATA.latency.before, extra: "" },
              { cls: "rs-after", label: "after", color: "var(--color-primary)", v: DATA.latency.after, extra: "rs-bar-after" },
            ].map((b) => (
              <div key={b.cls} className="flex flex-col items-center gap-3 w-[180px]">
                <span className={`${b.cls} tnum text-[44px] font-semibold`}>0</span>
                <div className={`rs-bar ${b.extra} w-full rounded-t-[14px]`} style={{ height: bar(b.v), background: b.color }} />
              </div>
            ))}
          </div>
          <div className="flex justify-around pt-3 body-m">
            <span className="w-[180px] text-center">before</span>
            <span className="w-[180px] text-center">after</span>
          </div>
        </BentoCard>
        <BentoCard area="d" className="rs-callout" beam>
          <span className="rs-ratio fx-stat tnum mt-auto" style={{ color: "var(--color-primary)" }}>{RATIO}×</span>
          <span className="fx-card-label mt-5">faster at p95, measured under the same load</span>
        </BentoCard>
      </Bento>
    </FxScene>
  );
}

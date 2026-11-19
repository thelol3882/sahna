import { useScene } from "../deck";
import { FxScene } from "../fx";
import { CodeBlock, CodePanel, codeIn, codeSteps, type CodeStep } from "../code-scene";
import plan from "./code/plan.go?shiki";

/** Code scene: the routing call gets a deadline, then one request walks the happy path from the cache miss. */
// Line numbers = lines of code/plan.go as written (markers included).
const STEPS: CodeStep[] = [
  {
    focus: "9-24",
    title: "One plan per courier",
    body: "PlanRoute asks the cache, then the maps API for travel times, then solves. Nothing limits the maps call.",
  },
  {
    diff: true,
    focus: "10-17",
    title: "Give the maps call a deadline",
    body: "800 ms, then the courier gets the fallback plan instead of a spinner.",
  },
  {
    focus: null,
    run: [10, 13, 16, 17, 21, 22, 23],
    values: { 13: "miss", 17: "212 ms", 21: "14 stops", 23: "plan" },
    title: "Follow one request",
    body: "A cache miss, 212 ms at the maps API, solved and cached for the next courier on the same street.",
  },
];

export function Code() {
  const ref = useScene((tl, q) => {
    tl.from(q(".cd-eyebrow"), { y: 20, autoAlpha: 0, duration: 0.5 }, 0)
      .from(q(".cd-title"), { y: 40, autoAlpha: 0, duration: 0.8 }, 0.08);
    codeIn(tl, q, 0.3);
    tl.addLabel("s0", "+=0.1");
    codeSteps(tl, q, STEPS);
  });
  return (
    <FxScene ref={ref}>
      <div className="absolute left-[120px] top-[130px] right-[120px] flex flex-col gap-4">
        <span className="eyebrow cd-eyebrow">Code · routing</span>
        <h1 className="h1 cd-title m-0">Every outside call gets a deadline</h1>
      </div>
      <CodeBlock code={plan} lines={15} className="absolute left-[120px] top-[310px] w-[1180px]" />
      <CodePanel steps={STEPS} eyebrow="Step by step" intro={{ title: "PlanRoute", body: "The Go handler behind every courier's route." }}
        className="absolute left-[1340px] top-[310px] w-[460px] h-[681px]" />
    </FxScene>
  );
}

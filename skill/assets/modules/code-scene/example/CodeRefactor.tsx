// Example 2: a before/after file pair on a dark hero scene, scrolling inside a fixed viewport.
// Line refs use "b:" (numbers of the before file) and "a:" (numbers of the after file).
import { SceneRoot, useScene } from "../deck";
import { CodeBlock, codeIn, codeSteps, type CodeStep } from "../code-scene";
import orders from "./code/orders.before.ts.txt?after=./orders.after.ts.txt&shiki";

const STEPS: CodeStep[] = [
  { focus: "b:11-18" },                      // auto-scrolls the loop into view
  { diff: true, focus: "a:11-14" },          // the loop collapses into Promise.all
  { scrollTo: "a:10", focus: "a:15-21" },    // explicit scroll: sumTotals did not change
];

export function CodeRefactor() {
  const ref = useScene((tl, q) => {
    tl.from(q(".cr-title"), { y: 40, autoAlpha: 0, duration: 0.8 }, 0);
    codeIn(tl, q, 0.25);
    tl.addLabel("s0", "+=0.1");
    codeSteps(tl, q, STEPS);
  });
  return (
    <SceneRoot ref={ref} hero>
      <h1 className="h1 cr-title absolute left-[120px] top-[120px] m-0">Load orders in parallel</h1>
      <CodeBlock code={orders} lines={12} className="absolute left-[120px] top-[260px] w-[1300px]" />
    </SceneRoot>
  );
}

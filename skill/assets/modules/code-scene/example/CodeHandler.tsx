// Example code scene: a Go HTTP handler gets a context timeout.
// Copy to src/scenes/ and code/handler.go to src/scenes/code/; "../deck" is the starter's public API.
import { SceneRoot, useScene } from "../deck";
import { CodeBlock, CodePanel, codeIn, codeSteps, type CodeStep } from "../code-scene";
import handler from "./code/handler.go?shiki";

// Line numbers = lines of code/handler.go as written (markers included).
const STEPS: CodeStep[] = [
  {
    focus: "11-25",
    title: "One handler, one request",
    body: "GetUser reads the id, asks the database and writes JSON. Nothing limits how long the database may take.",
  },
  {
    diff: true,
    focus: "12-17",
    title: "Give the request a deadline",
    body: "context.WithTimeout cuts the call after 2 s. The database call now gets ctx, so it stops too.",
  },
  {
    focus: null,
    run: [12, 13, 14, 17, 18, 22, 24],
    values: { 12: "id = \"42\"", 17: "38 ms", 18: "err = nil", 24: "200 OK" },
    title: "Follow one request",
    body: "A normal request passes the error check and answers in 38 ms, far inside the budget.",
  },
  {
    diff: { add: [23] },
    type: 23,
    title: "Log what we served",
    body: "One structured log line per answer, with the id as a field.",
  },
];

export function CodeHandler() {
  const ref = useScene((tl, q) => {
    tl.from(q(".ch-eyebrow"), { y: 20, autoAlpha: 0, duration: 0.5 }, 0)
      .from(q(".ch-title"), { y: 40, autoAlpha: 0, duration: 0.8 }, 0.08);
    codeIn(tl, q, 0.3);
    tl.addLabel("s0", "+=0.1");
    codeSteps(tl, q, STEPS);
  });

  return (
    <SceneRoot ref={ref}>
      <div className="absolute left-[120px] top-[150px] right-[120px] flex flex-col gap-4">
        <span className="eyebrow ch-eyebrow">Code</span>
        <h1 className="h1 ch-title m-0">A handler needs a deadline</h1>
      </div>
      <CodeBlock code={handler} lines={14} className="absolute left-[120px] top-[330px] w-[1180px]" />
      <CodePanel
        steps={STEPS}
        eyebrow="Step by step"
        intro={{ title: "GetUser", body: "A plain Go handler from our API, as it was before the fix." }}
        className="absolute left-[1340px] top-[330px] w-[460px] h-[642px]"
      />
    </SceneRoot>
  );
}

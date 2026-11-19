import { SceneRoot, useScene, useSceneStep } from "../../deck";
import { Heading, enterHeading } from "../../ui/kit";
import { Captions, DiagramView, FailureNotes, QueueGauge, caption, diagramView, failure, recovery, story, useLive } from "../../diagram";
import { DARK, SAAS } from "./common";

/** Failure & recovery: s1 Mailgun fails, backlog grows, the worker retries with backoff; s2 Mailgun recovers, backlog drains. */
const VIEW = diagramView(SAAS, "pipeline", { region: { x: 120, y: 330, w: 1680, h: 380 } });
const G = VIEW.levels.pipeline.graph;
const Q = G.nodes.find((n) => n.id === "pq")!, M = G.nodes.find((n) => n.id === "pmail")!;
const OPTS = { id: "mail", node: "pmail", edge: "pw-pmail", from: "pw", queue: { id: "backlog", peak: 8420 }, retries: [1, 2, 4], focus: ["pbill", "pq", "pw", "pmail"] };

export function SaasFailure() {
  const step = useSceneStep();
  const ref = useScene((tl, q) => {
    enterHeading(tl, q);
    const d = story(tl, q, VIEW);
    tl.addLabel("s0", d.enter(0.3));
    caption(tl, q, 0, "s0");
    tl.addLabel("s1", failure(d, tl, q, OPTS, "s0+=0.1"));
    caption(tl, q, 1, "s1");
    tl.addLabel("s2", recovery(d, tl, q, { ...OPTS, flow: "deliver" }, "s1+=0.1"));
  });
  useLive(ref, VIEW, step, (live, s) => {
    if (s === 1) { live.flow("publish", { color: "accent" }); live.flow("publish", { at: 0.6, color: "accent" }); live.pulse("pmail", 1.0, "danger"); }
    if (s === 2) live.flow("deliver", { color: "success" });
  });
  return (
    <SceneRoot ref={ref} hero={DARK}>
      <DiagramView view={VIEW} overlays={{
        pipeline: <>
          <QueueGauge id="backlog" max={10000} label="backlog" style={{ left: Q.x + Q.w / 2 - 120, top: Q.y + Q.h + 28 }} />
          <FailureNotes id="mail" retries={OPTS.retries} style={{ left: M.x, top: M.y + M.h + 22 }} />
        </>,
      }}>
        <Captions items={["Mailgun times out: the worker retries with backoff and the queue absorbs the orders", "Mailgun is back: the backlog drains, no receipt is lost"]} />
      </DiagramView>
      <Heading eyebrow="Failure and recovery" title="When email is down, orders still go through" />
    </SceneRoot>
  );
}

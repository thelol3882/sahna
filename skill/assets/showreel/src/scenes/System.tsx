import { useScene, useSceneStep } from "../deck";
import { FxScene } from "../fx";
import { Heading, enterHeading } from "../ui/kit";
import { Captions, DiagramView, caption, diagramView, story, useLive } from "../diagram";
import { HALO } from "./common";

/**
 * Diagram journey: context (s0) → zoom into Halo, the containers (s1) → one order lights its path with numbered
 * hops (s2) → zoom into Routing, one plan inside the service (s3). Live packets run only while a step rests.
 */
const VIEW = diagramView(HALO, "context", { region: { x: 120, y: 380, w: 1680, h: 420 }, panel: { x: 60, y: 110, w: 1800, h: 820 } });

export function System() {
  const step = useSceneStep();
  const ref = useScene((tl, q) => {
    enterHeading(tl, q);
    const d = story(tl, q, VIEW);
    const e = d.enter(0.3);
    caption(tl, q, 0, e - 0.5);
    tl.addLabel("s0", e);
    tl.to(q(".h-eyebrow, .h-title"), { autoAlpha: 0, y: -12, duration: 0.3 }, "s0+=0.05");
    const sys = d.zoom("halo", "s0+=0.05");
    caption(tl, q, 1, sys.end - 0.6);
    tl.addLabel("s1", sys.end);
    const f = sys.story.flow("order", "s1+=0.1");
    caption(tl, q, 2, "s1+=0.1");
    tl.addLabel("s2", f);
    const routing = sys.story.zoom("routing", "s2+=0.05");
    caption(tl, q, 3, routing.end - 0.6);
    tl.addLabel("s3", routing.story.flow("plan", routing.end));
  });
  useLive(ref, VIEW, step, (live, s) => {
    if (s === 2) live.level("system").flow("order");
    if (s === 3) live.level("routing").flow("plan");
  });
  return (
    <FxScene ref={ref}>
      <DiagramView view={VIEW}>
        <Captions live={false} items={[
          "Level 1 · Halo and who uses it",
          "Level 2 · the containers inside Halo",
          "One order: created, stored, routed, answered in 11 hops",
          "Level 3 · inside Routing: one plan, cached for the next courier",
        ]} />
      </DiagramView>
      <Heading eyebrow="Architecture" title="From the whole platform to one service" />
    </FxScene>
  );
}

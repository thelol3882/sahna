import { SceneRoot, useScene, useSceneStep } from "../../deck";
import { Heading, enterHeading } from "../../ui/kit";
import { Captions, DiagramView, caption, diagramView, story, useLive } from "../../diagram";
import { AREA, DARK, SAAS } from "./common";

/** Flow ↔ sequence: s1 checkout on the graph, s2 the same journey as a sequence diagram, s3 back to the graph. */
const VIEW = diagramView(SAAS, "system", { region: AREA, seq: { checkout: { x: 120, y: 290, w: 1680, h: 640 } } });

export function SaasSequence() {
  const step = useSceneStep();
  const ref = useScene((tl, q) => {
    enterHeading(tl, q);
    const d = story(tl, q, VIEW);
    tl.addLabel("s0", d.enter(0.3));
    caption(tl, q, 0, "s0");
    tl.addLabel("s1", d.flow("checkout", "s0+=0.1"));
    caption(tl, q, 1, "s1");
    tl.addLabel("s2", d.toSequence("checkout", "s1+=0.1"));
    caption(tl, q, 2, "s2");
    tl.addLabel("s3", d.fromSequence("checkout", "s2+=0.1"));
  });
  useLive(ref, VIEW, step, (live, s) => {
    if (s === 1 || s === 3) live.flow("checkout");
    if (s === 2) live.seq("checkout");
  });
  return (
    <SceneRoot ref={ref} hero={DARK}>
      <DiagramView view={VIEW}>
        <Captions items={["Checkout on the map: where the request goes", "The same eight hops in time order: who waits for whom", "Back on the map"]} />
      </DiagramView>
      <Heading eyebrow="Checkout" title="One request, two views" />
    </SceneRoot>
  );
}

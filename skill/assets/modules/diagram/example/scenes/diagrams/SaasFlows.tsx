import { SceneRoot, useScene, useSceneStep } from "../../deck";
import { Heading, enterHeading } from "../../ui/kit";
import { Captions, DiagramView, caption, diagramView, story, useLive } from "../../diagram";
import { AREA, DARK, SAAS } from "./common";

/** Flows: s1 checkout (sync, numbered hops), s2 payment then async email (accent, parallel hop). */
const VIEW = diagramView(SAAS, "system", { region: AREA });

export function SaasFlows() {
  const step = useSceneStep();
  const ref = useScene((tl, q) => {
    enterHeading(tl, q);
    const d = story(tl, q, VIEW);
    tl.addLabel("s0", d.enter(0.3));
    caption(tl, q, 0, "s0");
    tl.addLabel("s1", d.flow("checkout", "s0+=0.1"));
    caption(tl, q, 1, "s1");
    tl.addLabel("s2", d.flow("paid", "s1+=0.1"));
  });
  useLive(ref, VIEW, step, (live, s) => {
    if (s === 1) live.flow("checkout");
    if (s === 2) live.flow("paid");
  });
  return (
    <SceneRoot ref={ref} hero={DARK}>
      <DiagramView view={VIEW}>
        <Captions items={["1 · Checkout: the gateway checks the token, Orders writes one row", "2 · Paid: Billing answers now, email and invoice happen later"]} />
      </DiagramView>
      <Heading eyebrow="Architecture" title="Two journeys through the shop" />
    </SceneRoot>
  );
}

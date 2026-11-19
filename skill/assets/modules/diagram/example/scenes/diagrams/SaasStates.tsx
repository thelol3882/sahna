import { SceneRoot, useScene } from "../../deck";
import { Heading, enterHeading } from "../../ui/kit";
import { Captions, DiagramView, Token, caption, diagramView, machine, story } from "../../diagram";
import { DARK, SAAS } from "./common";

/** State machine: s1 paid, s2 packing is blocked by a guard, s3 restocked → packed → shipped → delivered. */
const VIEW = diagramView(SAAS, "states", { region: { x: 120, y: 380, w: 1680, h: 420 } });

export function SaasStates() {
  const ref = useScene((tl, q) => {
    enterHeading(tl, q);
    const d = story(tl, q, VIEW);
    const m = machine(d, tl, q, { id: "order", start: "created" });
    tl.addLabel("s0", m.enter(d.enter(0.3) - 0.2));
    caption(tl, q, 0, "s0");
    tl.addLabel("s1", m.go("paid", "s0+=0.1"));
    caption(tl, q, 1, "s1");
    tl.addLabel("s2", m.go("packed", "s1+=0.1", { blocked: true }));
    caption(tl, q, 2, "s2");
    let t = m.go("packed", "s2+=0.1");
    t = m.go("shipped", t);
    t = m.go("delivered", t);
    m.color("success", t - 0.3);
    tl.addLabel("s3", t);
  });
  return (
    <SceneRoot ref={ref} hero={DARK}>
      <DiagramView view={VIEW} overlays={{ states: <Token id="order" label="Order #1042" graph={VIEW.levels.states.graph} at="created" /> }}>
        <Captions live={false} items={["[paid]: the payment guard passes", "[in stock]: blocked, the order waits in Paid", "Restocked: packed, shipped, delivered"]} />
      </DiagramView>
      <Heading eyebrow="Order lifecycle" title="Every state change passes a guard" />
    </SceneRoot>
  );
}

import { SceneRoot, useScene, useSceneStep } from "../../deck";
import { Heading, enterHeading } from "../../ui/kit";
import { Captions, DiagramView, caption, diagramView, story, useLive } from "../../diagram";
import { DARK, SAAS } from "./common";

/** C4 zoom: context → s1 containers (Acme Shop opens) → s2 components (Orders opens) + one request inside. */
const VIEW = diagramView(SAAS, "context", { region: { x: 120, y: 380, w: 1680, h: 420 }, panel: { x: 60, y: 110, w: 1800, h: 820 } });

export function SaasZoom() {
  const step = useSceneStep();
  const ref = useScene((tl, q) => {
    enterHeading(tl, q);
    const d = story(tl, q, VIEW);
    const e = d.enter(0.3);
    caption(tl, q, 0, e - 0.5);
    tl.addLabel("s0", e);
    tl.to(q(".h-eyebrow, .h-title"), { autoAlpha: 0, y: -12, duration: 0.3 }, "s0+=0.05");
    const sys = d.zoom("shop", "s0+=0.05");
    caption(tl, q, 1, sys.end - 0.6);
    tl.addLabel("s1", sys.end);
    const orders = sys.story.zoom("orders", "s1+=0.05");
    caption(tl, q, 2, orders.end - 0.6);
    tl.addLabel("s2", orders.story.flow("request", orders.end));
  });
  useLive(ref, VIEW, step, (live, s) => {
    if (s === 2) live.level("orders").flow("request");
  });
  return (
    <SceneRoot ref={ref} hero={DARK}>
      <DiagramView view={VIEW}>
        <Captions live={false} items={["Level 1 · the system and who uses it", "Level 2 · the containers inside Acme Shop", "Level 3 · the components inside Orders"]} />
      </DiagramView>
      <Heading eyebrow="Zoom · C4" title="From the whole shop to one service" />
    </SceneRoot>
  );
}

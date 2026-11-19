import { SceneRoot, useScene, useSceneStep } from "../../deck";
import { Heading, enterHeading } from "../../ui/kit";
import { Captions, DiagramView, Hud, caption, diagramView, liveRoundRobin, overload, scaleOut, story, useLive } from "../../diagram";
import { DARK, SAAS } from "./common";

/** Scale-out: s1 one instance under a spike (p95 climbs, red), s2 two replicas join behind the load balancer. */
const VIEW = diagramView(SAAS, "scale", { region: { x: 120, y: 290, w: 1680, h: 470 } });
const REPLICAS = ["api-2", "api-3"];

export function SaasScale() {
  const step = useSceneStep();
  const ref = useScene((tl, q) => {
    enterHeading(tl, q);
    const d = story(tl, q, VIEW);
    const e = d.enter(0.3, { hidden: REPLICAS });
    tl.from(q(".hud-scale"), { autoAlpha: 0, y: 20, duration: 0.5 }, e - 0.5);
    tl.addLabel("s0", e);
    caption(tl, q, 0, "s0");
    tl.addLabel("s1", overload(d, tl, q, { hud: "scale", node: "api-1", flow: "r1", stats: { rps: [0, 1200], p95: [90, 840] } }, "s0+=0.1"));
    caption(tl, q, 1, "s1");
    tl.addLabel("s2", scaleOut(d, tl, q, { hud: "scale", node: "api-1", replicas: REPLICAS, flows: ["r1", "r2", "r3"], stats: { rps: [1200, 3400], p95: [840, 120] } }, "s1+=0.1"));
  });
  useLive(ref, VIEW, step, (live, s) => {
    if (s === 1) { for (let i = 0; i < 4; i++) live.flow("r1", { at: i * 0.3, color: "danger", speed: 0.7 }); }
    if (s === 2) liveRoundRobin(live, ["r1", "r2", "r3"], "success");
  });
  return (
    <SceneRoot ref={ref} hero={DARK}>
      <DiagramView view={VIEW}>
        <Hud id="scale" stats={[{ key: "rps", label: "throughput", unit: "req/s" }, { key: "p95", label: "p95 latency", unit: "ms", initial: 90 }]} style={{ left: 120, top: 790 }} />
        <Captions items={["Black Friday: one API instance takes every request", "Two replicas join behind the load balancer"]} style={{ left: 760, top: 830, width: 1040 }} />
      </DiagramView>
      <Heading eyebrow="Scale-out" title="Three instances instead of one" />
    </SceneRoot>
  );
}

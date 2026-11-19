import { SceneRoot, useScene, useSceneStep } from "../../deck";
import { Heading, enterHeading } from "../../ui/kit";
import { DiagramView, Waterfall, diagramView, story, trace, useLive, type Span } from "../../diagram";
import { DARK, SAAS } from "./common";

/** Trace waterfall: s1 the checkout request, every span bar fills while the packet is inside that service. */
const VIEW = diagramView(SAAS, "checkout", { region: { x: 120, y: 290, w: 1680, h: 300 } });
const SPANS: Span[] = [
  { node: "cgw", name: "gateway", start: 0, dur: 182 },
  { node: "cauth", name: "auth · verify", start: 6, dur: 14, depth: 1 },
  { node: "corders", name: "orders · create", start: 26, dur: 148, depth: 1 },
  { node: "cpg", name: "postgres · INSERT", start: 61, dur: 41, depth: 2 },
];

export function SaasTrace() {
  const step = useSceneStep();
  const ref = useScene((tl, q) => {
    enterHeading(tl, q);
    const d = story(tl, q, VIEW);
    const e = d.enter(0.3);
    tl.from(q(".wf-checkout"), { autoAlpha: 0, y: 24, duration: 0.5 }, e - 0.4).addLabel("s0", e + 0.1);
    tl.addLabel("s1", trace(d, tl, q, { id: "checkout", flow: "checkout", spans: SPANS, total: 182 }, "s0+=0.1", { speed: 0.8 }));
  });
  useLive(ref, VIEW, step, (live, s) => { if (s === 1) live.flow("checkout", { speed: 0.8 }); });
  return (
    <SceneRoot ref={ref} hero={DARK}>
      <DiagramView view={VIEW}>
        <Waterfall id="checkout" spans={SPANS} total={182} title="trace 7f3a · POST /orders" width={1100} style={{ left: 410, top: 630 }} />
      </DiagramView>
      <Heading eyebrow="Observability" title="Where the 182 ms of a checkout go" />
    </SceneRoot>
  );
}

import { useScene } from "../deck";
import { FxScene } from "../fx";
import { Card, Heading, counter, enterHeading } from "../ui/kit";
import { DATA } from "../data";

/** Q&A backup slide (appendix): reached with / or Ctrl/Cmd+K, Esc returns to where you were. */
const ROWS = [
  ["Window", `${DATA.sla.window} from order to door`],
  ["Measured", "door scan minus order time, every delivery"],
  ["Late", "re-routed automatically, customer gets an SMS"],
];

export function BackupSla() {
  const ref = useScene((tl, q) => {
    enterHeading(tl, q);
    tl.from(q(".bs-row, .bs-p95"), { y: 24, autoAlpha: 0, duration: 0.5, stagger: 0.08 }, 0.35);
    counter(tl, q(".bs-n")[0], DATA.sla.p95, 0.5, { duration: 1 });
    tl.addLabel("s0");
  });
  return (
    <FxScene ref={ref}>
      <Heading eyebrow="Backup · SLA" title="How we count on time" />
      <Card className="bs-p95 absolute left-[120px] top-[380px] w-[440px] h-[520px] p-12 flex flex-col justify-end gap-3">
        <span className="pk-stat"><span className="bs-n tnum">0</span><span className="text-[48px]"> {DATA.sla.unit}</span></span>
        <span className="body-m">p95 door time, budget {DATA.sla.budget} {DATA.sla.unit}</span>
      </Card>
      <Card className="absolute left-[600px] right-[120px] top-[380px] px-12 py-6">
        {ROWS.map(([k, v], i) => (
          <div key={k} className="bs-row flex gap-12 py-8 text-[32px]" style={{ borderTop: i ? "1px solid var(--color-line)" : "none" }}>
            <span className="w-[220px] font-semibold">{k}</span>
            <span style={{ color: "var(--color-ink-2)" }}>{v}</span>
          </div>
        ))}
      </Card>
    </FxScene>
  );
}

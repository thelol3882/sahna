import { useScene } from "../deck";
import { FxScene } from "../fx";
import { Card, Heading, enterHeading } from "../ui/kit";
import { DATA } from "../data";

/** Q&A backup slide (appendix): reached with / or Ctrl/Cmd+K, Esc returns to where you were. */
const ROWS = [
  ["Tool", "k6, 200 virtual users, 10 min"],
  ["Traffic", "replayed from one production day"],
  ["Metric", "p95 full page load, 3 runs each"],
  ["Result", `${DATA.latency.before} → ${DATA.latency.after} ${DATA.latency.unit}`],
];

export function BackupMethod() {
  const ref = useScene((tl, q) => {
    enterHeading(tl, q);
    tl.from(q(".bm-row"), { y: 24, autoAlpha: 0, duration: 0.5, stagger: 0.08 }, 0.35).addLabel("s0");
  });
  return (
    <FxScene ref={ref}>
      <Heading eyebrow="Backup · method" title="How we measured the load time" />
      <Card className="absolute left-[120px] right-[120px] top-[380px] px-12 py-6">
        {ROWS.map(([k, v], i) => (
          <div key={k} className="bm-row flex gap-12 py-6 text-[32px]" style={{ borderTop: i ? "1px solid var(--color-line)" : "none" }}>
            <span className="w-[260px] font-semibold">{k}</span>
            <span style={{ color: "var(--color-ink-2)" }}>{v}</span>
          </div>
        ))}
      </Card>
    </FxScene>
  );
}

import { useScene } from "../deck";
import { FxScene } from "../fx";
import { Card, Heading, enterHeading } from "../ui/kit";

/** Backup slide (not in the world: it fades in flat over it). */
export function BackupLatency() {
  const ref = useScene((tl, q) => { enterHeading(tl, q); tl.from(q(".bk-card"), { y: 30, autoAlpha: 0, stagger: 0.1, duration: 0.5 }, 0.3); });
  const items = [
    ["Where", "Measured at the payer's SDK, tap to merchant answer, not inside our network"],
    ["Which", "p99 over 28 days, all regions, retries counted as one payment"],
    ["Not counted", "Settlement: it runs after the answer, on its own schedule"],
  ];
  return (
    <FxScene ref={ref}>
      <Heading eyebrow="Backup" title="How the 180 ms is measured" />
      <div className="absolute left-[120px] right-[120px] top-[400px] grid grid-cols-3 gap-8">
        {items.map(([k, v]) => (
          <Card key={k} className="bk-card p-10 flex flex-col gap-4"><span className="h2">{k}</span><span className="body-m">{v}</span></Card>
        ))}
      </div>
    </FxScene>
  );
}

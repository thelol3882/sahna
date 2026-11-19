import type { ReactNode } from "react";
import { PanelLight } from "./PanelLight";

/** Shared layout for the three ring stops: eyebrow + statement title on the left, one big number, content right. */
export function StopFrame({ eyebrow, title, big, unit, caption, children }: { eyebrow: string; title: ReactNode; big: string; unit: string; caption: string; children: ReactNode }) {
  return (
    <>
      <PanelLight x="12%" y="20%" />
      <div className="absolute left-[120px] top-[130px] w-[760px] flex flex-col gap-5">
        <span className="eyebrow h-eyebrow">{eyebrow}</span>
        <h1 className="h1 h-title m-0">{title}</h1>
      </div>
      <div className="st-big absolute left-[120px] top-[560px] w-[760px] flex flex-col gap-3">
        <div className="flex items-baseline gap-4">
          <span className="st-n tnum text-[200px] leading-[0.9] font-bold tracking-[-0.05em]" style={{ color: "var(--color-primary)" }}>{big}</span>
          <span className="text-[56px] font-semibold" style={{ color: "var(--color-ink-2)" }}>{unit}</span>
        </div>
        <span className="body-m">{caption}</span>
      </div>
      {children}
    </>
  );
}

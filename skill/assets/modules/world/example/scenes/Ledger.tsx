import { useScene } from "../deck";
import { FxScene } from "../fx";
import { enterHeading } from "../ui/kit";
import { PanelLight } from "./PanelLight";
import { LEDGER_WINDOW } from "./windows";

/**
 * entrance: three entries write in, the window to the level below appears
 * step 1: the sum checks to zero
 * The window rect is the one the world cuts open when the camera flies through it (src/scenes/world.ts).
 */
const ROWS = [
  { acc: "Payer wallet", side: "debit", v: "− 49.90" },
  { acc: "Merchant", side: "credit", v: "+ 48.40" },
  { acc: "Platform fees", side: "credit", v: "+ 1.50" },
];
const [WX, WY, WW, WH] = LEDGER_WINDOW;

export function Ledger() {
  const ref = useScene((tl, q) => {
    enterHeading(tl, q);
    tl.from(q(".lg-row"), { x: -30, autoAlpha: 0, duration: 0.5, stagger: 0.14 }, 0.4)
      .from(q(".lg-window"), { autoAlpha: 0, scale: 0.96, duration: 0.7 }, 0.7)
      .from(q(".lg-window-t > *"), { y: 14, autoAlpha: 0, duration: 0.5, stagger: 0.08 }, 0.95)
      .addLabel("s0")
      .from(q(".lg-sum"), { autoAlpha: 0, y: 16, duration: 0.5 }, "s0")
      .from(q(".lg-check"), { scale: 0, transformOrigin: "50% 50%", duration: 0.45, ease: "back.out(2.2)" }, "s0+=0.3")
      .addLabel("s1");
  });
  return (
    <FxScene ref={ref}>
      <PanelLight x="20%" y="15%" />
      <div className="absolute left-[120px] top-[130px] w-[1600px] flex flex-col gap-5">
        <span className="eyebrow h-eyebrow">Stop 3 · Ledger</span>
        <h1 className="h1 h-title m-0">The ledger writes every cent twice</h1>
      </div>
      <div className="absolute left-[120px] top-[400px] w-[880px] flex flex-col">
        <div className="flex justify-between pb-4 mono text-[20px] tracking-[0.08em] uppercase" style={{ color: "var(--color-muted)", borderBottom: "1px solid var(--color-line)" }}>
          <span>Account</span><span>EUR</span>
        </div>
        {ROWS.map((r) => (
          <div key={r.acc} className="lg-row flex justify-between items-baseline py-6" style={{ borderBottom: "1px solid var(--color-line)" }}>
            <span className="flex flex-col gap-1"><span className="text-[34px] font-semibold">{r.acc}</span><span className="mono text-[20px]" style={{ color: "var(--color-muted)" }}>{r.side}</span></span>
            <span className="tnum mono text-[38px]" style={{ color: r.side === "debit" ? "var(--color-ink)" : "var(--color-primary)" }}>{r.v}</span>
          </div>
        ))}
        <div className="lg-sum flex justify-between items-center pt-6">
          <span className="text-[30px] font-semibold">Sum of the entries</span>
          <span className="flex items-center gap-4">
            <span className="tnum mono text-[38px]">0.00</span>
            <span className="lg-check w-[48px] h-[48px] rounded-full flex items-center justify-center text-[28px] font-bold" style={{ background: "var(--color-success)", color: "var(--color-canvas)" }}>✓</span>
          </span>
        </div>
      </div>
      <div className="lg-window absolute rounded-[6px] overflow-hidden" data-world-window
        style={{ left: WX, top: WY, width: WW, height: WH, border: "2px solid var(--color-primary)", background: "linear-gradient(180deg, var(--color-primary-soft), var(--color-sunken))" }}>
        <div className="lg-window-t absolute inset-0 p-10 flex flex-col justify-end gap-3">
          <span className="mono text-[20px] tracking-[0.1em] uppercase" style={{ color: "var(--color-primary-ink)" }}>One level down ↓</span>
          <span className="text-[40px] font-bold tracking-[-0.02em]">Inside the ledger</span>
          <span className="body-m">the storage engine that makes the write safe</span>
        </div>
      </div>
      <span className="absolute mono text-[20px]" style={{ left: WX, top: WY - 44, color: "var(--color-muted)" }}>WINDOW · NEXT STOP</span>
    </FxScene>
  );
}

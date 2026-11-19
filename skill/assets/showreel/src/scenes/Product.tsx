import { Bell, LayoutGrid, Map as MapIcon, Settings, Truck } from "lucide-react";
import { useScene } from "../deck";
import { DeviceFrame, FxScene, Grain, Spotlight, deviceIn, flatten, maskLines, odometer, spotlightTo } from "../fx";
import { DATA } from "../data";

/**
 * Product: the "Dispatch board" card lands top left (shared element: it is not animated here); a tilted browser
 * rises in. Step 1: it flattens (sheen). Step 2: a spotlight inside the app finds the late courier, a callout rolls
 * the delay.
 */
const ROWS = [
  { id: "0388", city: "Astana", stops: 14, eta: 18, max: 30 },
  { id: "0417", city: "Almaty", stops: 11, eta: 46, max: 30, late: true },
  { id: "0502", city: "Shymkent", stops: 9, eta: 22, max: 30 },
  { id: "0611", city: "Karaganda", stops: 12, eta: 27, max: 30 },
  { id: "0725", city: "Aktobe", stops: 8, eta: 15, max: 30 },
];

export function Product() {
  const ref = useScene((tl, q) => {
    maskLines(tl, q(".pd-title")[0], 0.3);
    tl.from(q(".pd-lede"), { y: 20, autoAlpha: 0, duration: 0.9, ease: "expo.out" }, 0.6);
    deviceIn(tl, q(".pd-device")[0], 0.35);
    tl.fromTo(q(".pd-bar"), { scaleX: 0 }, { scaleX: 1, transformOrigin: "0% 50%", duration: 0.8, stagger: 0.08, ease: "expo.out" }, 1.0)
      .addLabel("s0");
    flatten(tl, q(".pd-device")[0], "s0", { duration: 1.5 });
    tl.addLabel("s1");
    spotlightTo(tl, q(".pd-spot")[0], ".pd-late", "s1", { pad: 18 });
    tl.fromTo(q(".pd-callout"), { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.8, ease: "expo.out" }, "s1+=0.45");
    odometer(tl, q(".pd-eta")[0], DATA.late.promised, DATA.late.eta, "s1+=0.55", { format: (v) => `${Math.round(v)} min`, laps: 1 });
    tl.addLabel("s2");
  });

  return (
    <FxScene ref={ref}>
      <Grain />
      <div className="absolute left-[120px] top-[140px] w-[540px]">
        <div data-shared="board" className="fx-card !p-7 h-[150px]">
          <span className="fx-eyebrow">Dispatch board</span>
          <span className="fx-card-title mt-auto">Who is late, and why</span>
        </div>
        <h2 className="pd-title fx-title m-0 mt-12 text-[64px]">See the late order before the customer does</h2>
        <p className="pd-lede fx-lede m-0 mt-8">Every courier, every stop, with a live ETA against the promised window.</p>
      </div>
      <DeviceFrame className="pd-device absolute left-[720px] top-[140px]" kind="browser" width={1080} height={620} url="dispatch.halo.example/almaty">
        <AppUI />
      </DeviceFrame>
      <div className="pd-callout fx-card absolute left-[1240px] top-[766px] w-[560px] !p-8" style={{ boxShadow: "var(--shadow-lg)" }}>
        <div className="flex items-baseline gap-4">
          <span className="pd-eta fx-display text-[60px]" style={{ color: "var(--color-danger)" }}>{DATA.late.eta} min</span>
          <span className="text-[24px] leading-[1.3]" style={{ color: "var(--color-ink-2)" }}>against a {DATA.late.promised}-minute promise</span>
        </div>
        <p className="m-0 mt-3 text-[22px]" style={{ color: "var(--color-muted)" }}>{DATA.late.courier} · Halo re-routes two stops</p>
      </div>
    </FxScene>
  );
}

function AppUI() {
  const nav = [
    { i: <LayoutGrid size={18} />, t: "Overview" },
    { i: <Truck size={18} />, t: "Couriers", on: true },
    { i: <MapIcon size={18} />, t: "Map" },
    { i: <Bell size={18} />, t: "Alerts" },
    { i: <Settings size={18} />, t: "Settings" },
  ];
  return (
    <div className="absolute inset-0 flex text-[18px]" style={{ background: "var(--color-canvas)", color: "var(--color-ink)" }}>
      <aside className="w-[210px] shrink-0 p-5 flex flex-col gap-1" style={{ borderRight: "1px solid var(--color-line)", background: "var(--color-sunken)" }}>
        <div className="flex items-center gap-3 px-2 pb-6 pt-1 font-semibold text-[20px]" style={{ fontFamily: "var(--font-display)" }}>
          <span className="block w-[22px] h-[22px] rounded-full" style={{ background: "radial-gradient(circle at 35% 30%, var(--fx-glow-2), var(--fx-glow))" }} />Halo
        </div>
        {nav.map((n) => (
          <div key={n.t} className="flex items-center gap-3 rounded-[10px] px-3 py-[9px]"
            style={{ background: n.on ? "var(--color-surface)" : undefined, color: n.on ? "var(--color-ink)" : "var(--color-muted)", boxShadow: n.on ? "inset 0 0 0 1px var(--color-line)" : undefined }}>
            {n.i}{n.t}
          </div>
        ))}
      </aside>
      <main className="flex-1 p-8">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[18px]" style={{ color: "var(--color-muted)" }}>Couriers / evening wave</div>
            <div className="mt-1 text-[28px] font-semibold tracking-[-0.02em]" style={{ fontFamily: "var(--font-display)" }}>54 routes · 5 shown</div>
          </div>
          <span className="rounded-full px-4 py-[6px] text-[18px] font-medium" style={{ background: "var(--color-accent)", color: "var(--color-on-accent)" }}>1 at risk</span>
        </div>
        <div className="mt-7 rounded-[14px] overflow-hidden" style={{ border: "1px solid var(--color-line)", background: "var(--color-surface)" }}>
          <div className="grid grid-cols-[200px_1fr_90px] px-5 py-3 text-[18px] tracking-[0.06em] uppercase" style={{ color: "var(--color-muted)", borderBottom: "1px solid var(--color-line)" }}>
            <span>Courier</span><span>ETA vs window</span><span className="text-right">ETA</span>
          </div>
          {ROWS.map((r) => (
            <div key={r.id} className={`grid grid-cols-[200px_1fr_90px] items-center px-5 h-[62px] ${r.late ? "pd-late" : ""}`} style={{ borderBottom: "1px solid var(--color-line)" }}>
              <span className="text-[19px]" style={{ color: r.late ? "var(--color-ink)" : "var(--color-ink-2)" }}>{r.id} · {r.city}</span>
              <span className="relative h-[14px]">
                <span className="absolute top-0 h-full rounded-full" style={{ left: 0, width: `${(r.max / 50) * 100}%`, background: "var(--color-sunken)" }} />
                <span className="pd-bar absolute top-0 h-full rounded-full" style={{
                  left: 0, width: `${(r.eta / 50) * 100}%`,
                  background: r.late ? "var(--color-accent)" : "color-mix(in srgb, var(--color-primary) 70%, transparent)",
                }} />
              </span>
              <span className="text-right tnum text-[18px]" style={{ color: r.late ? "var(--color-ink)" : "var(--color-muted)", fontWeight: r.late ? 700 : 400 }}>{r.eta} min</span>
            </div>
          ))}
        </div>
      </main>
      <Spotlight className="pd-spot" />
    </div>
  );
}

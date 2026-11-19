import { MapPin } from "lucide-react";
import { useScene } from "../deck";
import { Bento as Grid, BentoCard, BeamPath, DotGrid, FxScene, ProtagonistSlot, bentoIn, glowTo, maskLines, protagonist } from "../fx";
import { DATA } from "../data";
import { P } from "./states";

/**
 * Bento: cards rise, the two stats roll (odometers, every style), the dot grid glows under the first stat, and the
 * orb flies from the hero into the live-map card as its hub. Step 1: the glow moves to the map, routes draw, beams
 * run along them. The "Dispatch board" card carries data-shared="board": on → it flies into the next scene.
 */
const HUB = { x: 414, y: 310 };
const STOPS = [{ x: 120, y: 150, t: "Kostanay" }, { x: 150, y: 470, t: "Aktobe" }, { x: 700, y: 140, t: "Pavlodar" }, { x: 720, y: 470, t: "Almaty" }];
const route = (s: { x: number; y: number }) => `M ${HUB.x} ${HUB.y} C ${(HUB.x + s.x) / 2} ${HUB.y}, ${(HUB.x + s.x) / 2} ${s.y}, ${s.x} ${s.y}`;

export function Bento() {
  const ref = useScene((tl, q) => {
    protagonist.start(tl, q, P.hero);
    tl.from(q(".bn-eyebrow"), { y: 16, autoAlpha: 0, duration: 0.7, ease: "expo.out" }, 0);
    maskLines(tl, q(".bn-title")[0], 0.05);
    bentoIn(tl, q(".bn-grid")[0], 0.35, { formats: { b: (v) => `${v.toFixed(1)}%` } });
    protagonist.to(tl, P.bentoHub, 0.15, { duration: 1.6, ease: "expo.inOut" });
    glowTo(tl, q(".bn-dots")[0], ".bn-a", 0.6);
    tl.addLabel("s0");
    glowTo(tl, q(".bn-dots")[0], ".bn-c", "s0");
    tl.fromTo(q(".lm-route"), { drawSVG: "0%" }, { drawSVG: "100%", duration: 0.9, stagger: 0.08, ease: "power2.inOut" }, "s0+=0.1")
      .fromTo(q(".lm-stop"), { autoAlpha: 0, scale: 0.8, transformOrigin: "50% 50%" }, { autoAlpha: 1, scale: 1, duration: 0.6, stagger: 0.06, ease: "expo.out" }, "s0+=0.4")
      .fromTo(q(".lm-beams"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5 }, "s0+=0.9")
      .addLabel("s1");
  });

  return (
    <FxScene ref={ref}>
      <DotGrid className="bn-dots" />
      <div className="absolute left-[120px] top-[118px]">
        <span className="bn-eyebrow fx-eyebrow"><span className="fx-chip-dot" />Today</span>
        <h2 className="bn-title fx-title m-0 mt-5">One dispatch for every courier</h2>
      </div>
      <Grid className="bn-grid absolute left-[120px] top-[330px] w-[1680px] h-[630px]" areas={["a b c c", "d e c c"]}>
        <BentoCard area="a" kind="stat" className="bn-a" value={DATA.today.deliveries} label="deliveries today" />
        <BentoCard area="b" kind="stat" value={DATA.today.onTime} format={(v) => `${v.toFixed(1)}%`} label="on time, inside the 2-hour window" />
        <BentoCard area="c" className="bn-c">
          <svg className="absolute inset-0" viewBox="0 0 828 630" width="100%" height="100%" aria-hidden style={{ willChange: "transform" }}>
            {STOPS.map((s) => <path key={s.t} className="lm-route" d={route(s)} fill="none" stroke="var(--color-line-strong)" strokeWidth={2} />)}
            <g className="lm-beams">
              {STOPS.map((s, i) => <BeamPath key={s.t} d={route(s)} base={false} diagram speed={2.2 + i * 0.35} still={0.4 + i * 0.15} />)}
            </g>
            {STOPS.map((s) => (
              <g key={s.t} className="lm-stop">
                <circle cx={s.x} cy={s.y} r={9} fill="var(--color-primary)" />
                <text x={s.x} y={s.y + 40} textAnchor="middle" fontSize={20} fill="var(--color-ink-2)" style={{ fontFamily: "var(--font-display)" }}>{s.t}</text>
              </g>
            ))}
            <text x={HUB.x} y={HUB.y + 104} textAnchor="middle" fontSize={20} fill="var(--color-muted)" style={{ fontFamily: "var(--font-display)" }}>Astana hub</text>
          </svg>
          <div className="relative mt-auto">
            <div className="fx-card-title">Live map</div>
            <div className="fx-card-label mt-2">{DATA.today.couriers.toLocaleString("en-US")} couriers, every position every 2 s</div>
          </div>
        </BentoCard>
        <BentoCard area="d" kind="icon" icon={<MapPin size={30} strokeWidth={2} />} title={`${DATA.today.cities} cities`} body="from one hub in Astana" />
        <BentoCard area="e" shared="board" className="bn-board">
          <span className="fx-eyebrow">Dispatch board</span>
          <span className="fx-card-title mt-auto">Who is late, and why</span>
        </BentoCard>
      </Grid>
      <ProtagonistSlot />
    </FxScene>
  );
}

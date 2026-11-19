import { SceneRoot, useScene } from "../deck";
import { Heading, enterHeading } from "../ui/kit";
import { DATA } from "../data";
import { BarRace, GeoMap, LOCALE, VIZ, barRaceIn, mapFill, mapIn, mapPins, mapRoutes, t, vizEl, type MapData, type MapPlace } from "../data-viz";
import kz from "../data-viz/maps/kz.map.json";
import { KZ_BOUNDARY_NOTE, KZ_CITIES, KZ_REGIONS } from "../data-viz/maps/kz.names";

/**
 * Kazakhstan map. s0: the country · s1: regions fill by share of orders (+ top-5 list)
 * s2: pins drop on the hub and the cities it serves · s3: delivery routes draw from the hub
 */
const DIR: Record<string, MapPlace["dir"]> = { almaty: "b", shymkent: "b", aktau: "r", atyrau: "r", aktobe: "t", kostanay: "t", pavlodar: "r", oskemen: "b", karaganda: "r" };
export function KzMap() {
  const k = DATA.kz;
  const name = (id: string) => t(KZ_REGIONS[id].merged ?? KZ_REGIONS[id].short, LOCALE);
  const top = Object.entries(k.share).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const places: MapPlace[] = [
    { id: k.hub, label: t(KZ_CITIES[k.hub]), hub: true, dir: "t" },
    ...k.served.map((id) => ({ id, label: t(KZ_CITIES[id]), dir: DIR[id] ?? "r" })),
  ];
  const ref = useScene((tl, q) => {
    const map = vizEl(q, "kz"), list = vizEl(q, "top");
    enterHeading(tl, q);
    mapIn(tl, map, 0.4);
    tl.set(q(".kz-side"), { autoAlpha: 0 }, 0);
    tl.addLabel("s0");
    mapFill(tl, map, "s0");
    tl.to(q(".kz-side"), { autoAlpha: 1, duration: 0.3 }, "s0+=0.4");
    barRaceIn(tl, list, "s0+=0.5", { style: "percent", decimals: 1 });
    tl.addLabel("s1");
    mapPins(tl, map, "s1");
    tl.addLabel("s2");
    mapRoutes(tl, map, "s2");
    tl.addLabel("s3");
  });
  return (
    <SceneRoot ref={ref} hero={VIZ.dark}>
      <Heading eyebrow={t({ en: "Kazakhstan · October 2026", ru: "Казахстан · октябрь 2026", kk: "Қазақстан · 2026 жылғы қазан" })}
        title={t({ en: "One hub in Astana serves nine cities", ru: "Хаб в Астане — девять городов", kk: "Астанадағы хаб — тоғыз қала" })} />
      <div className="absolute left-[80px] top-[320px]">
        <GeoMap id="kz" map={kz as MapData} width={1060} values={k.share} breaks={[2, 4, 8, 15]} format={{ style: "percent" }}
          legendTitle={t({ en: "Share of orders", ru: "Доля заказов", kk: "Тапсырыс үлесі" })}
          places={places} routes={k.served.map((to) => ({ from: k.hub, to }))} />
      </div>
      <div className="kz-side absolute left-[1200px] top-[340px] w-[600px] flex flex-col gap-6">
        <span className="viz-sub font-semibold" style={{ color: "var(--viz-ink-2, var(--color-ink-2))" }}>
          {t({ en: "Top 5 regions, share of orders", ru: "Топ-5 регионов, доля заказов", kk: "Үздік 5 өңір, тапсырыс үлесі" })}
        </span>
        <BarRace id="top" entities={top.map(([id]) => ({ key: id, label: name(id) }))} frames={[{ label: "", values: Object.fromEntries(top) }]}
          width={600} height={330} format={{ style: "percent", decimals: 1 }} color="var(--viz-hi)" nameW={300} valW={100} nameSize={20} rowGap={18} />
        <span className="viz-source" style={{ color: "var(--viz-muted, var(--color-muted))" }}>{t(KZ_BOUNDARY_NOTE)}</span>
      </div>
    </SceneRoot>
  );
}

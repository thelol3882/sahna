import { useScene, useSceneStep } from "../deck";
import { FxScene, style } from "../fx";
import { Heading, enterHeading } from "../ui/kit";
import { Captions, DiagramView, RowsTable, caption, diagramView, liveTenants, story, tenantIsolation, useLive, type Tenant, type TenantRow } from "../diagram";
import { HALO } from "./common";

/** Tenant kit: two merchants run the same query; the database filters by tenant; each sees only its rows. */
const VIEW = diagramView(HALO, "tenancy", { region: { x: 100, y: 360, w: 1240, h: 420 } });
// tenant colours carry the hop badges' text: deep on light scenes (white text), light on the showcase dark canvas
const DARK_CANVAS = style === "showcase";
const TENANTS: Tenant[] = [
  { id: "a", name: "Nomad Books", color: DARK_CANVAS ? "#7FA6FF" : "#2F5FD0", flow: "a" },
  { id: "b", name: "Steppe Flowers", color: DARK_CANVAS ? "#FFAE5C" : "#A84C08", flow: "b" },
];
const ROWS: TenantRow[] = [
  { tenant: "a", text: "#1042 · 3 books" }, { tenant: "b", text: "#2210 · tulips" }, { tenant: "a", text: "#1043 · atlas" },
  { tenant: "b", text: "#2211 · roses" }, { tenant: "b", text: "#2212 · peonies" }, { tenant: "a", text: "#1044 · gift card" },
];

export function Tenants() {
  const step = useSceneStep();
  const ref = useScene((tl, q) => {
    enterHeading(tl, q);
    const d = story(tl, q, VIEW);
    const e = d.enter(0.3);
    tl.from(q(".rt-tenancy"), { autoAlpha: 0, x: 30, duration: 0.5 }, e - 0.4).addLabel("s0", e + 0.1);
    caption(tl, q, 0, "s0");
    tl.addLabel("s1", tenantIsolation(d, tl, q, { id: "tenancy", tenants: TENANTS, rows: ROWS, db: "tpg" }, "s0+=0.1"));
  });
  useLive(ref, VIEW, step, (live, s) => {
    if (s === 1) liveTenants(live, (sel) => Array.from(ref.current!.querySelectorAll(sel)), { id: "tenancy", tenants: TENANTS, db: "tpg" });
  });
  return (
    <FxScene ref={ref}>
      <DiagramView view={VIEW}>
        <RowsTable id="tenancy" tenants={TENANTS} rows={ROWS} title="table orders · shared" style={{ left: 1400, top: 300 }} />
        <Captions items={["Both merchants run the same query; the database adds WHERE tenant_id = …"]} />
      </DiagramView>
      <Heading eyebrow="Multi-tenancy" title="One table, and each merchant sees only its rows" />
    </FxScene>
  );
}

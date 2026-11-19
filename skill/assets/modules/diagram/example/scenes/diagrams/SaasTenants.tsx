import { SceneRoot, useScene, useSceneStep } from "../../deck";
import { Heading, enterHeading } from "../../ui/kit";
import { Captions, DiagramView, RowsTable, caption, diagramView, liveTenants, story, tenantIsolation, useLive, type Tenant, type TenantRow } from "../../diagram";
import { DARK, SAAS } from "./common";

/** Tenant isolation: s1 tenant A, then tenant B, each sees only its rows; end state lists both counts. */
const VIEW = diagramView(SAAS, "tenancy", { region: { x: 100, y: 360, w: 1240, h: 420 } });
const TENANTS: Tenant[] = [
  { id: "a", name: "Acme Coffee", color: "#2F6FE4", flow: "a" },
  { id: "b", name: "Zhel Cycles", color: "#E0740F", flow: "b" },
];
const ROWS: TenantRow[] = [
  { tenant: "a", text: "#1042 · latte beans" }, { tenant: "b", text: "#2210 · bike pump" }, { tenant: "a", text: "#1043 · grinder" },
  { tenant: "b", text: "#2211 · helmet" }, { tenant: "b", text: "#2212 · chain" }, { tenant: "a", text: "#1044 · filters" },
];

export function SaasTenants() {
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
    <SceneRoot ref={ref} hero={DARK}>
      <DiagramView view={VIEW}>
        <RowsTable id="tenancy" tenants={TENANTS} rows={ROWS} title="table orders · shared" style={{ left: 1400, top: 300 }} />
        <Captions items={["Both tenants run the same query; the database adds WHERE tenant_id = …"]} />
      </DiagramView>
      <Heading eyebrow="Multi-tenancy" title="One table, and each shop sees only its rows" />
    </SceneRoot>
  );
}

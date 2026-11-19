import type { CSSProperties } from "react";
import { Lock } from "lucide-react";
import type { Live } from "../live";
import type { At, Story } from "../story";
import { resolveAt, count } from "../story";

/**
 * Tenant isolation: the same journey for two (or more) tenants in their own colours; when a tenant's request reaches
 * the database, the shared table filters to that tenant's rows (others dim behind a lock). The end state lists
 * "<tenant> sees N of M rows" for every tenant — the point of the scene, readable on paper.
 */
export type Tenant = { id: string; name: string; color: string; flow: string };
export type TenantRow = { tenant: string; text: string };

export function RowsTable({ id, tenants, rows, title = "one table for all tenants", policy = "row-level security", style }: {
  id: string; tenants: Tenant[]; rows: TenantRow[]; title?: string; policy?: string; style?: CSSProperties;
}) {
  const colorOf = (t: string) => tenants.find((x) => x.id === t)?.color ?? "var(--dg-sub)";
  return (
    <div className={`rt rt-${id}`} style={{ position: "absolute", width: 400, padding: 18, borderRadius: 20, background: "var(--dg-node-bg)", border: "var(--dg-node-border)", boxShadow: "var(--dg-node-shadow)", color: "var(--dg-ink)", display: "flex", flexDirection: "column", gap: 7, ...style }}>
      <span className="rt-policy" style={{ display: "inline-flex", alignItems: "center", gap: 8, alignSelf: "flex-start", borderRadius: 999, padding: "4px 14px", fontSize: 19, fontWeight: 600, whiteSpace: "nowrap", background: "color-mix(in srgb, var(--dg-flow-primary) 14%, transparent)", color: "var(--dg-flow-primary)" }}>
        <Lock size={17} /> {policy}
      </span>
      <span style={{ font: "500 18px var(--font-mono)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--dg-sub)", margin: "4px 0 2px" }}>{title}</span>
      {rows.map((r, i) => (
        <div key={i} className={`rt-row rt-row-${r.tenant}`} data-i={i} style={{ position: "relative", display: "flex", alignItems: "center", gap: 12, height: 38, padding: "0 12px", borderRadius: 10, fontSize: 20, background: `color-mix(in srgb, ${colorOf(r.tenant)} 11%, transparent)` }}>
          <span className="rt-glow" style={{ position: "absolute", inset: 0, borderRadius: 10, opacity: 0, boxShadow: `0 0 0 2px ${colorOf(r.tenant)}` }} />
          <span style={{ width: 11, height: 11, borderRadius: 99, background: colorOf(r.tenant), flex: "none" }} />
          <span className="mono" style={{ whiteSpace: "nowrap" }}>{r.text}</span>
          <Lock className="rt-lock" size={18} style={{ position: "absolute", right: 12, opacity: 0, color: "var(--dg-sub)" }} />
        </div>
      ))}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
        {tenants.map((t) => (
          <div key={t.id} className={`rt-sum rt-sum-${t.id}`} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 20, fontWeight: 600, whiteSpace: "nowrap", color: t.color, opacity: 0 }}>
            <span style={{ width: 12, height: 12, borderRadius: 99, background: t.color }} />
            {t.name} sees <span className="rt-n tnum">0</span> of {rows.length} rows
          </div>
        ))}
      </div>
    </div>
  );
}

/** Scene timeline: each tenant's journey in turn; the table filters on arrival at `db`. Returns the end time. */
export function tenantIsolation(d: Story, tl: gsap.core.Timeline, q: (s: string) => Element[], { id, tenants, rows, db }: { id: string; tenants: Tenant[]; rows: TenantRow[]; db: string }, at: At) {
  let t = resolveAt(tl, at);
  const all = q(`.rt-${id} .rt-row`), locks = q(`.rt-${id} .rt-lock`);
  tenants.forEach((tn, k) => {
    t = d.flow(tn.flow, t, {
      color: tn.color,
      onHop: (_i, arrive, hop) => {
        if (hop.to !== db || hop.reply) return;
        tl.to(all, { opacity: (i: number) => (rows[i].tenant === tn.id ? 1 : 0.28), duration: 0.3 }, arrive)
          .to(locks, { opacity: (i: number) => (rows[i].tenant === tn.id ? 0 : 1), duration: 0.3 }, arrive)
          .fromTo(q(`.rt-${id} .rt-sum-${tn.id}`), { opacity: 0, x: -10 }, { opacity: 1, x: 0, duration: 0.3, immediateRender: false }, arrive + 0.1);
        count(tl, q(`.rt-${id} .rt-sum-${tn.id} .rt-n`)[0], 0, rows.filter((r) => r.tenant === tn.id).length, arrive + 0.1, { duration: 0.5 });
      },
    }) + (k < tenants.length - 1 ? 0.3 : 0);
  });
  // end state: every row visible again, the summary lines stay
  tl.to(all, { opacity: 1, duration: 0.4 }, t).to(locks, { opacity: 0, duration: 0.3 }, t);
  return t + 0.4;
}

/** Live: the tenants' journeys alternate in their colours; matching rows glow when a packet reaches the table. */
export function liveTenants(live: Live, q: (s: string) => Element[], { id, tenants, db }: { id: string; tenants: Tenant[]; db: string }) {
  let t = 0;
  for (const tn of tenants) {
    const glow = q(`.rt-${id} .rt-row-${tn.id} .rt-glow`);
    const end = live.flow(tn.flow, { at: t, color: tn.color });
    // the glow lands roughly when the packet reaches the db (half-way through the round trip)
    void db;
    live.tl.fromTo(glow, { opacity: 0 }, { keyframes: { opacity: [0, 1, 1, 0] }, duration: 1.2, ease: "none", immediateRender: false }, t + (end - t) * 0.5 - 0.2);
    t = end + 0.4;
  }
  return t;
}

import type { CSSProperties, ReactNode } from "react";
import { allow } from "./dial";
import { Beam } from "./light";
import { odometer, type OdometerOpts } from "./kinetic";
import { plus, type At, type TL } from "./util";

/* ================================================================== Bento */

/**
 * Bento grid with named areas. `areas` = one string per row ("a a b", "c d b"); `cols`/`rows` = CSS track lists.
 * Children are <BentoCard area="a" …>. Give the grid an absolute position and size in the scene.
 */
export function Bento({ areas, cols, rows, gap = 24, children, className = "", style }: {
  areas: string[]; cols?: string; rows?: string; gap?: number; children: ReactNode; className?: string; style?: CSSProperties;
}) {
  const n = areas[0].trim().split(/\s+/).length;
  return (
    <div className={`fx-bento ${className}`} style={{
      gridTemplateAreas: areas.map((r) => `"${r}"`).join(" "),
      gridTemplateColumns: cols ?? `repeat(${n}, minmax(0, 1fr))`,
      gridTemplateRows: rows ?? `repeat(${areas.length}, minmax(0, 1fr))`,
      gap, ...style,
    }}>
      {children}
    </div>
  );
}

type CardBase = {
  area: string;
  className?: string;
  style?: CSSProperties;
  /** a traveling light on the border (light allowed; otherwise a lit top hairline) */
  beam?: boolean | { diagram?: boolean; twin?: boolean; speed?: number };
  /** this card opens into the next scene (container transform, SKILL §5): sets data-expand-source */
  expand?: boolean;
  /** shared-element key: the same key on an element of the next scene morphs between them (data-shared) */
  shared?: string;
  children?: ReactNode;
};

type StatCard = CardBase & { kind: "stat"; value: number; from?: number; format?: (v: number) => string; label: ReactNode; note?: ReactNode; odo?: OdometerOpts };
type TextCard = CardBase & { kind: "text"; eyebrow?: ReactNode; title: ReactNode; body?: ReactNode };
type IconCard = CardBase & { kind: "icon"; icon: ReactNode; title: ReactNode; body?: ReactNode };
type ImageCard = CardBase & { kind: "image"; src?: string; alt?: string; art?: ReactNode; title?: ReactNode; body?: ReactNode };
type PlainCard = CardBase & { kind?: undefined };
export type BentoCardProps = StatCard | TextCard | IconCard | ImageCard | PlainCard;

/**
 * One bento card. Kinds:
 * - stat: big rolling number (odometer, data-odometer) + label + optional note;
 * - text: eyebrow + title + body;  - icon: icon tile + title + body;
 * - image: full-bleed image (`src`) or drawn `art`, caption at the bottom;
 * - no kind: your own children.
 * Run bentoIn() for the entrance; it also rolls every stat.
 */
export function BentoCard(p: BentoCardProps) {
  const marks: Record<string, string> = {};
  if (p.expand) marks["data-expand-source"] = "";
  if (p.shared) marks["data-shared"] = p.shared;
  const beam = p.beam ? (typeof p.beam === "object" ? p.beam : {}) : null;
  const beamOn = !!beam;
  let inner: ReactNode = p.children;
  if (p.kind === "stat") {
    inner = (
      <>
        <span className="fx-stat tnum" data-odometer="" data-from={p.from ?? 0} data-to={p.value}
          data-format={p.format ? "fn" : ""}>{(p.format ?? ((v: number) => Math.round(v).toLocaleString("en-US")))(p.value)}</span>
        <span className="fx-card-label mt-5">{p.label}</span>
        {p.note && <span className="mt-auto pt-6">{p.note}</span>}
        {p.children}
      </>
    );
  } else if (p.kind === "text") {
    inner = (
      <>
        {p.eyebrow && <span className="fx-eyebrow mb-4">{p.eyebrow}</span>}
        <span className="fx-card-title">{p.title}</span>
        {p.body && <span className="fx-card-label mt-4">{p.body}</span>}
        {p.children}
      </>
    );
  } else if (p.kind === "icon") {
    inner = (
      <>
        <span className="fx-icon-tile">{p.icon}</span>
        <span className="mt-auto fx-card-title">{p.title}</span>
        {p.body && <span className="fx-card-label mt-3">{p.body}</span>}
        {p.children}
      </>
    );
  } else if (p.kind === "image") {
    inner = (
      <>
        <div className="absolute inset-0">
          {p.src ? <img src={p.src} alt={p.alt ?? ""} className="w-full h-full object-cover" /> : p.art}
        </div>
        <div className="relative mt-auto">
          {p.title && <div className="fx-card-title">{p.title}</div>}
          {p.body && <div className="fx-card-label mt-2">{p.body}</div>}
        </div>
        {p.children}
      </>
    );
  }
  return (
    <div className={`fx-card fx-bento-card ${beamOn ? "fx-has-beam" : ""} ${p.className ?? ""}`} style={{ gridArea: p.area, ...p.style }} {...marks}>
      {beamOn ? <div className="absolute inset-0 rounded-[inherit] overflow-hidden flex flex-col p-[inherit]">{inner}</div> : inner}
      {beam && <Beam radius={28} diagram={beam.diagram} twin={beam.twin} speed={beam.speed} />}
    </div>
  );
}

/**
 * Bento entrance: cards rise in a soft stagger (by grid position), then every stat card's number rolls.
 * Pass `format` per stat with odometers(); a stat with a custom format needs it there (functions are not in the DOM).
 */
export function bentoIn(tl: TL, grid: Element | undefined, at: At = 0, { stagger = 0.07, roll = true, formats = {} as Record<string, (v: number) => string> } = {}) {
  if (!grid) return tl;
  const cards = Array.from(grid.querySelectorAll<HTMLElement>(".fx-bento-card"));
  // order by visual position: top-to-bottom, then left-to-right
  const order = cards.map((c) => ({ c, r: c.getBoundingClientRect() })).sort((a, b) => a.r.top - b.r.top || a.r.left - b.r.left).map((o) => o.c);
  const kinetic = allow("kinetic");
  tl.fromTo(order, { y: kinetic ? 36 : 20, autoAlpha: 0, scale: kinetic ? 0.985 : 1 },
    { y: 0, autoAlpha: 1, scale: 1, duration: 0.9, ease: "expo.out", stagger }, at);
  if (roll) {
    order.forEach((c, i) => {
      const el = c.querySelector<HTMLElement>("[data-odometer]");
      if (!el) return;
      const key = c.style.gridArea.split("/")[0].trim();
      odometer(tl, el, +el.dataset.from!, +el.dataset.to!, plus(at, 0.25 + i * stagger), { format: formats[key] });
    });
  }
  return tl;
}

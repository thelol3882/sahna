import { allow, style } from "../fx/dial";

/**
 * How charts behave on the dial. Same data, same steps in every style; only finish and extras change.
 * academic: light, flat fills, calm counters (no odometer spin), no glow/beams/particles.
 * balanced: gradient fills on bars, glow on the highlighted series, one odometer spin.
 * showcase: dark content scenes, light beams along lines and routes, particles on milestones, two spins.
 */
export const VIZ = {
  style,
  dark: allow("darkContent"),
  fx: style !== "academic",
  beams: style === "showcase",
  particles: style === "showcase",
  spins: style === "academic" ? 0 : style === "balanced" ? 1 : 2,
  countDur: style === "academic" ? 0.9 : style === "balanced" ? 1.3 : 1.6,
  ease: style === "academic" ? "power2.out" : "power3.out",
};

/** className for a chart root: tokens + dial finish */
export const vizClass = (extra = "") => `viz ${VIZ.fx ? "viz-fx" : ""} ${extra}`.trim();

/** categorical slot colour (1-based, fixed order). Use for entities, never for ranks. */
export const slot = (i: number) => `var(--viz-s${((i - 1) % 6) + 1})`;

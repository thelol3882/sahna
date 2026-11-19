/**
 * World authoring. A world lists where each scene panel sits (centre position in stage px, yaw/pitch in deg)
 * and, optionally, which camera move leads INTO a scene. Layout helpers place panels so authors do not
 * hand-place everything; parts are merged with world(...). Scenes not listed (backup slides) are not in the
 * world: they fade in flat over it.
 *
 *   export const WORLD = world(
 *     path(["cover", "relay"], { start: [0, 0, 0], step: [0, 0, -4200] }),
 *     ring("core", ["edge", "risk", "ledger"], { center: [0, 0, -13000], radius: 3400, arc: 80 }),
 *     room("inside", "ledger", { window: [1080, 560, 700, 380], depth: 2600, drop: 1600 }),
 *     { moves: { end: "survey" } },
 *   );
 */
import { add, rotate, type Vec3 } from "./math";

export type MoveKind = "auto" | "dolly" | "orbit" | "drop" | "rise" | "window" | "survey" | "fade";
/** window rect on the parent panel, stage px of that panel: [left, top, width, height] (≥ 400 × 240) */
export type Rect = [number, number, number, number];

export type Placement = {
  pos: Vec3;
  yaw?: number;
  pitch?: number;
  /** ring group: moves between panels of one group orbit its centre */
  group?: string;
  /** a room behind a window of another panel (fly-through move) */
  room?: { of: string; window: Rect; depth: number; drop: number };
};

export type WorldDef = {
  panels: Record<string, Placement>;
  groups: Record<string, { center: Vec3 }>;
  /** camera move INTO a scene (default "auto": orbit inside a group, window into a room, drop/rise for level changes, else dolly) */
  moves: Record<string, MoveKind>;
  /** 2.5D layout for the balanced style: panel centres on one plane; missing = automatic strip */
  flat?: Record<string, [number, number]>;
  /** the opening shot starts this far in front of the first panel (and this high) */
  intro?: { distance?: number; rise?: number; duration?: number };
  /** comfort mode by default (slower turns, no pitch sway, big turns become a fade); ?comfort forces it */
  comfort?: boolean;
};

type Part = Partial<WorldDef> & { rooms?: { id: string; of: string; window: Rect; depth: number; drop: number }[] };

/** Panels one after another along a line (dolly path). `turn` adds yaw per panel for a gentle curve. */
export function path(ids: string[], o: { start?: Vec3; step?: Vec3; yaw?: number; turn?: number } = {}): Part {
  const start = o.start ?? [0, 0, 0], step = o.step ?? [0, 0, -4200];
  const panels: Record<string, Placement> = {};
  ids.forEach((id, i) => {
    panels[id] = { pos: add(start, [step[0] * i, step[1] * i, step[2] * i]), yaw: (o.yaw ?? 0) + (o.turn ?? 0) * i };
  });
  return { panels };
}

/**
 * Panels on the outer arc of a circle around `center`, facing outward; the camera orbits outside the ring.
 * arc = total spread in deg (centred on yaw0). radius ≥ 1100 / sin(arc / (2·(n−1))) keeps 1920-wide panels apart.
 */
export function ring(group: string, ids: string[], o: { center: Vec3; radius?: number; arc?: number; yaw0?: number }): Part {
  const n = ids.length, arc = o.arc ?? 80, r = o.radius ?? 3400, y0 = o.yaw0 ?? 0;
  const panels: Record<string, Placement> = {};
  ids.forEach((id, i) => {
    const yaw = y0 + (n === 1 ? 0 : -arc / 2 + (arc * i) / (n - 1));
    panels[id] = { pos: add(o.center, rotate(yaw, 0, [0, 0, r])), yaw, group };
  });
  return { panels, groups: { [group]: { center: o.center } } };
}

/** Panels on a helix around `center` (faces outward, `rise` px per panel, `turn` deg per panel). */
export function spiral(ids: string[], o: { center: Vec3; radius?: number; turn?: number; rise?: number; yaw0?: number; group?: string }): Part {
  const r = o.radius ?? 3600, turn = o.turn ?? 40, rise = o.rise ?? -900;
  const panels: Record<string, Placement> = {};
  ids.forEach((id, i) => {
    const yaw = (o.yaw0 ?? 0) + turn * i;
    panels[id] = { pos: add(add(o.center, [0, rise * i, 0]), rotate(yaw, 0, [0, 0, r])), yaw, group: o.group };
  });
  return { panels, groups: o.group ? { [o.group]: { center: o.center } } : {} };
}

/** Panels on a flat grid facing the viewer (z constant). */
export function grid(ids: string[], o: { origin?: Vec3; cols?: number; gap?: [number, number] } = {}): Part {
  const origin = o.origin ?? [0, 0, 0], cols = o.cols ?? 3, [gx, gy] = o.gap ?? [360, 320];
  const panels: Record<string, Placement> = {};
  ids.forEach((id, i) => {
    panels[id] = { pos: add(origin, [(i % cols) * (1920 + gx), Math.floor(i / cols) * (1080 + gy), 0]), yaw: 0 };
  });
  return { panels };
}

/**
 * A room behind a window of panel `of`: the panel sits `depth` px behind the window centre (along `of`'s normal)
 * and `drop` px lower (positive = down a level). The move into it flies through the window.
 */
export function room(id: string, of: string, o: { window: Rect; depth?: number; drop?: number }): Part {
  return { rooms: [{ id, of, window: o.window, depth: o.depth ?? 2600, drop: o.drop ?? 0 }] };
}

/** Merge parts into a world (rooms are resolved against their parent panels). */
export function world(...parts: Part[]): WorldDef {
  const w: WorldDef = { panels: {}, groups: {}, moves: {} };
  const rooms: NonNullable<Part["rooms"]> = [];
  for (const p of parts) {
    Object.assign(w.panels, p.panels ?? {});
    Object.assign(w.groups, p.groups ?? {});
    Object.assign(w.moves, p.moves ?? {});
    if (p.flat) w.flat = { ...(w.flat ?? {}), ...p.flat };
    if (p.intro) w.intro = p.intro;
    if (p.comfort !== undefined) w.comfort = p.comfort;
    rooms.push(...(p.rooms ?? []));
  }
  for (const r of rooms) {
    const parent = w.panels[r.of];
    if (!parent) throw new Error(`world: room "${r.id}" needs panel "${r.of}" first`);
    const yaw = parent.yaw ?? 0, pitch = parent.pitch ?? 0;
    const [x, y, ww, hh] = r.window;
    const wc = add(parent.pos, rotate(yaw, pitch, [x + ww / 2 - 960, y + hh / 2 - 540, 0]));
    const pos = add(add(wc, rotate(yaw, pitch, [0, 0, -r.depth])), [0, r.drop, 0]);
    w.panels[r.id] = { pos, yaw, pitch, room: { of: r.of, window: r.window, depth: r.depth, drop: r.drop } };
  }
  return w;
}

/** Automatic 2.5D strip for the balanced style: main scenes left → right; a room sits below its parent. */
export function autoFlat(order: string[], def: WorldDef): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  const GX = 1920 + 420, GY = 1080 + 380, COLS = 4;
  let col = 0, row = 0;
  for (const id of order) {
    const p = def.panels[id];
    if (!p) continue;
    if (p.room && out[p.room.of]) {
      const [px, py] = out[p.room.of];
      out[id] = [px, py + GY];
      continue;
    }
    if (col >= COLS) { col = 0; row += 2; }
    // a scene after a room continues on the room's row, to its right
    out[id] = [col * GX, row * GY];
    col++;
  }
  return out;
}

// import the layout helpers directly (not "../world"): the runtime imports the scene list
import { path, ring, room, world } from "../world/layout";
import { LEDGER_WINDOW } from "./windows";

/**
 * Where every scene panel sits (stage px; y DOWN, z toward the viewer; yaw in deg, + turns the panel's face to +x).
 * Opening shot from far in front of the cover → dolly to the route → into the ring of three (orbit) →
 * through the ledger's window, one level down → rise to the results → out to the overview and in to the end.
 * Backup slides are not listed: they fade in flat over the world.
 */
export const WORLD = world(
  path(["cover"], { start: [0, 0, 0] }),
  { panels: { relay: { pos: [2700, -160, -3600], yaw: -14 } } },
  ring("core", ["edge", "risk", "ledger"], { center: [5200, 0, -10600], radius: 3100, arc: 78, yaw0: -4 }),
  room("inside", "ledger", { window: LEDGER_WINDOW, depth: 2500, drop: 1600 }),
  { panels: {
    results: { pos: [10200, -320, -9200], yaw: 22 },
    end: { pos: [8400, -240, -2600], yaw: -24 },
  } },
  { moves: { end: "survey" }, intro: { distance: 9000, rise: 1400, duration: 2.6 } },
);

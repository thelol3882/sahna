// Spatial world module: CSS 3D scene panels + a GSAP camera rig (+ optional three.js depth layer).
export { World, installWorld, type WorldMode } from "./World";
export { world, path, ring, spiral, grid, room, autoFlat, type WorldDef, type Placement, type MoveKind, type Rect } from "./layout";
export { NORMAL, COMFORT, type Comfort } from "./camera";
export type { Vec3, Pose } from "./math";

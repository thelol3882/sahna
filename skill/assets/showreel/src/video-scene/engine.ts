/**
 * The ONE place that ties this module to the deck engine. The starter exports all of this from "../deck"
 * (src/deck/index.ts), so with the module at src/video-scene/ nothing needs changing. For another engine,
 * point the path at it; it must export SceneRoot, useScene, useSceneActive, useDeckControl, the Hold and
 * MediaState types, and a `deckRuntime` object ({ seeking, exporting, print }) that the engine sets while it
 * jumps/seeks, exports or prints (the video never starts then).
 */
export { SceneRoot, useDeckControl, useScene, useSceneActive, deckRuntime } from "../deck";
export type { Hold, MediaState } from "../deck";

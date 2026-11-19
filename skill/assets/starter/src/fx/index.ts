// Creative FX kit: import from "../fx". Every component asks the dial (allow) and degrades when not allowed.
import "./fx.css";
export { style, locale, allow, intensity, isDark, loopsMayRun, type Style, type Locale, type Feature, type Where } from "./dial";
export { maskLines, decode, odometer, weight, type OdometerOpts } from "./kinetic";
export { Beam, BeamPath, Spotlight, spotlightTo, spotlightOff, DotGrid, glowTo, Aurora } from "./light";
export { Parallax, Layer, camera, Glass, Grain, DeviceFrame, flatten, deviceIn, type Camera, type Tilt } from "./depth";
export { Bento, BentoCard, bentoIn, type BentoCardProps } from "./layout";
export { protagonist, ProtagonistSlot, SHAPES, type PState, type Shape } from "./protagonist";
export { FxScene } from "./scene";
export { rectIn, useLoop, plus } from "./util";

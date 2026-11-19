import { isDark } from "../fx";
import type { LayoutFile } from "../diagram";
import HALO_JSON from "../graphs/halo.layout.json";

export const HALO = HALO_JSON as unknown as LayoutFile;
/** content scenes follow the dial: dark only in showcase (DIAL.md darkContent) */
export const DARK = isDark("content");

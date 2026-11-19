import { allow } from "../../fx/dial";
import type { LayoutFile } from "../../diagram";
import SAAS_JSON from "../../graphs/saas.layout.json";

export const SAAS = SAAS_JSON as unknown as LayoutFile;
/** showcase: content scenes are dark (DIAL.md darkContent) */
export const DARK = allow("darkContent");
/** the diagram area under a Heading, above the caption line */
export const AREA = { x: 120, y: 300, w: 1680, h: 620 };

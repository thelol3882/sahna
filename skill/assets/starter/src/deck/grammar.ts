import { scenes } from "../scenes";
import { allow, style } from "../fx/dial";
import { DECK } from "./config";
import { isShader, SHADER_FALLBACK } from "./shader";
import type { EnterKind, ShaderKind } from "./transitions";
import { MAIN } from "./util";

/**
 * Which forward transition plays INTO each main scene, decided once at load (deterministic: rehearsal = talk).
 *
 * 1. request = `?tr=<id>:<kind>` (try-out link) > scene meta `enter` > DECK.enter[id] > the style's default grammar
 * 2. the outgoing scene's `exit.through` asks for a through-zoom
 * 3. the dial degrades what the style does not allow: shader → nearest overlay → push (boundary) / rise
 *
 * Default grammar (no request):
 *   academic  section or speaker change → push, else rise
 *   balanced  speaker change → wipe (split into a hero scene), section change → push, else rise
 *   showcase  speaker change → liquid / waves / dissolve in turn (max 3), then wipe; section change → circle; else rise
 * Shared elements (data-shared in both scenes) turn a DEFAULT choice into a morph; an explicit kind keeps its
 * cover and the shared elements fly above it.
 */
export type Plan = {
  /** what plays; "morph" is decided later by the director when shared elements exist */
  kind: EnterKind;
  /** through-zoom: selector inside the outgoing scene (+ plate colour) */
  through?: { sel: string; color?: string };
  /** the kind came from meta / DECK.enter / ?tr (a default kind may become a morph) */
  explicit: boolean;
  /** human-readable reason, for the dev table and the docs */
  why: string;
};

const SHADER_TURN: ShaderKind[] = ["liquid", "waves", "dissolve"];
const BASIC = new Set<EnterKind>(["rise", "push", "fade"]);

function urlRequests(): Record<string, EnterKind> {
  const out: Record<string, EnterKind> = {};
  const v = typeof location !== "undefined" ? new URLSearchParams(location.search).get("tr") : null;
  for (const part of (v ?? "").split(",")) {
    const [id, kind] = part.split(":");
    if (id && kind) out[id] = kind as EnterKind;
  }
  return out;
}

function build(): Map<number, Plan> {
  const plans = new Map<number, Plan>();
  const url = urlRequests();
  let throughs = 0, shaders = 0;
  for (let m = 1; m < MAIN.length; m++) {
    const from = scenes[MAIN[m - 1]], to = scenes[MAIN[m]];
    const spk = (from.speaker ?? "") !== (to.speaker ?? "");
    const sec = (from.section ?? "") !== (to.section ?? "");
    const boundary = spk || sec;
    const asked = url[to.id] ?? to.enter ?? DECK.enter[to.id];
    const notes: string[] = [];

    const thr = from.exit?.through;
    if (thr && !url[to.id]) {
      if (allow("throughZoom") && (style !== "balanced" || throughs === 0)) {
        throughs++;
        plans.set(MAIN[m], { kind: asked ?? "zoom", through: { sel: thr, color: from.exit?.color }, explicit: true, why: `through ${thr}` });
        continue;
      }
      notes.push(style === "balanced" ? "2nd through-zoom → zoom" : "through-zoom off → zoom");
    }

    let kind: EnterKind;
    let explicit = true;
    if (asked) kind = asked;
    else if (thr) kind = "zoom";
    else {
      explicit = false;
      if (style === "academic") kind = boundary ? "push" : "rise";
      else if (style === "balanced") kind = spk ? (to.hero ? "split" : "wipe") : sec ? "push" : "rise";
      else kind = spk ? (shaders < SHADER_TURN.length ? SHADER_TURN[shaders] : "wipe") : sec ? "circle" : "rise";
      notes.push("default");
    }

    if (isShader(kind)) {
      if (!allow("shader")) { notes.push(`${kind} → ${SHADER_FALLBACK[kind]}`); kind = SHADER_FALLBACK[kind]; }
      else if (++shaders > 3 && import.meta.env.DEV) console.warn(`transition into "${to.id}": more than 3 shader transitions in one talk`);
    }
    if (!BASIC.has(kind) && (!allow("overlayTransitions") || (style === "balanced" && !boundary))) {
      const k2: EnterKind = boundary ? "push" : "rise";
      notes.push(`${kind} → ${k2} (${allow("overlayTransitions") ? "not at a speaker/section change" : style})`);
      kind = k2;
    }
    plans.set(MAIN[m], { kind, explicit, why: notes.join("; ") || "as asked" });
  }
  return plans;
}

export const PLANS = build();

/** plan for the forward step into main scene index `to` (scenes[] index) */
export const planInto = (to: number): Plan => PLANS.get(to) ?? { kind: "rise", explicit: false, why: "not a main-flow step" };

if (import.meta.env.DEV) {
  console.info(`[transitions] style=${style}`);
  console.table([...PLANS].map(([i, p]) => ({ into: scenes[i].id, kind: p.through ? `through ${p.through.sel}` : p.kind, why: p.why })));
}

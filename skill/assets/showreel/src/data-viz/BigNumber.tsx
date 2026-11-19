import type { ReactNode } from "react";
import { Odometer, odometerIn } from "./Odometer";
import { vizClass } from "./theme";
import { $$, fitTo, type At, type TL } from "./util";

/**
 * One stat that fills the stage, a context line under it, and a card it later shrinks into.
 * Place it as a direct child of the scene (it is a full-stage layer). `card` is where the number lands
 * (stage px); `cardLabel` is what the card says once the number sits in it.
 *
 *   <BigNumber id="signups" text={fmtNum(DATA.launch.signups.value)} context="teams signed up in launch week"
 *     card={{ left: 120, top: 330, width: 520, height: 300 }} cardLabel="sign-ups, launch week" />
 *   bigNumberIn(tl, root, 0.3)          // entrance: digits roll, context rises
 *   bigNumberToCard(tl, root, "s0")     // next step: context leaves, number flies into the card
 */
export function BigNumber({ id, text, context, eyebrow, card, cardLabel, cardExtra, size = 300 }: {
  id: string; text: string; context: ReactNode; eyebrow?: ReactNode;
  card: { left: number; top: number; width: number; height: number }; cardLabel: ReactNode; cardExtra?: ReactNode; size?: number;
}) {
  const cardSize = Math.round(Math.min(card.height * 0.42, (card.width - 96) / Math.max(4, text.length * 0.62)));
  return (
    <div data-viz={id} className={vizClass("absolute inset-0 pointer-events-none")}>
      {/* the card the number lands in; the slot holds an invisible copy at card size (measured, never shown) */}
      <div className="bn-card viz-card absolute" style={{ left: card.left, top: card.top, width: card.width, height: card.height }}>
        <div className="absolute left-[48px] top-[44px] right-[48px] flex flex-col gap-3">
          <span data-measure className="bn-slot font-bold tracking-[-0.04em] leading-none self-start invisible" style={{ fontSize: cardSize }} aria-hidden>
            <Odometer text={text} />
          </span>
          <span className="bn-card-label body-m" style={{ color: "var(--viz-ink-2)" }}>{cardLabel}</span>
          {cardExtra && <div className="bn-card-extra">{cardExtra}</div>}
        </div>
      </div>
      <div className="bn-stage absolute inset-0 flex flex-col items-center justify-center gap-6">
        {eyebrow && <span className="bn-eyebrow eyebrow">{eyebrow}</span>}
        <span className="bn-num font-bold tracking-[-0.05em] leading-none" style={{ fontSize: size, color: "var(--viz-ink)" }}>
          <Odometer text={text} />
        </span>
        <span className="bn-context text-[40px] leading-[1.25] font-semibold text-center max-w-[1300px]" style={{ color: "var(--viz-ink-2)" }}>{context}</span>
      </div>
    </div>
  );
}

export function bigNumberIn(tl: TL, root: Element, at: At) {
  const num = $$(root, ".bn-num")[0];
  tl.set($$(root, ".bn-card, .bn-card-label, .bn-card-extra"), { autoAlpha: 0 }, 0);
  tl.fromTo($$(root, ".bn-eyebrow"), { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.5 }, at);
  tl.fromTo(num, { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: 0.6 }, at);
  odometerIn(tl, num, at);
  tl.fromTo($$(root, ".bn-context"), { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: 0.7 }, typeof at === "number" ? at + 0.9 : `${at}+=0.9`);
  return tl;
}

/** The number shrinks into its card (shared-element move); the card frame and label appear around it. */
export function bigNumberToCard(tl: TL, root: Element, at: At, duration = 1.0) {
  const num = $$(root, ".bn-num")[0] as HTMLElement;
  const slot = $$(root, ".bn-slot")[0] as HTMLElement;
  tl.to($$(root, ".bn-context, .bn-eyebrow"), { autoAlpha: 0, y: -20, duration: 0.35, ease: "power2.in" }, at);
  fitTo(tl, num, slot, root as HTMLElement, at, { duration });
  const after = typeof at === "number" ? at + duration * 0.45 : `${at}+=${duration * 0.45}`;
  tl.fromTo($$(root, ".bn-card"), { autoAlpha: 0, scale: 0.94, transformOrigin: "50% 50%" }, { autoAlpha: 1, scale: 1, duration: 0.6 }, after)
    .fromTo($$(root, ".bn-card-label, .bn-card-extra"), { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.08 }, `<0.25`);
  return tl;
}

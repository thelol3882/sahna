import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { SplitText } from "gsap/SplitText";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";
import { MorphSVGPlugin } from "gsap/MorphSVGPlugin";
import { Observer } from "gsap/Observer";
import { CustomEase } from "gsap/CustomEase";

gsap.registerPlugin(useGSAP, DrawSVGPlugin, SplitText, MotionPathPlugin, MorphSVGPlugin, Observer, CustomEase);
gsap.defaults({ ease: "power3.out", duration: 0.7 });
// transition eases: quart-like in-out with a long settle (covers, camera moves), expo-like out (arrivals), steep in (dives)
CustomEase.create("deck.inOut", "0.76,0,0.24,1");
CustomEase.create("deck.out", "0.16,1,0.3,1");
CustomEase.create("deck.in", "0.7,0,0.84,0");

/** OS setting, or `?motion=reduce` in the link (handy for testing). */
export const reducedMotion = () =>
  typeof window !== "undefined" &&
  (window.matchMedia("(prefers-reduced-motion: reduce)").matches || new URLSearchParams(location.search).get("motion") === "reduce");

export { gsap, useGSAP, DrawSVGPlugin, SplitText, MotionPathPlugin, MorphSVGPlugin, Observer, CustomEase };

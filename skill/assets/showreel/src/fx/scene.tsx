import type { ReactNode } from "react";
import { SceneRoot } from "../deck";
import { isDark } from "./dial";

/**
 * SceneRoot that follows the dial: kind "hero" (cover, end) is dark from balanced up, kind "content" only in
 * showcase. Dark scenes are `.scene.hero` and take the dark token block of theme.css (or the pack's). In the scene meta set
 * `hero: isDark("hero")` / `hero: isDark("content")` so the footer and step bars switch to their light-on-dark look.
 */
export function FxScene({ kind = "content", children, className = "", ref }: { kind?: "hero" | "content"; children: ReactNode; className?: string; ref?: React.Ref<HTMLDivElement> }) {
  const dark = isDark(kind);
  return <SceneRoot ref={ref} hero={dark} className={className}>{children}</SceneRoot>;
}

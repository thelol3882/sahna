import type { CSSProperties, ReactNode } from "react";
import "./video-scene.css";

/**
 * Frames that make deck stills look like the demo video (ported from the reference ui.tsx, brand-neutral):
 * use them on the scenes around the video, so screenshots and the video read as one product, and as the
 * card a `{ kind: "card" }` intro opens from (give the frame a className and pass that selector).
 * Plain CSS + theme tokens; no Tailwind utility can fight a GSAP transform on them.
 */

/** One-line caption pill at the bottom (the style of captions burned into the video). */
export function Caption({ children, className = "", bottom = 112, style }: { children: ReactNode; className?: string; bottom?: number; style?: CSSProperties }) {
  return (
    <div className={`vs-caption ${className}`} style={{ bottom, ...style }}>
      <span><i aria-hidden />{children}</span>
    </div>
  );
}

/** Browser window around a screenshot. `src` is an imported image (gets inlined in the single file). */
export function BrowserFrame({ src, width, url, className = "", style }: { src: string; width: number; url?: string; className?: string; style?: CSSProperties }) {
  return (
    <div className={`vs-browser ${className}`} style={{ width, ...style }}>
      <div className="vs-browser-bar"><i /><i /><i />{url && <span>{url}</span>}</div>
      <img src={src} alt="" draggable={false} />
    </div>
  );
}

/** Phone around a screenshot, sized by height. */
export function PhoneFrame({ src, height, className = "", style }: { src: string; height: number; className?: string; style?: CSSProperties }) {
  return (
    <div className={`vs-phone ${className}`} style={{ height, ...style }}>
      <div><img src={src} alt="" draggable={false} /></div>
    </div>
  );
}

import type { CSSProperties, ReactNode } from "react";
import { allow, intensity } from "./dial";
import type { At, TL } from "./util";

/* ================================================================== Parallax */

/**
 * Layers at different depths, moved by a virtual camera per step (camera()), never by the mouse.
 * depth 0 = fixed (far), 1 = moves fully with the camera (near). Showcase: on; balanced: only with `hero`;
 * academic: layers stay put (camera() does nothing).
 */
export function Parallax({ children, hero = false, className = "", style }: { children: ReactNode; hero?: boolean; className?: string; style?: CSSProperties }) {
  return (
    <div className={`fx-parallax absolute inset-0 overflow-hidden ${className}`} data-parallax={allow("parallax", { hero }) ? "on" : "off"} style={style}>
      {children}
    </div>
  );
}

export function Layer({ depth, children, className = "", style }: { depth: number; children?: ReactNode; className?: string; style?: CSSProperties }) {
  return <div className={`fx-layer absolute inset-0 ${className}`} data-depth={depth} style={style}>{children}</div>;
}

export type Camera = { x?: number; y?: number; zoom?: number };
const cams = new WeakMap<Element, Required<Camera>>();

/**
 * Move the parallax camera to {x, y, zoom} at `at` (stage px; zoom 1 = none). Each layer moves by -camera × depth
 * and scales by 1 + (zoom − 1) × depth. Chained with fromTo from the previous camera of this Parallax, so it is
 * reversible and seek-safe. The first call in a scene sets the start camera instantly if `duration` is 0.
 */
export function camera(tl: TL, root: Element | undefined, cam: Camera, at: At, { duration = 1.6, ease = "power2.inOut" } = {}) {
  if (!root || root.getAttribute("data-parallax") !== "on") return tl;
  const prev = cams.get(root) ?? { x: 0, y: 0, zoom: 1 };
  const next = { x: cam.x ?? prev.x, y: cam.y ?? prev.y, zoom: cam.zoom ?? prev.zoom };
  cams.set(root, next);
  const k = 0.6 + 0.4 * intensity;
  root.querySelectorAll<HTMLElement>("[data-depth]").forEach((layer) => {
    const d = +layer.dataset.depth! * k;
    const v = (c: Required<Camera>) => ({ x: -c.x * d, y: -c.y * d, scale: 1 + (c.zoom - 1) * d });
    tl.fromTo(layer, v(prev), { ...v(next), duration, ease, immediateRender: false }, at);
  });
  return tl;
}

/* ================================================================== Glass */

/**
 * Frosted panel: backdrop blur, a lit 1 px edge (bright top-left), inner top highlight. Showcase only;
 * otherwise a solid surface card with the same radius and padding (degraded, same layout).
 */
export function Glass({ children, className = "", style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return <div className={`${allow("glass") ? "fx-glass" : "fx-glass-flat"} ${className}`} style={style}>{children}</div>;
}

/* ================================================================== Grain */

/** Static SVG noise over the scene (≈3 % visible). Balanced + showcase; academic: none (a texture has no meaning). */
export function Grain({ className = "" }: { className?: string }) {
  if (!allow("grain")) return null;
  return <div aria-hidden className={`fx-grain ${className}`} />;
}

/* ================================================================== DeviceFrame */

type Kind = "laptop" | "phone" | "browser";
export type Tilt = { rx?: number; ry?: number; rz?: number; y?: number; scale?: number };
const DEFAULT_TILT: Required<Tilt> = { rx: 22, ry: -18, rz: 3, y: 30, scale: 0.92 };

/**
 * A device with 3D perspective tilt that flattens on a step (flatten()). Shows `src` (an image) or children
 * (any HTML UI) at `width` × `height` screen pixels. Tilt off (academic) → drawn flat from the start.
 */
export function DeviceFrame({ kind = "browser", tilt = true, width = 1280, height = 800, src, alt = "", url = "app.example.com", children, className = "", style }: {
  kind?: Kind; tilt?: boolean | Tilt; width?: number; height?: number; src?: string; alt?: string; url?: string;
  children?: ReactNode; className?: string; style?: CSSProperties;
}) {
  const on = !!tilt && allow("tilt");
  const t = { ...DEFAULT_TILT, ...(typeof tilt === "object" ? tilt : {}) };
  const amt = 0.55 + 0.45 * intensity;
  const data = on ? { "data-tilt": JSON.stringify({ rx: t.rx * amt, ry: t.ry * amt, rz: t.rz * amt, y: t.y, scale: t.scale }) } : {};
  const screen = (
    <div className="relative overflow-hidden" style={{ width, height, background: "var(--color-canvas)", borderRadius: kind === "phone" ? 44 : kind === "laptop" ? 8 : 0 }}>
      {src ? <img src={src} alt={alt} className="block w-full h-full object-cover" /> : children}
      {on && <div className="fx-sheen" />}
    </div>
  );
  let body: ReactNode;
  if (kind === "browser") {
    body = (
      <div className="overflow-hidden" style={{ borderRadius: 18, border: "1px solid var(--color-line-strong)", background: "var(--color-surface)", boxShadow: "var(--shadow-lg)" }}>
        <div className="flex items-center gap-[10px] px-5" style={{ height: 52, borderBottom: "1px solid var(--color-line)", background: "var(--color-sunken)" }}>
          {[0, 1, 2].map((i) => <span key={i} className="block w-[13px] h-[13px] rounded-full" style={{ background: "var(--color-line-strong)" }} />)}
          <span className="mx-auto flex items-center gap-2 rounded-[10px] px-5 text-[17px]" style={{ height: 32, minWidth: 360, justifyContent: "center", background: "var(--color-canvas)", color: "var(--color-muted)", border: "1px solid var(--color-line)" }}>
            <svg width="12" height="14" viewBox="0 0 12 14" aria-hidden><rect x="1" y="6" width="10" height="7" rx="2" fill="currentColor" /><path d="M3.5 6V4a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.5" fill="none" /></svg>
            {url}
          </span>
          <span className="w-[59px]" />
        </div>
        {screen}
      </div>
    );
  } else if (kind === "laptop") {
    body = (
      <div className="flex flex-col items-center">
        <div style={{ padding: 18, borderRadius: 28, background: "#0c0d10", boxShadow: "inset 0 0 0 1.5px #2a2c33, var(--shadow-lg)" }}>{screen}</div>
        <div style={{ width: width + 36 + 160, height: 22, marginTop: -2, borderRadius: "4px 4px 26px 26px", background: "linear-gradient(#d4d6dc, #9a9da6)", boxShadow: "0 18px 40px rgb(0 0 0 / 0.3)" }}>
          <div className="mx-auto" style={{ width: 180, height: 8, borderRadius: "0 0 10px 10px", background: "rgb(0 0 0 / 0.18)" }} />
        </div>
      </div>
    );
  } else {
    body = (
      <div className="relative" style={{ padding: 14, borderRadius: 58, background: "#0c0d10", boxShadow: "inset 0 0 0 2px #2c2e35, var(--shadow-lg)" }}>
        {screen}
        <span className="absolute left-1/2 top-[30px] -ml-[62px] block w-[124px] h-[36px] rounded-full" style={{ background: "#000" }} />
      </div>
    );
  }
  return (
    <div className={`fx-persp ${className}`} style={style}>
      {/* initial tilt inline (never a Tailwind rotate or scale class: it would win over GSAP's transform) */}
      <div className="fx-device" {...data}
        style={on ? { transform: `translateY(${t.y}px) rotateX(${t.rx * amt}deg) rotateY(${t.ry * amt}deg) rotateZ(${t.rz * amt}deg) scale(${t.scale})` } : undefined}>
        {body}
      </div>
    </div>
  );
}

/** Flatten a tilted DeviceFrame (pass the frame or any element inside it). No-op when tilt is off. */
export function flatten(tl: TL, frame: Element | undefined, at: At, { duration = 1.4, ease = "power3.inOut", scale = 1 } = {}) {
  const dev = frame?.matches(".fx-device") ? frame : frame?.querySelector(".fx-device");
  const raw = dev?.getAttribute("data-tilt");
  if (!dev || !raw) return tl;
  const t = JSON.parse(raw) as Required<Tilt>;
  tl.fromTo(dev, { rotationX: t.rx, rotationY: t.ry, rotationZ: t.rz, y: t.y, scale: t.scale },
    { rotationX: 0, rotationY: 0, rotationZ: 0, y: 0, scale, duration, ease, immediateRender: false }, at);
  const sheen = dev.querySelector(".fx-sheen");
  if (sheen) tl.fromTo(sheen, { xPercent: -30, opacity: 1 }, { xPercent: 60, opacity: 0, duration: duration * 0.9, ease: "power2.inOut", immediateRender: false }, at);
  return tl;
}

/** Tilt the device in from below on entrance (keeps the tilt). Rise + fade when tilt is off. */
export function deviceIn(tl: TL, frame: Element | undefined, at: At, { duration = 1.3 } = {}) {
  const dev = frame?.matches(".fx-device") ? frame : frame?.querySelector(".fx-device");
  if (!dev) return tl;
  const raw = dev.getAttribute("data-tilt");
  if (!raw) return tl.from(dev, { y: 40, autoAlpha: 0, duration: 0.8, ease: "power3.out" }, at);
  const t = JSON.parse(raw) as Required<Tilt>;
  return tl.fromTo(dev, { rotationX: t.rx + 14, rotationY: t.ry, rotationZ: t.rz, y: t.y + 160, scale: t.scale, autoAlpha: 0 },
    { rotationX: t.rx, y: t.y, autoAlpha: 1, duration, ease: "expo.out" }, at);
}

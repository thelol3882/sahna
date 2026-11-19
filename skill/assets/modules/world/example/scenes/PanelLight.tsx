/** Static panel light: one soft light from the top left and a faint 120 px grid. Not animated, so a panel seen
 *  from far away in the world (before its entrance) still reads as a designed surface. */
export function PanelLight({ x = "18%", y = "12%" }: { x?: string; y?: string }) {
  return (
    <div aria-hidden className="absolute inset-0 pointer-events-none" style={{
      background: `radial-gradient(70% 80% at ${x} ${y}, color-mix(in srgb, var(--color-primary) 10%, transparent), transparent 70%)`,
    }}>
      <div className="absolute inset-0" style={{
        backgroundImage: "linear-gradient(var(--color-line) 1px, transparent 1px), linear-gradient(90deg, var(--color-line) 1px, transparent 1px)",
        backgroundSize: "120px 120px", backgroundPosition: "-1px -1px", opacity: 0.35,
        maskImage: "radial-gradient(80% 90% at 50% 40%, #000 30%, transparent 85%)",
      }} />
    </div>
  );
}

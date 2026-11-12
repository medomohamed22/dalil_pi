/**
 * Dalil Pi mark: the shopping bag with π (public/logo-mark.png). Drawn as a CSS mask filled with the
 * text color, so one file works in light and dark mode and inside dark buttons.
 */
export function PiBagMark({ size, className }: { size: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 bg-current ${className ?? ""}`}
      style={{
        width: size,
        height: size,
        WebkitMaskImage: "url(/logo-mark.png)",
        maskImage: "url(/logo-mark.png)",
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
      }}
    />
  );
}

export default function Logo({ size = 32, spinning = false }: { size?: number; spinning?: boolean }) {
  return (
    <div className="flex items-center justify-center text-fg" style={{ width: size, height: size }}>
      {/* CSS animation (compositor-only) so streaming re-renders never restart or stutter it. */}
      <PiBagMark size={size * 0.92} className={spinning ? "logo-think" : "logo-rest"} />
    </div>
  );
}

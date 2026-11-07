/** Dalil Pi mark: a shopping bag with the π sign ("shop with Pi"). */
export function PiBagMark({ size, className }: { size: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden>
      {/* bag body: slightly tapered tote */}
      <path d="M4.8 8.4h14.4l-1.1 11a1.8 1.8 0 0 1-1.8 1.6H7.7a1.8 1.8 0 0 1-1.8-1.6Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      {/* handle dipping into the bag */}
      <path d="M8.8 10.6V7.2a3.2 3.2 0 0 1 6.4 0v3.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      {/* π */}
      <path d="M9 13.4h6M10.8 13.4v4.6M13.4 13.4v3.7c0 .6.35.95.95.95" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export default function Logo({ size = 32, spinning = false }: { size?: number; spinning?: boolean }) {
  return (
    <div className="flex items-center justify-center rounded-full bg-inv-bg text-inv-fg" style={{ width: size, height: size }}>
      {/* CSS animation (compositor-only) so streaming re-renders never restart or stutter it. */}
      <PiBagMark size={size * 0.62} className={spinning ? "logo-think" : "logo-rest"} />
    </div>
  );
}

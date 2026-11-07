/** Small hand-drawn SVG marks that lucide doesn't cover (flags), in the same rounded style. */

type P = { className?: string };

export function FlagEG({ className }: P) {
  return (
    <svg viewBox="0 0 24 16" className={className} aria-hidden>
      <defs>
        <clipPath id="flag-eg">
          <rect width="24" height="16" rx="3" />
        </clipPath>
      </defs>
      <g clipPath="url(#flag-eg)">
        <rect width="24" height="16" fill="#fff" />
        <rect width="24" height="5.34" fill="#CE1126" />
        <rect y="10.66" width="24" height="5.34" fill="#111" />
        <path d="M12 6.1c-.9 0-1.5.6-1.5 1.3v1.7l1.5.9 1.5-.9V7.4c0-.7-.6-1.3-1.5-1.3Z" fill="#C09300" />
      </g>
      <rect x=".5" y=".5" width="23" height="15" rx="2.5" fill="none" stroke="currentColor" strokeOpacity=".15" />
    </svg>
  );
}

export function FlagUS({ className }: P) {
  const stripes = Array.from({ length: 7 }, (_, i) => <rect key={i} y={i * 2.46} width="24" height="1.23" fill="#B22234" />);
  return (
    <svg viewBox="0 0 24 16" className={className} aria-hidden>
      <defs>
        <clipPath id="flag-us">
          <rect width="24" height="16" rx="3" />
        </clipPath>
      </defs>
      <g clipPath="url(#flag-us)">
        <rect width="24" height="16" fill="#fff" />
        {stripes}
        <rect width="10.4" height="8.6" fill="#3C3B6E" />
        {[1.8, 4.3, 6.8].flatMap((y, r) =>
          [1.6, 3.9, 6.2, 8.5].map((x) => <circle key={`${r}-${x}`} cx={x + (r % 2) * 0.6} cy={y} r=".55" fill="#fff" />),
        )}
      </g>
      <rect x=".5" y=".5" width="23" height="15" rx="2.5" fill="none" stroke="currentColor" strokeOpacity=".15" />
    </svg>
  );
}

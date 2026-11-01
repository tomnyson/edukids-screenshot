/**
 * The EduKids mark: a blue planet carrying a mountain (a picture), circled by
 * its ring, with the yellow moon. Drawn flat in SVG so it stays sharp at 16px.
 */
export default function EdukidsMark({ size = 28, title = 'EduKids' }: { size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={title}>
      <defs>
        {/* front half of the ring: the part below the planet's centre line (rotated frame) */}
        <clipPath id="ek-front">
          <rect x="0" y="34" width="64" height="30" />
        </clipPath>
      </defs>
      <g transform="rotate(-18 32 34)">
        <ellipse cx="32" cy="34" rx="27" ry="9.5" fill="none" stroke="#93c5fd" strokeWidth="3.6" />
      </g>
      <circle cx="32" cy="34" r="16" fill="#4c8bf5" />
      <polyline
        points="22.5,39 28.5,31.5 32.5,35.5 36.5,31.5 43,37.5"
        fill="none" stroke="#f5f8ff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"
      />
      <g transform="rotate(-18 32 34)" clipPath="url(#ek-front)">
        <ellipse cx="32" cy="34" rx="27" ry="9.5" fill="none" stroke="#93c5fd" strokeWidth="3.6" />
      </g>
      <circle cx="53.5" cy="20.5" r="5" fill="#ffc83d" />
    </svg>
  );
}

/** "EduKids" with "Kids" in the brand's light blue, plus the product name. */
export function Wordmark({ product = 'Screenshot', compact = false }: { product?: string; compact?: boolean }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 leading-none whitespace-nowrap">
      <span className="font-bold tracking-tight" style={{ fontSize: compact ? 14 : 15 }}>
        Edu<span style={{ color: 'var(--accent)' }}>Kids</span>
      </span>
      <span className="font-medium" style={{ color: 'var(--muted)', fontSize: compact ? 13 : 14 }}>{product}</span>
    </span>
  );
}

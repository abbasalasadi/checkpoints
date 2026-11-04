/**
 * Percent rings (V4, D35): the dashboard donut and the exam result. Values are
 * percents; a ring past 100% wraps a second, brighter lap so 150% reads as
 * "full and half again".
 */
interface Ring {
  /** Percent, may exceed 100. */
  value: number;
  /** Gradient stops. */
  from: string;
  to: string;
}

const pct = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)}%`;
export const fmtPercent = pct;

export function MarkRing({ id, rings, size = 132, label, caption }: { id: string; rings: Ring[]; size?: number; label: string; caption: string }) {
  const width = rings.length > 1 ? [10, 7] : [12];
  const radii = rings.length > 1 ? [50, 36] : [48];
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label={`${caption}: ${label}`} style={{ flex: 'none' }}>
      <defs>
        {rings.map((r, i) => (
          <linearGradient key={i} id={`${id}-g${i}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={r.from} />
            <stop offset="100%" stopColor={r.to} />
          </linearGradient>
        ))}
        <filter id={`${id}-glow`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g filter={`url(#${id}-glow)`}>
        {rings.map((r, i) => {
          const rad = radii[i]!;
          const c = 2 * Math.PI * rad;
          const first = Math.min(Math.max(r.value, 0), 100) / 100;
          const extra = Math.min(Math.max(r.value - 100, 0), 100) / 100;
          const arc = (frac: number, opacity: number, w: number) =>
            frac > 0 && (
              <circle
                cx="60" cy="60" r={rad} fill="none" stroke={`url(#${id}-g${i})`} strokeWidth={w} strokeLinecap="round" opacity={opacity}
                strokeDasharray={`${frac * c} ${c}`} transform="rotate(-90 60 60)" style={{ transition: 'stroke-dasharray .8s ease' }}
              />
            );
          return (
            <g key={i}>
              <circle cx="60" cy="60" r={rad} fill="none" stroke="var(--raised)" strokeWidth={width[i]} />
              {arc(first, extra > 0 ? 0.55 : 1, width[i]!)}
              {arc(extra, 1, width[i]! * 0.6)}
            </g>
          );
        })}
      </g>
      <text x="60" y="58" textAnchor="middle" fontSize={label.length > 5 ? 17 : 20} fontWeight="700" fill="var(--text)" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {label}
      </text>
      <text x="60" y="74" textAnchor="middle" fontSize="8.5" fill="var(--text-muted)">
        {caption}
      </text>
    </svg>
  );
}

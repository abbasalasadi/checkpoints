/**
 * Inline SVG icons.
 *
 * These were text glyphs — `▸ ▾ ✓ ⋯`. Glyphs come from whatever font the
 * platform substitutes, so the tree carets rendered at a different weight and
 * baseline on Linux than on macOS, and `⋯` is missing from enough fonts to fall
 * back to a tofu box. As paths they render identically everywhere.
 *
 * Drawn inline rather than from an icon package: eight icons do not justify a
 * dependency, and inlining means no extra request and no flash of unstyled icon.
 *
 * All of them use `currentColor` and a 24-unit viewBox scaled to `size`, so an
 * icon inherits the colour of the text it sits beside and needs no colour prop.
 * They are decorative — `aria-hidden`, with the meaning carried by adjacent text
 * or the control's own accessible name.
 */

interface Props {
  size?: number;
  /** Degrees. Used for the caret, which is one path pointing right. */
  rotate?: number;
  className?: string;
  style?: React.CSSProperties;
}

const paths = {
  /** Points right; rotate 90 for open. */
  caret: <path d="M9 5l7 7-7 7" />,
  check: <path d="M4.5 12.5l5 5 10-11" />,
  dots: (
    <>
      <circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  play: <path d="M7 4.5l12 7.5-12 7.5z" fill="currentColor" stroke="none" />,
  /** Cancel: a filled square, the universal stop. */
  stop: <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />,
  /** Submit: a check inside a circle, distinct from the bare tree check. */
  submit: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.2l2.8 2.8L16 9" />
    </>
  ),
  /** Delete. */
  trash: <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6" />,
  /** Open in the editor: an arrow out of a box. */
  open: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
  /** Export / download. */
  download: <path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" />,
} as const;

export type IconName = keyof typeof paths;

export function Icon({
  name,
  size = 14,
  rotate,
  className,
  style,
}: Props & { name: IconName }) {
  return (
    <svg
      aria-hidden
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{
        display: 'block',
        flex: 'none',
        // The caret animates; a plain rotate on the others is instant.
        transform: rotate ? `rotate(${rotate}deg)` : undefined,
        transition: 'transform .12s ease',
        ...style,
      }}
    >
      {paths[name]}
    </svg>
  );
}

/**
 * The product mark: a terminal prompt chevron over a caret-and-underscore,
 * which is what the app is — a terminal you write Rust in. Used on the login
 * screen and as the favicon.
 */
export function Logo({ size = 40 }: { size?: number }) {
  return (
    <svg
      aria-hidden
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      style={{ display: 'block' }}
    >
      <rect x="3" y="6" width="42" height="36" rx="7" stroke="currentColor" strokeWidth="2.5" opacity=".45" />
      <path
        d="M14 19l6 5-6 5"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M26 30h9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

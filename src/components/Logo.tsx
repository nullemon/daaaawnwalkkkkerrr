/**
 * The site mark: an hourglass in a seal.
 *
 * The hourglass is the game's own marker for "this action costs time", and a
 * budget of 480 segments is what the whole site is built around — so the mark
 * states the subject rather than decorating it. Inlined rather than loaded as
 * a file so it inherits `currentColor` and works in both themes.
 */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
      style={{ flex: 'none' }}
    >
      <g fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="32" cy="32" r="28.2" />
        <path d="M20.5 15.5h23M20.5 48.5h23" />
        <path d="M23.5 15.5v4.2c0 3 1.2 5.8 3.3 7.9L32 32l-5.2 4.4a11.2 11.2 0 0 0-3.3 7.9v4.2M40.5 15.5v4.2c0 3-1.2 5.8-3.3 7.9L32 32l5.2 4.4a11.2 11.2 0 0 1 3.3 7.9v4.2" />
      </g>
      <path
        d="M25.9 19.2h12.2c-.35 2.5-1.5 4.8-3.35 6.4L32 28.1l-2.75-2.5c-1.85-1.6-3-3.9-3.35-6.4Z"
        fill="currentColor"
      />
      <path d="M32 34.4c2.9 2.4 4.7 5.4 5.2 8.9H26.8c.5-3.5 2.3-6.5 5.2-8.9Z" fill="currentColor" opacity=".45" />
    </svg>
  )
}

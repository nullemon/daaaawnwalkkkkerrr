import { glyphBox, markPath } from '@/lib/brand'

/**
 * The small mark, top-left of every admin screen.
 *
 * `currentColor` rather than the accent, because this one sits inside
 * Payload's own nav header and has to be legible in both of Payload's themes.
 * The geometry is `lib/brand.ts`, the same source as the login mark, the
 * site's rail and the favicon.
 */
export default function AdminIcon() {
  const [, , boxW, boxH] = glyphBox().split(' ').map(Number)
  return (
    <svg
      width={Math.round((22 * boxW) / boxH)}
      height={22}
      viewBox={glyphBox()}
      aria-hidden="true"
      focusable="false"
    >
      <path d={markPath()} fill="currentColor" fillRule="evenodd" />
    </svg>
  )
}

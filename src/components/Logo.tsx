import { glyphBox, markPath } from '@/lib/brand'

/**
 * The glyph is portrait, so a square box would letterbox it and the mark would
 * sit smaller than the icons beside it in the rail. Both attributes are
 * written out rather than leaving the browser to infer the width from the
 * viewBox: an SVG with only a height has no intrinsic width in older Safari
 * and collapses, which is a layout shift on every page rather than an error.
 */
const [, , BOX_W, BOX_H] = glyphBox().split(' ').map(Number)

/**
 * The network's mark: a ruled leaf of vellum.
 *
 * The geometry is not here. It lives in `src/lib/brand.ts`, which
 * `tools/make-brand.mjs` also reads to rasterise the favicon set and the share
 * card — so the mark in the rail and the mark in the browser tab are the same
 * numbers rather than two drawings somebody has to keep in step. The mark
 * before this one existed twice, in this file and in `public/logo.svg`, and
 * both copies still said "Dawnwalker Guide" on a network of eight wikis.
 *
 * One `<path>` with `fill-rule="evenodd"`: the margin and the three lines are
 * holes in the leaf, not strokes over it, so the whole thing fills with a
 * single `currentColor` and needs no mask. A mask would need an `id`, and this
 * component renders twice on most pages — the rail and the footer — which
 * would put duplicate ids in one document.
 *
 * `size` is a height, not a width — see `BOX_W` above.
 */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={Math.round((size * BOX_W) / BOX_H)}
      height={size}
      viewBox={glyphBox()}
      aria-hidden="true"
      focusable="false"
      style={{ flex: 'none' }}
    >
      <path d={markPath()} fill="currentColor" fillRule="evenodd" />
    </svg>
  )
}

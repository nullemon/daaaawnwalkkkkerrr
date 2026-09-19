import ink from '@/seed/raw/logo-ink.json'
import type { Media } from '@/payload-types'

/**
 * How a company mark should be painted on a dark ground.
 *
 * A logo from Commons is a trademark drawn as flat shapes, and about a third
 * of the ones here are **black on transparency** — invisible on this site's
 * surface. The first attempt put a white disc behind every one of them, which
 * is a row of white circles across a dark page, applied to logos that never
 * needed it.
 *
 * So each file is measured instead — `tools/logo-ink.mjs` reads the pixels and
 * records the mean lightness and saturation of everything not transparent —
 * and the answer decides the treatment:
 *
 * - `dark`   → inverted, so a black wordmark becomes a white one. That is what
 *   the same trademark looks like in its own dark-background lockup, and it is
 *   a reversible transform of the shape rather than a recolour of it.
 * - `light`  → left alone; it is already legible.
 * - `colour` → **never inverted**, and given a plate. Inverting Capcom's blue
 *   produces orange, which is not Capcom's mark — a plate is honest about
 *   being a background, and a recoloured trademark is not.
 *
 * Unknown files fall to `colour`, which is the treatment that cannot misstate
 * a mark: worst case a logo that did not need a plate gets one.
 *
 * ## Why a JSON file rather than a field
 *
 * It is a fact about an image file, not about a company, and it is derived —
 * re-running the tool reproduces it exactly. Keeping it out of the schema
 * means no column, no migration, and no `push` prompt to answer.
 *
 * ## It goes stale on a re-seed, and that is why it is in the chain
 *
 * The map is keyed on filename, and `seed:companies` uploads a logo under a
 * fresh name when it re-attaches one — `company-capcom-3.png` becomes
 * `company-capcom-4.png`. Every key then misses, every mark falls to `colour`,
 * and the page renders a plate behind a hundred logos that do not need one.
 * Nothing errors and the row still lays out, which is the same quiet shape as
 * the invisible-logo bug this replaced.
 *
 * So `pnpm logo:ink` runs immediately after `pnpm seed:companies` in
 * `db:reset`. Run it by hand after any pass that re-attaches company art.
 */

const MAP = ink as Record<string, string>

export type Ink = 'dark' | 'light' | 'colour'

/** The filename a URL ends with, which is how the map is keyed. */
const fileOf = (url?: string | null): string => {
  if (!url) return ''
  const clean = url.split('?')[0]
  return clean.slice(clean.lastIndexOf('/') + 1)
}

export const inkOf = (media: Media | null | undefined, url?: string | null): Ink => {
  /*
    The rendered URL first, because a card may be showing a resized variant
    (`company-capcom-3-320x320.png`) and the map holds every size the upload
    produced. Falling back to the original covers a size that was added later.
  */
  const answer = MAP[fileOf(url)] ?? MAP[fileOf(media?.url)] ?? MAP[media?.filename ?? '']
  return answer === 'dark' || answer === 'light' ? answer : 'colour'
}

import type { Media } from '@/payload-types'

/**
 * An upload field, as something a card can render.
 *
 * Payload gives back either the id or the populated document depending on the
 * `depth` the query asked for, and a card that does not check gets `[object
 * Object]` in a `src` or, more often, nothing at all with no error anywhere.
 * Every index page that shows a thumbnail had its own copy of this check;
 * three of them did not have it, which is why three sections were fetching
 * images at depth 0 and rendering none of them.
 *
 * `card` is the size the media collection generates for exactly this, with the
 * original as the fallback for an upload that predates it.
 */
export const asThumb = (
  value: unknown,
): { url?: string | null; alt?: string | null } | null => {
  if (!value || typeof value !== 'object') return null
  const media = value as Media
  const url = media.sizes?.card?.url ?? media.url
  return url ? { url, alt: media.alt ?? '' } : null
}

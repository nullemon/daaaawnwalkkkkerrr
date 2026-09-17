/**
 * Which picture a page shows, for the `<image:image>` half of the sitemap.
 *
 * Deliberately free of Payload types and of any database call, the same way
 * `reachability.ts` is, because the rule here is the whole risk. An
 * `<image:image>` is a claim that *this* page carries *this* picture. A
 * sitemap that claims one the page does not show is the invented fact this
 * project exists to avoid, wearing a file no reader ever opens and no check
 * has ever read — `pnpm verify` counts rows, `pnpm build` renders pages, and
 * neither of them would say a word.
 *
 * So there are exactly two rules and both are testable without a database:
 *
 *   1. No image record, no entry. Never a placeholder, never a fallback icon,
 *      never the game's key art standing in for a record that has none. Around
 *      half the records on this network have no picture and the page renders
 *      an icon glyph instead; an icon is not a photograph of anything and has
 *      no business in an image sitemap.
 *   2. The *same* size the page renders. Google treats two sizes of one
 *      picture as two images, so listing the original while the page shows the
 *      768px `card` names a URL the page never requests. Callers pass the size
 *      their route prefers and get the same `?? url` fallback the components
 *      use, because Payload skips a size larger than the source and stores a
 *      row of nulls for it.
 */

/**
 * The collections whose picture is drawn by this site rather than photographed
 * by anyone, and which therefore stay out of the image half of the sitemap.
 *
 * These six have no photographic art and, per `docs/ASSETS.md` and the
 * Outstanding list in CLAUDE.md, will not get any: a picture above the words
 * "Walking Fortress" reads as a claim that it shows Walking Fortress, and
 * nothing published names its own subjects. What they carry instead is the
 * emblem `pnpm make:emblems` draws from the record's slug — flat geometry,
 * deterministic, credited as generated here precisely so it cannot be mistaken
 * for artwork from the game.
 *
 * Listing one in an image sitemap would undo that in the one place nobody
 * reads: an `<image:image>` is a submission to Google Images, and the picture
 * it would submit for "Walking Fortress" depicts nothing at all. The page
 * still keeps its URL, its lastmod and its priority — it is the image claim
 * that is withheld, because there is no image claim to make.
 *
 * Contributor avatars are the same case with a different generator
 * (`pnpm make:avatars` draws a monogram from initials), and the hub sitemap
 * leaves them out for this reason rather than by omission.
 */
export const GENERATED_ART: ReadonlySet<string> = new Set([
  'perks',
  'endings',
  'builds',
  'courts',
  'court-activities',
  'skill-trees',
])

/** As much of a Payload upload as this file needs, and nothing more. */
export type SitemapMedia = {
  url?: string | null
  sizes?: Record<string, { url?: string | null } | null | undefined> | null
}

/**
 * The URL a page actually renders for this image, or null.
 *
 * `media` is `unknown` on purpose: at `depth: 0` an upload field comes back as
 * an id, and an id is not a picture. Anything that is not an object with a
 * usable `url` is nothing at all here rather than a guess.
 */
export const shownImage = (media: unknown, preferredSize?: string): string | null => {
  if (!media || typeof media !== 'object') return null
  const doc = media as SitemapMedia

  /*
    The preferred size when it exists, the original when it does not.

    Payload writes a size row for every configured size and leaves its `url`
    null where the source was too small to make one — most company logos are
    under 768px wide, so `sizes.card.url` is null on them and the component
    falls through to the original. Following the same `??` keeps the sitemap
    naming whatever the reader's browser was handed.
  */
  const sized = preferredSize ? doc.sizes?.[preferredSize]?.url : null
  const url = sized ?? doc.url
  return typeof url === 'string' && url !== '' ? url : null
}

/**
 * An image URL as the crawler must see it: absolute, on the host that serves
 * the page.
 *
 * Uploads are stored as a root-relative path (`/api/media/file/...`) and a
 * sitemap has no base to resolve one against, so a relative `<image:loc>` is
 * simply dropped. The origin passed in is the page's own, not the network
 * apex: `/api/*` is exempt from the host rewrite in `proxy.ts`, so every
 * image answers on every host, and same-host keeps the picture inside the
 * Search Console property that lists it.
 *
 * An absolute URL is returned untouched — nothing on this network stores one
 * today, but a future external CDN would arrive that way.
 */
export const absoluteImage = (origin: string, url: string | null | undefined): string | null => {
  if (typeof url !== 'string' || url === '') return null
  if (/^https?:\/\//i.test(url)) return url
  if (!url.startsWith('/')) return null
  return `${origin.replace(/\/$/, '')}${url}`
}

/**
 * The `images` value for one sitemap entry: a one-element array, or undefined.
 *
 * One image, not every image the page carries. A guide's gallery and the
 * poster beside a wiki's key art are real pictures on real pages, but an
 * `<image:image>` list is a set of submissions and the record's own picture is
 * the one that represents the page. Listing the furniture with it spends the
 * page's image authority on the furniture.
 *
 * `undefined` rather than `[]` is readability rather than behaviour: Next's
 * emitter tests `images?.length` both for the per-entry tag and for whether to
 * declare `xmlns:image` at all (`resolve-route-data.js`), so an empty array
 * renders identically. An absent property reads as "no claim" at the call
 * site, which is what it is.
 */
export const imagesFor = (
  origin: string,
  media: unknown,
  preferredSize?: string,
): string[] | undefined => {
  const url = absoluteImage(origin, shownImage(media, preferredSize))
  return url ? [url] : undefined
}

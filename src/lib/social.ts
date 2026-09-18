import type { Metadata, ResolvingMetadata } from 'next'
import { GENERATED_ART, shownImage } from './sitemap-images'

/**
 * The share card a page hands to Facebook, Reddit, Slack, Discord and X.
 *
 * ## Why this is a helper and not four lines in each route
 *
 * Next merges metadata **shallowly**: a segment that sets `openGraph` at all
 * replaces its parent's `openGraph` entirely, key by key, rather than merging
 * into it (`generate-metadata.md`, "Ordering"). The guide route learned that
 * the expensive way. It set
 *
 *     openGraph: image ? { images: [{ url: image }] } : undefined
 *
 * to give each article its own picture, and in doing so took `og:site_name`,
 * `og:type`, `og:locale` and the image's `width`/`height`/`alt` off 408 guide
 * pages — every one of which the wiki layout had set correctly one segment up.
 * The two guides with no lead image were worse: `openGraph: undefined` is
 * still a segment setting the key, so those pages served **no Open Graph tags
 * at all**, `og:title` and `og:description` included, and unfurled in Facebook
 * as a bare URL.
 *
 * None of that errors, no test failed, and the page looked perfect. The only
 * way to see it is to read the served HTML — which is the same lesson
 * `next/script` taught this project two gotchas ago.
 *
 * So: nothing sets `openGraph` by hand. Everything calls this, it reads the
 * parent's resolved card, and it restates the whole thing.
 *
 * ## Why `twitter` moves with it
 *
 * The same failure, one tag along. The guide route set its own `og:image` and
 * left `twitter:image` inherited, so a link to a guide showed the article's
 * picture on Facebook and the wiki's generic key art on X — two different
 * pictures for one page, from one route, with nothing saying so. X and
 * Reddit both fall back to Open Graph when a Twitter tag is absent, so the
 * honest shape is one image chosen once and written to both, which is what
 * this returns. There is no "reddit" tag to add: Reddit reads Open Graph
 * first and `twitter:` second, and both are here.
 *
 * ## What is deliberately not here
 *
 * **`twitter:site` and `twitter:creator`.** They name accounts. This network
 * has none that anybody has told this repository about, and a handle typed in
 * to fill the row would be the invented fact the whole project exists to
 * avoid — worse than most, because `twitter:creator` attributes the page to
 * whoever really owns that handle. If the owner opens accounts they belong
 * beside the analytics IDs as a blank-by-default setting; see the note in
 * `verificationMetadata` for the shape. Absent is the correct state, not a
 * gap.
 */

/** As much of a Payload upload as a share card needs. */
export type SocialMedia = {
  url?: string | null
  alt?: string | null
  width?: number | null
  height?: number | null
}

export type SocialImage = {
  url: string
  width?: number
  height?: number
  alt?: string
}

/**
 * The picture a record's own page shares, or nothing.
 *
 * The judgement is the image sitemap's, imported rather than restated:
 * `GENERATED_ART` is the six collections whose picture is an emblem this site
 * draws from the record's slug, and `shownImage` is "the size the page
 * actually renders". An `og:image` is the same kind of claim an
 * `<image:image>` is — this page shows this picture — so the two have to agree
 * or one of them is lying. A generated emblem depicts nothing; putting one on
 * a share card tells a reader scrolling Discord that they are looking at a
 * picture of Walking Fortress.
 *
 * `collection` first, so the check cannot be forgotten. Same reason
 * `sectionArt(game, name)` takes the asking game first.
 *
 * No size is named, because the fifteen detail routes render `image.url`
 * through `EntityImage` rather than a generated size — the same reasoning the
 * wiki sitemap records at its own call.
 *
 * `alt` is passed through and never invented. Where an upload has none the
 * card carries no `og:image:alt` rather than the record's title, which would
 * be this site asserting what the picture shows.
 */
export const recordImage = (collection: string, media: unknown): SocialImage | null => {
  if (GENERATED_ART.has(collection)) return null
  const url = shownImage(media)
  if (!url) return null
  const doc = media as SocialMedia
  return {
    url,
    width: typeof doc.width === 'number' ? doc.width : undefined,
    height: typeof doc.height === 'number' ? doc.height : undefined,
    alt: doc.alt?.trim() || undefined,
  }
}

/**
 * The one locale value the network publishes.
 *
 * Open Graph wants `language_TERRITORY`; every host on this network shipped a
 * bare `en`, which is not that shape and which Facebook's debugger rejects
 * outright, so ten hosts were publishing a malformed tag. `en_US` is the
 * format's own documented default, so declaring it tells a consumer nothing it
 * would not already have assumed — which is why it is the safe repair for a
 * tag whose only other honest option is to be absent. It is not a claim about
 * the prose, and `<html lang="en">` remains the language statement a browser
 * and a screen reader read.
 */
export const SOCIAL_LOCALE = 'en_US'

/**
 * A host's own default card: the one a page inherits when it has no picture of
 * its own.
 *
 * The four layouts that own a host — the hub, each wiki, the companies host
 * and the people host — call this instead of writing `openGraph` and `twitter`
 * out by hand, so a host added later cannot ship the card without the Twitter
 * half or with a locale of its own invention. Each of those two was a live
 * bug here before this existed.
 *
 * Deliberately no `url`. A layout's metadata is what every page under it
 * inherits, so a `url` here would put the host's front page in `og:url` on
 * every page of it — an `og:url` that names the wrong page is worse than no
 * `og:url`, because Facebook and Reddit would then file every article on the
 * host as the same object. The page supplies its own through `socialMeta`.
 */
export const hostCard = (options: {
  siteName: string
  image: SocialImage
}): Pick<Metadata, 'openGraph' | 'twitter'> => ({
  openGraph: {
    siteName: options.siteName,
    type: 'website',
    locale: SOCIAL_LOCALE,
    images: [options.image],
  },
  twitter: { card: 'summary_large_image', images: [options.image] },
})

/** One resolved Open Graph image in the plain shape both tag families take. */
const normalise = (image: unknown): SocialImage | null => {
  if (typeof image === 'string') return { url: image }
  if (image instanceof URL) return { url: image.toString() }
  if (!image || typeof image !== 'object') return null
  const doc = image as { url?: unknown; width?: unknown; height?: unknown; alt?: unknown }
  const url = doc.url instanceof URL ? doc.url.toString() : typeof doc.url === 'string' ? doc.url : null
  if (!url) return null
  return {
    url,
    width: typeof doc.width === 'number' ? doc.width : undefined,
    height: typeof doc.height === 'number' ? doc.height : undefined,
    alt: typeof doc.alt === 'string' && doc.alt !== '' ? doc.alt : undefined,
  }
}

/**
 * The `openGraph` and `twitter` halves of one page's metadata.
 *
 * `path` is the page's own canonical path, and it is the same string the route
 * already passes to `alternates.canonical` — deliberately, because `og:url` is
 * the canonical as far as Facebook and Reddit are concerned. Without it they
 * key the page on whatever URL was shared, so the same article arriving with a
 * `?utm_source=` on it counts as a second object with its own share tally.
 * Next resolves it against the host's `metadataBase`, which is how it lands on
 * the wiki's own origin rather than the apex.
 *
 * `image` is the page's own picture where it has one. Where it is null the
 * host's card is carried through unchanged, so a record with no photograph
 * shares the wiki's key art rather than nothing.
 */
export const socialMeta = async (
  parent: ResolvingMetadata,
  options: { path: string; image?: SocialImage | null; type?: 'website' | 'article' },
): Promise<Pick<Metadata, 'openGraph' | 'twitter'>> => {
  const inherited = (await parent).openGraph

  const images = options.image
    ? [options.image]
    : (inherited?.images ?? []).map(normalise).filter((image): image is SocialImage => image !== null)

  return {
    openGraph: {
      type: options.type ?? 'website',
      siteName: inherited?.siteName,
      locale: inherited?.locale,
      url: options.path,
      images,
    },
    twitter: { card: 'summary_large_image', images },
  }
}

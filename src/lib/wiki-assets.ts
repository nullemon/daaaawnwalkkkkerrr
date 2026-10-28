import fs from 'node:fs'
import path from 'node:path'

/**
 * A wiki's own icon set and share card, or the network's when it has none.
 *
 * `tools/make-wiki-icons.mjs` writes four files per wiki into
 * `public/wiki-assets/<slug>/`, cropped from that game's own capsule and hero
 * art. Six places then built the path to them from the slug alone — the hub's
 * header marks, the hub search, the home page's guide rows, a wiki's
 * `generateMetadata`, the share-card route — and none of them asked whether
 * the folder existed. Two wikis had no art for the script to crop, so the
 * script skipped them, and those two served a 404 for their favicon, a 404 for
 * the picture every shared link showed, and a broken `<img>` in the header of
 * every page on the hub. Nothing errored: a missing favicon is the quietest
 * failure a browser has, and a 404 share card is only ever seen by whoever
 * pastes the link.
 *
 * This is the one place that answers. It reads the disk once per slug at
 * render time — these are server components and a build-time route, where
 * `fs` is available and the answer cannot change under a running site — and
 * hands back either the wiki's own files or the network's, which exist by the
 * time anything runs because `auditSource` marks them blocking if they do not.
 *
 * `wikiIcon` returns `null` rather than the network favicon on purpose: a
 * 16px network mark beside fifteen wiki names reads as one wiki that is
 * somehow the network, and the callers already draw the game's initials on
 * its accent when there is no picture, which is the right fallback there.
 */

const ROOT = path.resolve('public', 'wiki-assets')

/* The network's own set, for a wiki that has none. The filenames are the ones
   `tools/make-brand.mjs` writes and `auditSource` requires. */
const NETWORK = {
  icon32: '/favicon-32.png',
  icon512: '/icon-512.png',
  apple: '/apple-touch-icon.png',
  og: '/og.png',
}

const known = new Map<string, boolean>()

/** Does `public/wiki-assets/<slug>/` hold a generated set? */
export const hasWikiAssets = (slug: string): boolean => {
  const cached = known.get(slug)
  if (cached !== undefined) return cached
  const present = fs.existsSync(path.join(ROOT, slug, 'icon-32.png'))
  known.set(slug, present)
  return present
}

/** The 32px tab icon as a root-relative path, or nothing — see above for why not the network's. */
export const wikiIcon = (slug: string): string | null =>
  hasWikiAssets(slug) ? `/wiki-assets/${slug}/icon-32.png` : null

export type WikiAssets = { icon32: string; icon512: string; apple: string; og: string; own: boolean }

/** Every path a wiki's metadata needs, from its own folder or the network's. */
export const wikiAssetsFor = (slug: string): WikiAssets =>
  hasWikiAssets(slug)
    ? {
        icon32: `/wiki-assets/${slug}/icon-32.png`,
        icon512: `/wiki-assets/${slug}/icon-512.png`,
        apple: `/wiki-assets/${slug}/apple-touch-icon.png`,
        og: `/wiki-assets/${slug}/og.jpg`,
        own: true,
      }
    : { ...NETWORK, own: false }

/** The slugs among those given that have no folder — for the launch checklist. */
export const wikisWithoutAssets = (slugs: string[]): string[] =>
  slugs.filter((slug) => !hasWikiAssets(slug))

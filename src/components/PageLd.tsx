import { JsonLd } from './JsonLd'
import { gameUrl, getGame } from '@/lib/payload'
import { SECTIONS } from '@/lib/sections'
import { collectionPage, recordPage } from '@/lib/schema'
import type { GameScopedCollection } from '@/lib/tenancy'

/**
 * The structured data a record page and a section index carry about
 * themselves.
 *
 * Two components and one file, because they are the two halves of one rule:
 * every public page on a wiki says what it is. The layout already emits the
 * game, the site and the publisher on every page; these add the page, its
 * trail and its subject. `[game]/guides/[slug]` has its own `Article` and is
 * not one of these.
 *
 * Both resolve the host themselves from the game, through the same `gameUrl`
 * the sitemap and the canonical use, so the `@id`s here are the URLs a search
 * engine already holds for the page. A relative path in JSON-LD is read
 * against the document it is on, which on a wiki subdomain is the right host
 * by luck and on the apex is the wrong one; an absolute one is right on both.
 *
 * The section's label, path and singular come from `SECTIONS`, not from the
 * caller, so a page cannot describe itself as part of a section it is not in
 * and a renamed section renames its structured data with it.
 */

const sectionOf = (collection: GameScopedCollection) => {
  const section = SECTIONS.find((entry) => entry.collection === collection)
  if (!section) throw new Error(`No section for collection "${collection}"`)
  return section
}

/** One record. Renders nothing when the game cannot be resolved. */
export async function RecordLd({
  game,
  collection,
  doc,
  image,
}: {
  /** The game's slug — the `[game]` segment. */
  game: string
  collection: GameScopedCollection
  doc: {
    title: string
    slug: string
    summary?: string | null
    description?: string | null
    updatedAt?: string | null
  }
  /** The record's own picture, already resolved to a URL, or nothing. */
  image?: string | null
}) {
  const record = await getGame(game)
  if (!record) return null
  const base = await gameUrl(record)
  const section = sectionOf(collection)
  const path = `${section.href}/${doc.slug}`

  return (
    <JsonLd
      data={recordPage(base, {
        path,
        name: doc.title,
        description: doc.summary || doc.description || null,
        image,
        kind: section.kind,
        updated: doc.updatedAt,
        crumbs: [
          { label: 'Home', href: '/' },
          { label: section.label, href: section.href },
          { label: doc.title },
        ],
      })}
    />
  )
}

/** One section index. The description is the page's own lede, when it has one. */
export async function IndexLd({
  game,
  collection,
  items,
  description,
}: {
  game: string
  collection: GameScopedCollection
  items: { title: string; slug: string }[]
  description?: string | null
}) {
  const record = await getGame(game)
  if (!record) return null
  const base = await gameUrl(record)
  const section = sectionOf(collection)

  return (
    <JsonLd
      data={collectionPage(base, {
        path: section.href,
        name: section.label,
        description,
        items: items.map((item) => ({ name: item.title, path: `${section.href}/${item.slug}` })),
        crumbs: [{ label: 'Home', href: '/' }, { label: section.label }],
      })}
    />
  )
}

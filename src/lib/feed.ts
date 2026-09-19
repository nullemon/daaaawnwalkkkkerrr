import { getAll, getDatedGuides, getGame, gameUrl } from './payload'
import { guideLastModified, sourcesLastRead } from './guide-dates'
import type { Game } from '@/payload-types'

/**
 * What goes in a wiki's feeds.
 *
 * RSS and Atom carry the same items and differed only in their envelope, but
 * each route built its own list, so the two feeds could — and did — drift on
 * which collections they drew from. One source, two envelopes.
 *
 * Only editorial appears here. A feed of four hundred database records would
 * be unreadable and would bury the three guides a subscriber actually wants;
 * items, enemies and regions are reference material that people look up, not
 * news they follow.
 */

export type FeedItem = { title: string; path: string; summary: string; date: string }

export type FeedMeta = {
  game: Game
  base: string
  title: string
  description: string
  items: FeedItem[]
  updated: string
}

export const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

export const feedFor = async (slug: string): Promise<FeedMeta | null> => {
  const game = await getGame(slug)
  if (!game) return null

  const [base, guides, builds, endings] = await Promise.all([
    gameUrl(game),
    getDatedGuides(slug),
    getAll('builds', { game: slug, depth: 0 }),
    getAll('endings', { game: slug, depth: 0 }),
  ])

  /*
    A guide's date is its own, not the row's.

    `updatedAt` is identical on every guide — the afternoon somebody last ran
    the seed — so a feed built on it dated all thirty entries to the same
    minute and ordered them by whatever the seeder happened to write last. A
    subscriber's reader shows that as thirty new items every time the database
    is rebuilt, which is the worst thing a feed can do.

    `guideLastModified` is the day this page's own citations were read, out of
    a committed harvest file. A guide with no honest date has no `date` and is
    dropped by the filter below rather than dated to now: Atom requires an
    `<updated>` on every entry, so an undated item cannot be published at all,
    and inventing one to fill the element is the thing this repository does
    not do. See `src/lib/guide-dates.ts`.

    Which is also why the guides are not limited in the query. Asking for
    `sort: '-updatedAt', limit: 30` and then re-sorting those thirty by the
    real date looked like a cheap first pass and was not one: the column it
    limited on holds the same minute on every row, so *which* thirty reached
    the feed was insertion order, and a guide whose sources were read
    yesterday could sit outside the window forever. `getDatedGuides` reads
    every guide and six columns of it; the `.slice(0, 40)` below is now the
    only thing deciding what is published, and it decides on the date printed
    beside each entry.

    Builds and endings get the same treatment, and the reason they did not is
    worth recording: they have no `published` or `updated` field, so the first
    pass called that "no better answer available" and left them on `updatedAt`.
    They do carry sources, because `src/seed/import.ts` refuses a record
    without one, and every source carries the day it was read — 13 September
    for the endings, 16 September for the builds. The answer was in the same
    column it was for the guides.

    It was not a tidy-up. One list sorted on two kinds of date is decided
    entirely by the fake one: `updatedAt` is always "the last seed run", so the
    six endings sat above every guide on the feed and moved to the top again on
    every rebuild — the thirty-new-items-every-deploy failure, undefeated,
    with the guides fixed underneath it.

    An ending with no `retrieved` anywhere on it now drops out of the feed
    rather than being dated to now, which is the rule the guides already
    follow and the reason the filter below is on `date` and not on collection.
  */
  const items: FeedItem[] = [
    ...guides.map((doc) => ({
      title: doc.title,
      path: `/guides/${doc.slug}`,
      summary: doc.summary ?? '',
      date: guideLastModified(doc) ?? '',
    })),
    ...builds.map((doc) => ({
      title: `Build: ${doc.title}`,
      path: `/builds/${doc.slug}`,
      summary: doc.summary ?? '',
      date: sourcesLastRead(doc.sources) ?? '',
    })),
    ...endings.map((doc) => ({
      title: `Ending: ${doc.title}`,
      path: `/endings/${doc.slug}`,
      summary: doc.summary ?? '',
      date: sourcesLastRead(doc.sources) ?? '',
    })),
  ]
    .filter((item) => Boolean(item.date))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 40)

  const name = game.shortTitle || game.title

  return {
    game,
    base,
    title: `${name} Wiki`,
    description:
      game.summary || `Guides, builds and endings for ${game.title}, as they are published.`,
    items,
    updated: items[0]?.date ?? new Date().toISOString(),
  }
}

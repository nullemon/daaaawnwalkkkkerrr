import { getAll, getGame, gameUrl } from './payload'
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
    getAll('guides', { game: slug, depth: 0, sort: '-updatedAt', limit: 30 }),
    getAll('builds', { game: slug, depth: 0, sort: '-updatedAt', limit: 30 }),
    getAll('endings', { game: slug, depth: 0, sort: '-updatedAt', limit: 10 }),
  ])

  const items: FeedItem[] = [
    ...guides.map((doc) => ({
      title: doc.title,
      path: `/guides/${doc.slug}`,
      summary: doc.summary ?? '',
      date: doc.updatedAt,
    })),
    ...builds.map((doc) => ({
      title: `Build: ${doc.title}`,
      path: `/builds/${doc.slug}`,
      summary: doc.summary ?? '',
      date: doc.updatedAt,
    })),
    ...endings.map((doc) => ({
      title: `Ending: ${doc.title}`,
      path: `/endings/${doc.slug}`,
      summary: doc.summary ?? '',
      date: doc.updatedAt,
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

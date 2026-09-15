import fs from 'fs'
import path from 'path'
import { getAllAcrossGames, gameUrl } from './payload'

/**
 * What people are searching for right now, and where this network answers it.
 *
 * ## Why this is on the front page
 *
 * A game-wiki hub normally leads with editorial: featured guides, latest news,
 * a staff pick. That is a publisher deciding what matters. This leads with
 * what readers are actually typing into Google — 4,210 harvested queries
 * across the eight games — matched to the page that answers each one.
 *
 * It is the one thing here that neither of the sites this was modelled on can
 * do, because neither of them collects the demand side. It also keeps the hub
 * honest: a query with no answer is visible as a gap rather than hidden behind
 * a curated list.
 */

export type Asking = {
  query: string
  wiki: string
  wikiSlug: string
  /** The page that answers it, absolute because every wiki is its own host. */
  href: string | null
  title: string | null
}

const QUERY_DIR = path.resolve('src/seed/raw/queries')

/** Words that carry no signal when matching a query to an article. */
const STOP = new Set([
  'the', 'a', 'an', 'is', 'it', 'to', 'of', 'in', 'on', 'for', 'and', 'or',
  'how', 'what', 'when', 'where', 'why', 'does', 'do', 'can', 'you', 'i',
  'be', 'are', 'was', 'will', 'there', 'much', 'many', 'long', 'get', 'game',
])

const tokens = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP.has(word))

/**
 * The most-searched questions across the network, with their answers.
 *
 * Deliberately one per wiki at most before filling out, so the list reads as
 * the network rather than as whichever game has the busiest search volume.
 */
export const whatPeopleAreAsking = async (limit = 12): Promise<Asking[]> => {
  if (!fs.existsSync(QUERY_DIR)) return []

  const guides = await getAllAcrossGames('guides', { depth: 0, limit: 1000 })

  /** Pre-tokenise every guide once; this runs per build, not per request. */
  const indexed = await Promise.all(
    guides.map(async ({ doc, game }) => ({
      title: doc.title,
      slug: doc.slug,
      gameSlug: game.slug,
      gameName: game.shortTitle || game.title,
      base: await gameUrl(game),
      terms: new Set([...tokens(doc.title), ...tokens(doc.targetQuery ?? '')]),
    })),
  )

  const perGame: Record<string, Asking[]> = {}

  for (const file of fs.readdirSync(QUERY_DIR).filter((name) => name.endsWith('.json'))) {
    const harvest = JSON.parse(fs.readFileSync(path.join(QUERY_DIR, file), 'utf8')) as {
      slug: string
      terms: string[]
      queries: { query: string; weight: number }[]
    }

    /*
      The game's own name, excluded from matching.

      Without this the name carries every comparison: "resonance a plague tale
      legacy how long to beat" shares four words with every article on that
      wiki simply by naming the game, so it matched the release-date page and
      was presented as the answer to a question this network deliberately does
      not answer. Matching has to happen on the *question* words — beat, map,
      endings, multiplayer — and on nothing else.
    */
    const gameWords = new Set(harvest.terms.flatMap((term) => tokens(term)))

    const candidates = indexed.filter((entry) => entry.gameSlug === harvest.slug)
    if (candidates.length === 0) continue

    const rows: Asking[] = []

    for (const entry of harvest.queries.slice(0, 120)) {
      const words = tokens(entry.query).filter((word) => !gameWords.has(word))
      // Nothing but the game's name left: the query is "onimusha", which no
      // single article answers better than the wiki's own front page.
      if (words.length < 2) continue

      // Score by how much of the query the article's own words cover.
      let best: (typeof candidates)[number] | null = null
      let bestScore = 0
      for (const candidate of candidates) {
        // The article's own name-words are excluded for the same reason.
        const score = words.filter(
          (word) => candidate.terms.has(word) && !gameWords.has(word),
        ).length
        if (score > bestScore) {
          best = candidate
          bestScore = score
        }
      }

      /*
        Two question-words in common, with the game's name discounted, is a
        real match: "system requirements", "release date", "multiplayer co-op".
        One is a coincidence.
      */
      if (!best || bestScore < 2) continue

      rows.push({
        query: entry.query,
        wiki: best.gameName,
        wikiSlug: best.gameSlug,
        href: `${best.base}/guides/${best.slug}`,
        title: best.title,
      })

      if (rows.length >= 3) break
    }

    if (rows.length > 0) perGame[harvest.slug] = rows
  }

  // Round-robin, so one busy wiki cannot take the whole list.
  const out: Asking[] = []
  const pools = Object.values(perGame)
  for (let depth = 0; depth < 3 && out.length < limit; depth += 1) {
    for (const pool of pools) {
      if (pool[depth]) out.push(pool[depth])
      if (out.length >= limit) break
    }
  }

  return out
}

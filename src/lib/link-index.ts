import { cache } from 'react'
import { buildMatcher, type Matcher, type NamedTarget } from './autolink'
import { getNames, getPublishedGames, gameUrl } from './payload'
import { SECTION_PATH, type GameScopedCollection } from './tenancy'
import { companyUrl, personUrl } from './urls'

/**
 * The index of everything composed prose is allowed to link to.
 *
 * `src/lib/autolink.ts` decides what a sentence names. This file decides what
 * is in the index at all, and what URL each entry resolves to — which is a
 * different question on every host, because every wiki, the people host and the
 * companies host are separate origins.
 *
 * ## Cost
 *
 * This runs on ~3,000 prerendered pages, so it is built once per request
 * through React's `cache` and never per paragraph. The reads underneath it are
 * `getNames`, which selects three columns, not `getAll`, which selects every
 * one: thirteen collections of full rows on every page render is what made
 * SQLite return SQLITE_BUSY and abort the build at around page six hundred, and
 * the navigation's `.length` habit is the note in CLAUDE.md about it.
 *
 * ## What is not in here, and why
 *
 * **Guides.** Their titles are whole sentences — "Who scored Resonance: A
 * Plague Tale Legacy" — and a sentence matched inside another sentence is not
 * a mention of a thing, it is a coincidence of wording.
 *
 * **Achievements.** The titles are jokes and quotations by design ("Do not go
 * gentle"), which is the same problem one step worse.
 *
 * **Authors.** They already have a byline on every page they wrote, and the
 * contributor names are placeholders until the owner supplies six real ones.
 */

/**
 * The game-scoped collections whose records may be linked from prose.
 *
 * A subset of `GAME_SCOPED` on purpose. Everything here names a *thing in the
 * game* whose name a sentence would use to mean that thing; the three that are
 * missing name something else, and the note above says which and why.
 */
export const LINKABLE_SECTIONS: GameScopedCollection[] = [
  'characters',
  'regions',
  'factions',
  'items',
  'enemies',
  'quests',
  'perks',
  'endings',
  'courts',
  'court-activities',
  'skill-trees',
  'builds',
  'mechanics',
]

/**
 * Which host the prose is being rendered on.
 *
 * It decides two things at once: whether a link is same-origin (so `next/link`)
 * or crosses one (so a plain `<a>`, because there is no client-side navigation
 * to be had and a prefetch would only fail quietly), and whether the
 * game-scoped half of the index is in play at all.
 */
export type LinkHost = 'wiki' | 'people' | 'companies' | 'hub'

/**
 * Where a page is, for the linker.
 *
 * `self` is the page's own record as `collection:id` — the owner's explicit
 * requirement that a person's name is a link everywhere it is mentioned
 * *except* on their own page, generalised to every kind of record. It is the
 * id and not the slug because a person and a character can share one.
 */
export type LinkScope = {
  host: LinkHost
  /** The wiki, when `host` is `'wiki'`. */
  game?: string
  self?: string
}

/**
 * The people, companies and games every host can link to.
 *
 * Network-wide by design and for the reason the two hosts exist: a composer
 * scored two of these games and Capcom appears on three wikis, so one page per
 * person and per company carries a whole body of work. A wiki naming either is
 * naming the same record the hub would.
 */
const networkTargets = cache(async (host: LinkHost): Promise<NamedTarget[]> => {
  const [people, companies, games] = await Promise.all([
    getNames('people', { field: 'name' }),
    getNames('companies', { field: 'name' }),
    getPublishedGames(),
  ])

  const targets: NamedTarget[] = []

  for (const row of people) {
    targets.push({
      key: `people:${row.id}`,
      kind: 'person',
      name: row.name,
      names: [row.name],
      href: host === 'people' ? `/${row.slug}` : personUrl(`/${row.slug}`),
      external: host !== 'people',
    })
  }

  for (const row of companies) {
    targets.push({
      key: `companies:${row.id}`,
      kind: 'company',
      name: row.name,
      names: [row.name],
      href: host === 'companies' ? `/${row.slug}` : companyUrl(`/${row.slug}`),
      external: host !== 'companies',
    })
  }

  for (const game of games) {
    /*
      Both spellings. The store page's full title is what a credit prints —
      "Resonance: A Plague Tale Legacy" — and the short title is what the wikis
      use in their own composed summaries. Two names, one target, so whichever
      a sentence uses lands on the same wiki and the "already linked" rule
      still counts them as one mention.
    */
    const names = [game.title, game.shortTitle].filter(
      (name): name is string => typeof name === 'string' && name.trim().length > 0,
    )
    targets.push({
      key: `games:${game.id}`,
      kind: 'game',
      name: game.shortTitle || game.title,
      names,
      // Always absolute: a wiki is its own host from everywhere, the hub
      // included.
      href: await gameUrl(game),
      external: true,
      game: game.slug,
    })
  }

  return targets
})

/** One wiki's own records, which match inside that wiki and nowhere else. */
const wikiTargets = cache(async (game: string): Promise<NamedTarget[]> => {
  const sections = await Promise.all(
    LINKABLE_SECTIONS.map(async (collection) => ({
      collection,
      rows: await getNames(collection, { game }),
    })),
  )

  return sections.flatMap(({ collection, rows }) =>
    rows.map((row) => ({
      key: `${collection}:${row.id}`,
      kind: 'record' as const,
      name: row.name,
      names: [row.name],
      // Root-relative, because a wiki's own pages are on the host the reader is
      // already on. See the note in CLAUDE.md about browsing the internal path
      // form: these hrefs are written for the subdomain.
      href: `${SECTION_PATH[collection]}/${row.slug}`,
      external: false,
      game,
    })),
  )
})

/**
 * The matcher for one host, built once per request.
 *
 * Cached on primitives, because React's `cache` keys on argument identity — an
 * options object would be a fresh reference on every call and would never hit,
 * which is the same trap `findAll` in `lib/payload.ts` documents.
 */
export const getMatcher = cache(
  async (host: LinkHost, game?: string): Promise<Matcher> => {
    const [network, wiki] = await Promise.all([
      networkTargets(host),
      host === 'wiki' && game ? wikiTargets(game) : Promise.resolve([]),
    ])
    return buildMatcher([...network, ...wiki])
  },
)

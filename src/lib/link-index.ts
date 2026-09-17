import { cache } from 'react'
import {
  buildMatcher,
  nameKey,
  PLATFORM_NAMES,
  type Matcher,
  type NamedTarget,
} from './autolink'
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
 * **Maps.** There are none, and the note in CLAUDE.md says why that is a
 * finding rather than a gap.
 *
 * **Authors.** Not game-scoped, and they already carry a byline on every page
 * they wrote; the six contributor names are placeholders until the owner
 * supplies real ones, and linking a placeholder into prose spreads it.
 */

/**
 * The game-scoped collections whose records may be linked from prose.
 *
 * A subset of `GAME_SCOPED` on purpose. Everything here names a *thing in the
 * game* whose name a sentence would use to mean that thing; the three that are
 * missing - guides, achievements, maps - do not, and the note above says why.
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
    /*
      A wiki writes about platforms constantly - controls, system requirements,
      editions - and two of these company names are what it calls a machine. On
      a wiki they are left out entirely; on the hosts where a corporation is the
      subject they stay in. See `PLATFORM_NAMES`.
    */
    if (host === 'wiki' && PLATFORM_NAMES.has(nameKey(row.name))) continue
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
      /* The full title, even where the short one is what a sentence used: the
         tooltip exists to say what the link goes to, and "A Plague Tale Legacy"
         hovering over "Resonance: A Plague Tale Legacy" tells a reader less
         than the text already did. */
      name: game.title,
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

/**
 * The collections that hold *facets of one subject*, strongest first.
 *
 * Read by `sameSubject` in `src/lib/autolink.ts`, and only by it. Three
 * entries, not thirteen, and the shortness is the point: this is the list of
 * places where the network deliberately files one subject more than once and
 * the derivation between the filings can be read off the records.
 *
 * Ambrus is the case. He is `characters/ambrus-character` (who he is),
 * `enemies/ambrus-boss` (the fight at the end of The Gilded Gauntlet) and
 * `courts/ambrus` (his court). The boss is called Ambrus because the fight is
 * against him and the court is his, so a bare "Ambrus" means the man. Brencis,
 * Bakir and Xanthe are the same shape.
 *
 * A collection that is not here has no facet at all, which makes any match it
 * shares refuse outright rather than lose a ranking. Adding a line is therefore
 * a claim that a bare mention of a shared name means that collection's record
 * and not the other's - which is exactly the claim that was wrong for Naboo, a
 * planet the harvester filed in `characters`. Read the note on `sameSubject`
 * before adding one.
 */
const FACET_ORDER: Partial<Record<GameScopedCollection, number>> = {
  characters: 0,
  enemies: 1,
  courts: 2,
}

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
      facet: FACET_ORDER[collection],
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

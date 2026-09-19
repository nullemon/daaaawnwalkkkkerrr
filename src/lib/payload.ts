import { cache } from 'react'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import type { CollectionSlug, Where } from 'payload'
import config from '@payload-config'
import { isGameScoped, type GameScopedCollection } from './tenancy'
import type { Config, Game } from '@/payload-types'
import { rightsholdersIn } from './rightsholders'

/**
 * Content access for the public site. Everything is read through the local API
 * at build time, so pages render as static HTML with no database on the
 * request path — page speed is one of the few advantages a new site has over
 * the established wikis, and this is where it comes from.
 *
 * Since the network became multi-game, these two functions are also the only
 * place a game filter is applied. That is on purpose: one filter in one place
 * cannot be forgotten by page thirty-seven, and the type signature below makes
 * forgetting it a compile error rather than a leak nobody notices until a
 * reader finds Dawnwalker quests on the Onimusha wiki.
 */

export const client = cache(async () => getPayload({ config }))

/**
 * The document type for a collection slug, read from the types Payload
 * generates.
 *
 * Call sites used to name the type themselves, passing the document type as an
 * explicit type argument alongside the slug. That was redundant, and worse, it
 * was load-bearing in the wrong direction:
 * supplying one type argument made TypeScript fall back to the *default* for
 * the collection generic, which collapsed the game-scope check below into
 * "optional" at every call site at once. Inferring both from the slug is
 * shorter, and is what makes the guard real rather than decorative.
 */
type DocOf<C extends CollectionSlug> = Config['collections'][C]

/**
 * A game, by slug. Cached per render, so the hundred-odd scoped queries a page
 * makes resolve the same game once.
 *
 * Returns null for a slug that does not exist, which callers turn into a 404 —
 * the alternative, falling back to some default game, would serve one wiki's
 * content under another wiki's URL.
 */
export const getGame = cache(async (slug: string): Promise<Game | null> => {
  const payload = await client()
  const result = await payload.find({
    collection: 'games',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 1,
  })
  return (result.docs[0] as Game) ?? null
})

/** Every game a reader may reach. Planned games are not among them. */
export const getPublishedGames = cache(async (): Promise<Game[]> => {
  const payload = await client()
  const result = await payload.find({
    collection: 'games',
    where: { status: { in: ['building', 'live', 'archived'] } },
    sort: 'title',
    limit: 200,
    pagination: false,
    depth: 1,
  })
  return result.docs as Game[]
})

/**
 * A runtime backstop for the compile-time guard.
 *
 * TypeScript catches this everywhere the types are honoured, but these
 * functions are also reachable from scripts, and from any call that has
 * widened its collection argument to `CollectionSlug` — where the conditional
 * type collapses and the requirement quietly evaporates. That is precisely how
 * the first draft of this file shipped a guard that never once fired.
 */
export const assertScoped = (collection: string, game: string | undefined): void => {
  if (isGameScoped(collection) && !game) {
    throw new Error(
      `Unscoped read of "${collection}". Game-scoped collections need a game — ` +
        `see GAME_SCOPED in lib/tenancy.ts.`,
    )
  }
}

/**
 * The game filter, resolved from a slug.
 *
 * Filtering on the relationship's id rather than on `game.slug` keeps this to
 * an indexed integer comparison against the compound (game, slug) index, which
 * is what that index exists for.
 */
const scopeFor = async (game: string): Promise<Where> => {
  const doc = await getGame(game)
  if (!doc) {
    /*
      A slug with no game is a 404, not a crash.

      This threw, which was right while `[game]` had `dynamicParams = false`
      and an unknown slug could only mean a bug in a build-time param list.
      Now that a wiki created in the admin renders without a rebuild, an
      unknown slug is an ordinary request for something that does not exist —
      and it arrives here first, because the page component and the layout
      render in parallel, so this throws before the layout's own `notFound()`
      is reached. The result was a 500 where a 404 belongs.

      `notFound()` and not a silent empty filter: the original reasoning still
      holds exactly, and is the reason this function exists. A scoped query
      must never fall back to unfiltered, because that serves one game's
      records on another game's page with nothing in any log.
    */
    notFound()
  }
  return { game: { equals: doc.id } }
}

type BaseOptions = { depth?: number; sort?: string; limit?: number }

/**
 * Require a `game` for the collections that have one, and forbid it for the
 * collections that do not.
 *
 * This is the guard rail. `getAll('quests', {})` does not compile, and neither
 * does `getAll('authors', { game: 'dawnwalker' })` — the second being the
 * mistake that would otherwise return nothing at all and look like missing
 * content rather than a bug.
 */
type Scope<C extends CollectionSlug> = C extends GameScopedCollection
  ? { game: string }
  : { game?: never }

/**
 * The cached read.
 *
 * Every argument is a primitive, which is what makes React's `cache` actually
 * deduplicate: it keys on argument identity, so the options object the public
 * signature takes would be a fresh reference on every call and never hit.
 */
const findAll = cache(
  async (
    collection: CollectionSlug,
    game: string | undefined,
    depth: number,
    sort: string,
    limit: number,
  ): Promise<unknown[]> => {
    assertScoped(collection, game)
    const payload = await client()
    const result = await payload.find({
      collection,
      depth,
      sort,
      limit,
      pagination: false,
      ...(game ? { where: await scopeFor(game) } : {}),
    })
    return result.docs
  },
)

/**
 * What a collection's display field is actually called, where it is not
 * `title`.
 *
 * `sort: 'title'` was the flat default for every collection. Most of the
 * thirteen game-scoped ones do have a `title`, so it worked — but `authors`
 * has `name`, and sorting on a column that does not exist is not an error in
 * Payload: it falls through to whatever order the adapter feels like, which is
 * insertion order in practice. Three of the four `getAll('authors')` call
 * sites got that, and the contributor list on a wiki's About page came out in
 * seed order while the contributors index right beside it — the one call site
 * that passed `sort: 'name'` by hand — came out alphabetical. Nothing errors,
 * nothing logs, and the only symptom is two lists of the same people in two
 * different orders.
 *
 * Keyed by slug rather than guessed from `useAsTitle`, which is admin
 * presentation and not a promise about a sortable column.
 */
const SORT_FIELD: Partial<Record<CollectionSlug, string>> = {
  authors: 'name',
  companies: 'name',
  people: 'name',
  users: 'name',
  media: 'filename',
}

/**
 * Fetch a whole collection. Sizes here are small enough to take in one page.
 *
 * Deliberately not itself wrapped in `cache`: the generic signature *is* the
 * guard, and `cache` erases generics. The caching lives one level down.
 */
export const getAll = async <C extends CollectionSlug>(
  collection: C,
  options: BaseOptions & Scope<C>,
): Promise<DocOf<C>[]> =>
  findAll(
    collection,
    options.game,
    options.depth ?? 1,
    options.sort ?? SORT_FIELD[collection] ?? 'title',
    options.limit ?? 1000,
  ) as Promise<DocOf<C>[]>

/** A record reduced to what a name index needs: what it is called, and where it lives. */
export type NameRow = { id: number | string; slug: string; name: string }

const findNames = cache(
  async (
    collection: CollectionSlug,
    game: string | undefined,
    field: string,
  ): Promise<NameRow[]> => {
    assertScoped(collection, game)
    const payload = await client()
    const result = await payload.find({
      collection,
      depth: 0,
      limit: 2000,
      pagination: false,
      /*
        `select`, and it is the whole reason this is not `getAll`.

        The autolink index wants the titles of thirteen collections on every one
        of ~3,000 prerendered pages. `getAll` returns every column of every row,
        rich text bodies and joined sub-tables included — which is exactly what
        the navigation was doing to arrive at an integer, and what made SQLite
        return SQLITE_BUSY and fail the build at around page six hundred. Three
        columns is a different query.
      */
      select: { slug: true, [field]: true } as never,
      ...(game ? { where: await scopeFor(game) } : {}),
    })
    return (result.docs as Record<string, unknown>[]).flatMap((doc) => {
      const name = doc[field]
      const slug = doc.slug
      // A row with no name or no slug cannot be linked to or matched against.
      // Dropped rather than rendered as an empty link with a broken href.
      if (typeof name !== 'string' || typeof slug !== 'string') return []
      return [{ id: doc.id as number | string, slug, name }]
    })
  },
)

/**
 * Every record in a collection, as `{ id, slug, name }` and nothing else.
 *
 * Same scope guard as `getAll` — a game-scoped collection will not compile
 * without a game — and the same reason for having it here: the filter lives in
 * this file and nowhere else, so a lean read cannot be the one place somebody
 * forgot it.
 *
 * `field` is the column the name is in, because `authors`, `companies` and
 * `people` call it `name` while the thirteen game-scoped collections call it
 * `title`.
 */
export const getNames = async <C extends CollectionSlug>(
  collection: C,
  options: { field?: 'name' | 'title' } & Scope<C>,
): Promise<NameRow[]> => findNames(collection, options.game, options.field ?? 'title')

/**
 * A guide reduced to what a feed needs: how to list it, and how to date it.
 *
 * ## Why this exists rather than `getAll('guides', { sort, limit })`
 *
 * A guide's date is computed, not stored. `guideDates` reads an editor's
 * `updated`, then falls back to the newest `retrieved` on the page's own
 * citations, and the row's `updatedAt` is not in the answer anywhere — it is
 * the afternoon somebody last ran the seed, identical on all 410 guides.
 *
 * The feed asked the database for `sort: '-updatedAt', limit: 30` and then
 * re-sorted those thirty by the real date. The sort was harmless and the limit
 * was not: **which** thirty reached the feed was decided by a column that is
 * the same value on every row, so it was insertion order wearing a sort, and a
 * guide whose sources were genuinely read yesterday could sit outside it
 * forever. The only fix is to date them all and then take the newest, which
 * means reading them all.
 *
 * So it reads them all, and reads six columns to do it. `getAll` returns every
 * column of every row, rich-text bodies included; on Dawnwalker that is 410
 * bodies fetched to publish thirty titles, which is the shape that made
 * SQLite return SQLITE_BUSY and fail a build at page six hundred. `select` is
 * the whole reason this is not `getAll`, the same as `findNames` above.
 */
export type DatedGuide = {
  title: string
  slug: string
  summary?: string | null
  published?: string | null
  updated?: string | null
  sources?: { retrieved?: string | null }[] | null
}

const findDatedGuides = cache(async (game: string): Promise<DatedGuide[]> => {
  assertScoped('guides', game)
  const payload = await client()
  const result = await payload.find({
    collection: 'guides',
    depth: 0,
    limit: 0,
    pagination: false,
    select: {
      title: true,
      slug: true,
      summary: true,
      published: true,
      updated: true,
      sources: true,
    } as never,
    where: await scopeFor(game),
  })
  return result.docs as unknown as DatedGuide[]
})

/** Every guide on a wiki, with the fields `guideDates` needs and nothing else. */
export const getDatedGuides = (game: string): Promise<DatedGuide[]> => findDatedGuides(game)

/**
 * The lead images of a named handful of guides, in one query.
 *
 * The "More guides" rail ranks four hundred guides on six cheap columns and
 * then wants a picture for the six that win. Reading the whole collection at
 * depth 1 to get them is the `limit: 1000, depth: 0` mistake with a join
 * attached; asking for each one separately is six round trips per page across
 * four hundred prerendered pages.
 *
 * `slug` rather than id because that is what the ranker carries, and the slugs
 * come from a query this function's own caller just made — there is no user
 * input anywhere near the `in`.
 */
export const getGuideImages = async (
  game: string,
  slugs: readonly string[],
): Promise<Map<string, unknown>> => {
  if (slugs.length === 0) return new Map()
  assertScoped('guides', game)
  const payload = await client()
  const result = await payload.find({
    collection: 'guides',
    depth: 1,
    limit: slugs.length,
    pagination: false,
    select: { slug: true, image: true } as never,
    where: { and: [await scopeFor(game), { slug: { in: [...slugs] } }] },
  })
  return new Map(
    (result.docs as unknown as { slug: string; image?: unknown }[]).map((doc) => [
      doc.slug,
      doc.image,
    ]),
  )
}

/**
 * Which of a game's named rightsholders actually have a profile.
 *
 * `developer` and `publisher` are free text off a store page, and the link
 * built from one used to be `companyUrl(slugify(name))` with nothing checking
 * the far end — so "Konami, Annapurna Interactive" linked
 * `companies.<domain>/konami-annapurna-interactive`, which 404s, from every
 * page that rendered the block. `lib/rightsholders.ts` splits the string
 * correctly; this is the other half of the rule it states: **a name that does
 * not resolve to a profile is not a link.**
 *
 * One query for every company slug, cached per render — the `findNames` shape,
 * for the same reason. 321 slugs is a set; the alternative is a lookup per
 * name per page.
 */
const companySlugSet = cache(async (): Promise<Set<string>> => {
  const payload = await client()
  const result = await payload.find({
    collection: 'companies',
    depth: 0,
    limit: 0,
    pagination: false,
    select: { slug: true } as never,
  })
  return new Set((result.docs as unknown as { slug?: string }[]).flatMap((doc) => doc.slug ? [doc.slug] : []))
})

/** The rightsholders of a game, each marked with whether a profile exists. */
export const resolveRightsholders = async (
  ...values: (string | null | undefined)[]
): Promise<{ name: string; slug: string; exists: boolean }[]> => {
  const slugs = await companySlugSet()
  return rightsholdersIn(...values).map((holder) => ({ ...holder, exists: slugs.has(holder.slug) }))
}

/**
 * The cover art of a named handful of games, in one query.
 *
 * `companies/[slug]` and `people/[slug]` read their games at depth 1, which
 * populates each game and stops there — `profile.poster` is an upload nested
 * inside a group, so it needs depth 2, and depth 2 on a studio with eleven
 * games pulls eleven games' worth of every other relationship with it.
 *
 * So the posters are fetched on their own, by id, once per page. Same shape as
 * `getGuideImages` and for the same reason: ask for the one field the page
 * actually renders rather than deepening a query that already returns plenty.
 */
export const getGamePosters = async (
  ids: readonly (string | number)[],
): Promise<Map<string | number, unknown>> => {
  if (ids.length === 0) return new Map()
  const payload = await client()
  const result = await payload.find({
    collection: 'games',
    depth: 2,
    limit: ids.length,
    pagination: false,
    select: { profile: true } as never,
    where: { id: { in: [...ids] } },
  })
  return new Map(
    (result.docs as unknown as { id: string | number; profile?: { poster?: unknown } }[]).map(
      (doc) => [doc.id, doc.profile?.poster],
    ),
  )
}

const countIn = cache(
  async (collection: CollectionSlug, game: string | undefined): Promise<number> => {
    assertScoped(collection, game)
    const payload = await client()
    const result = await payload.count({
      collection,
      ...(game ? { where: await scopeFor(game) } : {}),
    })
    return result.totalDocs
  },
)

/**
 * How many records a collection holds for a game.
 *
 * Worth having as its own function rather than `(await getAll(...)).length`,
 * which is what the navigation and the directory did first. That loaded every
 * column of every row — including rich text bodies and two joined sub-tables —
 * across thirteen collections, on every page render, to arrive at an integer.
 *
 * On one game it was merely wasteful. Across seven games and twenty-one build
 * workers it was enough contention to make SQLite return SQLITE_BUSY and fail
 * the build outright, which is how it came to light.
 */
export const countRecords = async <C extends CollectionSlug>(
  collection: C,
  options: Scope<C>,
): Promise<number> => countIn(collection, options.game)

/**
 * Read a game-scoped collection across every game at once.
 *
 * The network needs this in exactly two situations, and both are hub-side: a
 * contributor's profile listing everything they have written, and the hub's
 * own cross-game search. Both genuinely want the union.
 *
 * It is a separate, deliberately wordy function rather than "call `getAll` and
 * leave the game out", because the two must never be confusable. An unscoped
 * read that happens by accident is a content leak; one that happens because
 * somebody typed `getAllAcrossGames` is a decision.
 *
 * Each row comes back with the game it belongs to, since a caller showing
 * mixed results has to be able to say where each one came from and link to the
 * right host.
 */
export const getAllAcrossGames = async <C extends GameScopedCollection>(
  collection: C,
  options: BaseOptions = {},
): Promise<{ doc: DocOf<C>; game: Game }[]> => {
  const games = await getPublishedGames()
  const byId = new Map(games.map((game) => [game.id, game]))

  const payload = await client()
  const result = await payload.find({
    collection,
    depth: options.depth ?? 1,
    sort: options.sort ?? 'title',
    limit: options.limit ?? 1000,
    pagination: false,
    where: { game: { in: games.map((game) => game.id) } },
  })

  return (result.docs as DocOf<C>[]).flatMap((doc) => {
    const ref = (doc as { game?: unknown }).game
    const id = typeof ref === 'object' && ref ? (ref as Game).id : (ref as number)
    const game = byId.get(id)
    // A record whose game is unpublished is not an error, it is just not for
    // readers yet — drop it rather than rendering a link that will 404.
    return game ? [{ doc, game }] : []
  })
}

const findOne = cache(
  async (
    collection: CollectionSlug,
    slug: string,
    game: string | undefined,
    depth: number,
  ): Promise<unknown> => {
    assertScoped(collection, game)
    const payload = await client()
    const result = await payload.find({
      collection,
      where: { ...(game ? await scopeFor(game) : {}), slug: { equals: slug } },
      limit: 1,
      depth,
    })
    return result.docs[0] ?? null
  },
)

export const getBySlug = async <C extends CollectionSlug>(
  collection: C,
  slug: string,
  options: { depth?: number } & Scope<C>,
): Promise<DocOf<C> | null> =>
  findOne(collection, slug, options.game, options.depth ?? 2) as Promise<DocOf<C> | null>

export const getSiteSettings = cache(async () => {
  const payload = await client()
  return payload.findGlobal({ slug: 'site-settings', depth: 0 })
})

/** Canonical origin. The environment wins so staging never claims production URLs. */
export const siteUrl = async (): Promise<string> => {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  const settings = await getSiteSettings()
  return (settings.domain || 'http://localhost:3000').replace(/\/$/, '')
}

/**
 * The public origin for one game's wiki.
 *
 * Subdomains are the network's routing scheme, so a game's canonical URL is
 * not the network origin plus a path — it is its own host. Everything
 * canonical, every sitemap entry and every feed link has to agree on this.
 *
 * Localhost is handled rather than special-cased away: `*.localhost` resolves
 * to 127.0.0.1 in Chrome and Firefox without a hosts entry, so development
 * exercises the same code path production does.
 */
export const gameUrl = async (game: Pick<Game, 'slug' | 'subdomain'>): Promise<string> => {
  const base = await siteUrl()
  const url = new URL(base)
  const label = game.subdomain || game.slug
  return `${url.protocol}//${label}.${url.host}`
}

/** Relationship fields come back as an id or a populated object depending on depth. */
export const rel = <T extends { id: string | number }>(value: unknown): T | null =>
  value && typeof value === 'object' ? (value as T) : null

export const relMany = <T extends { id: string | number }>(value: unknown): T[] =>
  Array.isArray(value) ? value.filter((entry): entry is T => Boolean(entry) && typeof entry === 'object') : []

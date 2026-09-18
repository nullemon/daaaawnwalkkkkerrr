import { companyUrl, externalSite, personUrl, HUB_ORIGIN } from './urls'
import { slugify } from '../fields/shared'

/**
 * Structured data, as one graph rather than three unconnected blobs.
 *
 * ## Why `@id` is the whole design
 *
 * A wiki says Capcom developed Onimusha. The companies host has a page about
 * Capcom. The people host has a page about its president. Emitted as three
 * separate documents, each naming the others only as a string, a consumer gets
 * three unrelated things that happen to share a spelling — and "Capcom" the
 * string is not "Capcom" the organisation with a founding date and a parent.
 *
 * So every entity this network describes has one canonical `@id`, built from
 * the page that is *about* it, and every reference elsewhere points at that id
 * rather than repeating the entity. That is what makes the graph join up
 * across three hosts, and it is the reason these helpers live in one file
 * instead of next to the pages that use them: two files would drift, and a
 * drifted `@id` does not error — it silently describes a second entity.
 *
 * ## What is deliberately not emitted
 *
 * **Any third party's score, in any form.** The network no longer holds one:
 * it is not harvested, not stored and not shown. It was never emitted here
 * either, and the reason it was refused is the reason it is gone everywhere
 * else — a borrowed score in this page's `aggregateRating` says this site
 * collected those reviews, which is false and is invisible because nobody
 * proofreads JSON-LD.
 *
 * This site's *own* score is a different matter and is emitted — as a `Review`,
 * which is what one signed opinion is. `aggregateRating` means an average of
 * many, so it appears only once readers have actually voted and it carries the
 * count; a single editorial score published as an aggregate of one is the same
 * overstatement in a smaller hat.
 *
 * **`offers`.** A price is on the game record and it is real, but `offers` on
 * a page that does not sell the thing claims this site is a seller. The store
 * page is in `sameAs` instead, which is what it actually is: another page
 * about the same game.
 *
 * **Anything the record does not have.** Every builder omits rather than
 * guesses, for the same reason the pages do. A `datePublished` on an
 * unconfirmed release window is the clearest case: an announced date is not a
 * publication date, and a machine reading it cannot tell the difference.
 */

type Json = Record<string, unknown>

/** Drop keys whose value is empty, so a builder can list everything it might emit. */
const compact = (value: Json): Json =>
  Object.fromEntries(
    Object.entries(value).filter(([, entry]) => {
      if (entry === null || entry === undefined || entry === '') return false
      if (Array.isArray(entry) && entry.length === 0) return false
      return true
    }),
  )

// --- identity -------------------------------------------------------------

/**
 * The canonical id of an entity, which is its page plus a fragment naming what
 * kind of thing the page is about.
 *
 * The fragment matters. A company's page is a `WebPage`; the company is an
 * `Organization` described *by* that page, and giving both the same id says
 * the web page was founded in 1979 and has 387 employees.
 */
export const gameId = (base: string): string => `${base}#videogame`
export const orgId = (slug: string): string => `${companyUrl(`/${slug}`)}#organization`
export const personId = (slug: string): string => `${personUrl(`/${slug}`)}#person`
export const networkId = (): string => `${HUB_ORIGIN}#organization`

/**
 * A reference to a company we may or may not have a profile for.
 *
 * The game records hold developer and publisher as free text — "Konami,
 * Annapurna Interactive" — and most of those names do have a profile on the
 * companies host, matched by slug. Where one does, the reference is the `@id`
 * and the graph joins. Where it does not, it degrades to a named Organization
 * with no id, which is still true and still useful, rather than pointing at a
 * page that will 404.
 */
export const orgRef = (name: string, known: ReadonlySet<string>): Json => {
  const slug = slugify(name)
  return known.has(slug)
    ? { '@id': orgId(slug) }
    : { '@type': 'Organization', name }
}

const orgRefs = (value: string | null | undefined, known: ReadonlySet<string>): Json[] =>
  (value ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => orgRef(name, known))

/**
 * A date a machine should be given, or nothing.
 *
 * `born` on a person is free text because sources write "c. 1970" and "1980s",
 * and `schema.org/birthDate` is a Date. Handing it "c. 1970" is malformed;
 * handing it "1970-01-01" invents a day and a month about a living person.
 * Only a value that already is a full ISO date survives.
 */
export const isoDate = (value: string | null | undefined): string | undefined => {
  const text = (value ?? '').trim()
  if (!text) return undefined

  /*
    Matched, not parsed.

    `Date.parse` is far too willing: it reads "c. 1970" as 1 January 1970 and
    returns a valid timestamp, so a guard written as "parse it and check it is
    not NaN" lets exactly the values through that it exists to stop. The test
    that caught this asserted "c. 1970" produced nothing and got 1969-12-31 —
    the local-midnight shift, on a date nobody stated.

    So only shapes that genuinely carry a day, a month and a year are accepted.
    Everything else a source writes — a bare year, a decade, a circa — is not a
    date and does not become one.
  */
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10)

  const DAY_FIRST = /^\d{1,2} [A-Za-z]+ \d{4}$/
  const MONTH_FIRST = /^[A-Za-z]+ \d{1,2},? \d{4}$/
  if (!DAY_FIRST.test(text) && !MONTH_FIRST.test(text)) return undefined

  const parsed = Date.parse(`${text} UTC`)
  if (Number.isNaN(parsed)) return undefined
  return new Date(parsed).toISOString().slice(0, 10)
}

// --- the entities ---------------------------------------------------------

export type GameForSchema = {
  title: string
  shortTitle?: string | null
  summary?: string | null
  platforms?: (string | null)[] | null
  developer?: string | null
  publisher?: string | null
  releaseDate?: string | null
  releaseDateConfirmed?: boolean | null
  storeUrl?: string | null
  profile?: {
    genre?: string | null
    series?: string | null
    engine?: string | null
    modes?: (string | null)[] | null
    maxPlayers?: string | null
  } | null
}

/**
 * The game a wiki is about.
 *
 * Every field was hardcoded to Dawnwalker's — down to a `datePublished` that
 * was not even Dawnwalker's — and the only reason that never reached a page is
 * that nothing called it. Structured data is read by machines and not by
 * anybody proofreading, so wiring the old version up on eight wikis would have
 * told Google that Silent Hill: Townfall was authored by Rebel Wolves and
 * nobody would have noticed.
 */
export const videoGame = (
  base: string,
  game: GameForSchema,
  options: {
    image?: string | null
    description?: string | null
    knownCompanies?: ReadonlySet<string>
  } = {},
): Json => {
  const known = options.knownCompanies ?? new Set<string>()
  const platforms = (game.platforms ?? []).filter((value): value is string => Boolean(value))
  const modes = (game.profile?.modes ?? []).filter((value): value is string => Boolean(value))

  const sameAs = [game.storeUrl].filter((value): value is string => Boolean(value))

  return compact({
    '@context': 'https://schema.org',
    '@type': 'VideoGame',
    '@id': gameId(base),
    name: game.title,
    alternateName: game.shortTitle && game.shortTitle !== game.title ? game.shortTitle : undefined,
    url: base,
    description: options.description || game.summary || undefined,
    image: options.image || undefined,
    gamePlatform: platforms,
    genre: game.profile?.genre || undefined,
    gameEngine: game.profile?.engine || undefined,
    /* `playMode` takes the schema.org enumeration; ours are store categories,
       so only the three that map exactly are emitted. */
    playMode: modes
      .map((mode) =>
        mode === 'single-player'
          ? 'SinglePlayer'
          : mode === 'co-op' || mode === 'online-co-op'
            ? 'CoOp'
            : mode === 'multiplayer' || mode === 'online-pvp' || mode === 'pvp'
              ? 'MultiPlayer'
              : null,
      )
      .filter((mode): mode is 'SinglePlayer' | 'CoOp' | 'MultiPlayer' => Boolean(mode))
      .filter((mode, index, all) => all.indexOf(mode) === index),
    numberOfPlayers: game.profile?.maxPlayers || undefined,
    publisher: orgRefs(game.publisher, known),
    author: orgRefs(game.developer, known),
    /* Schema calls the studio the creator; readers call them the developer.
       Both are emitted because consumers look for different ones. */
    creator: orgRefs(game.developer, known),
    // An announced window is not a publication date. Only a confirmed one is
    // a fact worth handing to a search engine as structured data.
    datePublished:
      game.releaseDate && game.releaseDateConfirmed
        ? game.releaseDate.slice(0, 10)
        : undefined,
    sameAs,
    isPartOf: { '@id': `${base}#website` },
  })
}

export type CompanyForSchema = {
  name: string
  slug: string
  summary?: string | null
  website?: string | null
  founded?: string | null
  founders?: string | null
  country?: string | null
  headquarters?: string | null
  employees?: string | null
  industry?: string | null
  defunct?: string | null
  formerNames?: string | null
}

/** A studio or publisher. */
export const organization = (
  company: CompanyForSchema,
  options: {
    image?: string | null
    sources?: (string | null | undefined)[]
    parent?: { slug: string } | null
    subsidiaries?: { slug: string }[]
    people?: { slug: string }[]
  } = {},
): Json => {
  const url = companyUrl(`/${company.slug}`)
  /*
    `sameAs` is for other pages about the same organisation. The company's own
    site belongs in `url`… except `url` here is our page about them, so the
    official site goes in `sameAs` alongside the Wikipedia article the facts
    came from. That is what lets a consumer reconcile this record with one it
    already holds.
  */
  const sameAs = [externalSite(company.website), ...(options.sources ?? [])]
    .map((value) => (value ?? '').trim())
    .filter(Boolean)
    .filter((value, index, all) => all.indexOf(value) === index)

  return compact({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': orgId(company.slug),
    name: company.name,
    alternateName: company.formerNames || undefined,
    url,
    description: company.summary || undefined,
    logo: options.image || undefined,
    image: options.image || undefined,
    foundingDate: isoDate(company.founded) ?? (/^\d{4}$/.test((company.founded ?? '').trim()) ? company.founded!.trim() : undefined),
    /* A dissolution date is the single most useful thing this kind of page can
       carry, and the one most often missing elsewhere.

       Read the same two ways `foundingDate` above is, and that is the fix
       rather than a tidy-up: a bare-year test alone dropped every closure the
       source wrote as a full date — "June 7, 2012", "15 April 2015" — which is
       half of the seventy closed companies on this host. Those profiles
       published an Organization with a founding date and no dissolution date
       at all, so a machine reading the graph was told when 38 Studios started
       and never told it had ended, while the page above it carried a red
       banner saying so. `isoDate` still refuses anything that is not a real
       date, so "2000 (2000) (original), 2005 (2005)" stays out. */
    dissolutionDate:
      isoDate(company.defunct) ??
      (/^\d{4}$/.test((company.defunct ?? '').trim()) ? company.defunct!.trim() : undefined),
    founder: (company.founders ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)
      .map((name) => ({ '@type': 'Person', name })),
    numberOfEmployees: company.employees
      ? { '@type': 'QuantitativeValue', value: company.employees }
      : undefined,
    address: company.headquarters
      ? { '@type': 'PostalAddress', streetAddress: company.headquarters, addressCountry: company.country ?? undefined }
      : company.country
        ? { '@type': 'PostalAddress', addressCountry: company.country }
        : undefined,
    parentOrganization: options.parent ? { '@id': orgId(options.parent.slug) } : undefined,
    subOrganization: (options.subsidiaries ?? []).map((child) => ({ '@id': orgId(child.slug) })),
    employee: (options.people ?? []).map((person) => ({ '@id': personId(person.slug) })),
    sameAs,
  })
}

export type PersonForSchema = {
  name: string
  slug: string
  summary?: string | null
  knownFor?: string | null
  born?: string | null
  birthPlace?: string | null
  nationality?: string | null
  alsoKnownAs?: string | null
  website?: string | null
}

/** A director, designer, composer or actor. */
export const person = (
  record: PersonForSchema,
  options: {
    image?: string | null
    sources?: (string | null | undefined)[]
    companies?: { slug: string }[]
    games?: { url: string }[]
  } = {},
): Json => {
  const url = personUrl(`/${record.slug}`)
  const sameAs = [externalSite(record.website), ...(options.sources ?? [])]
    .map((value) => (value ?? '').trim())
    .filter(Boolean)
    .filter((value, index, all) => all.indexOf(value) === index)

  return compact({
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': personId(record.slug),
    name: record.name,
    alternateName: record.alsoKnownAs || undefined,
    url,
    description: record.summary || undefined,
    image: options.image || undefined,
    jobTitle: record.knownFor || undefined,
    /*
      Only a full date. `born` is free text because sources write "c. 1970",
      and a `birthDate` of 1970-01-01 invents a day and a month about a living
      person — the one place on this site where a tidy-looking guess has a cost
      beyond being wrong.
    */
    birthDate: isoDate(record.born),
    birthPlace: record.birthPlace ? { '@type': 'Place', name: record.birthPlace } : undefined,
    nationality: record.nationality ? { '@type': 'Country', name: record.nationality } : undefined,
    worksFor: (options.companies ?? []).map((company) => ({ '@id': orgId(company.slug) })),
    /* What they made, pointing at the game entity rather than naming it. */
    subjectOf: (options.games ?? []).map((game) => ({ '@id': gameId(game.url) })),
    sameAs,
  })
}

/**
 * The site itself, and the network that publishes it.
 *
 * One per host. `WebSite` is what carries a site name into a search result and
 * is the anchor the game, company and person entities hang off through
 * `isPartOf`, so without it the graph has no root.
 */
export const webSite = (
  base: string,
  options: { name: string; description?: string | null; searchPath?: string },
): Json =>
  compact({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${base}#website`,
    url: base,
    name: options.name,
    description: options.description || undefined,
    publisher: { '@id': networkId() },
    potentialAction: options.searchPath
      ? {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: `${base}${options.searchPath}?q={search_term_string}`,
          },
          'query-input': 'required name=search_term_string',
        }
      : undefined,
  })

/** The publisher of the whole network, referenced by every host's WebSite. */
export const networkOrganization = (options: {
  name: string
  legalEntity?: string | null
  email?: string | null
  logo?: string | null
}): Json =>
  compact({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': networkId(),
    name: options.name,
    url: HUB_ORIGIN,
    legalName: options.legalEntity || undefined,
    logo: options.logo || undefined,
    email: options.email || undefined,
  })

export const breadcrumbs = (base: string, crumbs: { label: string; href?: string }[]): Json => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: crumbs.map((crumb, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: crumb.label,
    ...(crumb.href ? { item: crumb.href.startsWith('http') ? crumb.href : `${base}${crumb.href}` } : {}),
  })),
})

/** A directory page: the list, so a consumer can see what is on the host. */
export const itemList = (
  base: string,
  items: { name: string; url: string }[],
  options: { name?: string } = {},
): Json =>
  compact({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: options.name || undefined,
    url: base,
    numberOfItems: items.length,
    itemListElement: items.slice(0, 100).map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      url: item.url,
    })),
  })

/**
 * The scores, as a second node about the same game.
 *
 * Separate from `videoGame()` for two reasons, both of them mistakes this made
 * on the way here.
 *
 * **It is emitted on one page, not every page.** `videoGame()` is called from
 * the wiki layout, because what it says — which game this site is about — is
 * true of every page under it. A rating is not: a quest page carried a
 * machine-readable score that nothing on that page stated, which is a claim
 * made only to a crawler. This is called from the home page, where the verdict
 * is actually printed.
 *
 * **An outlook is not a review and gets no `Review`.** `src/fields/rating.ts`
 * says the page must not let a reader think an outlook is a review, and the
 * visible half honours that with a label — while the JSON-LD was publishing
 * `reviewRating: 7.9` for a game out in October whose own review body opens
 * "An outlook". A machine cannot read the caveat, so the honest thing is to
 * publish no review at all until somebody can say what the game is like.
 *
 * Two nodes sharing an `@id` describe one entity; a consumer merges them. That
 * is the whole point of the id scheme.
 */
export const gameScores = (
  base: string,
  options: {
    rating?: {
      score?: number | null
      rationale?: string | null
      ratedOn?: string | null
      basis?: string | null
    } | null
    readers?: { average: number; count: number } | null
  },
): Json | null => {
  const rating = options.rating
  const isReview =
    typeof rating?.score === 'number' &&
    Boolean(rating.rationale) &&
    rating.basis !== 'outlook' &&
    Boolean(rating.basis)

  const readers = options.readers && options.readers.count > 0 ? options.readers : null
  if (!isReview && !readers) return null

  return compact({
    '@context': 'https://schema.org',
    '@type': 'VideoGame',
    '@id': gameId(base),
    review: isReview
      ? compact({
          '@type': 'Review',
          reviewRating: {
            '@type': 'Rating',
            ratingValue: rating!.score,
            bestRating: 10,
            worstRating: 0,
          },
          author: { '@id': networkId() },
          reviewBody: rating!.rationale,
          datePublished: rating!.ratedOn ? rating!.ratedOn.slice(0, 10) : undefined,
        })
      : undefined,
    /* Only an average of people. One editorial score is not an aggregate. */
    aggregateRating: readers
      ? {
          '@type': 'AggregateRating',
          ratingValue: Number(readers.average.toFixed(1)),
          ratingCount: readers.count,
          bestRating: 10,
          worstRating: 1,
        }
      : undefined,
  })
}

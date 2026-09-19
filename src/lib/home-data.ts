import type { IconName } from '@/components/Icon'
import type { HubTarget } from '@/components/HubSearch'
import { directory, type DirectoryEntry } from '@/lib/directory'
import { whatPeopleAreAsking } from '@/lib/asking'
import { client, getAllAcrossGames, getSiteSettings, gameUrl } from '@/lib/payload'
import { companyUrl, personUrl } from '@/lib/urls'
import type { Media, SiteSetting } from '@/payload-types'

/**
 * Everything the hub home page puts on the screen, gathered once.
 *
 * This was the first eighty lines of the page component, and it moved here the
 * day a second page needed the same screen: `/home-preview` renders six
 * candidate layouts of this hub so the owner can pick one. Six layouts reading
 * the database themselves would be six chances to disagree with the page they
 * are auditioning for — the failure `src/lib/audit.ts` was consolidated to
 * end, where two implementations of one question both look right until the day
 * they differ and nobody can tell which is lying.
 *
 * So: one reader, and the preview is showing the real thing.
 *
 * Nothing here decides anything about layout. It returns the counts, the
 * directory, the questions, the newest writing, the house rules and the search
 * targets, and every variant composes those however it likes.
 */

const RULE_ICONS = ['check', 'warn', 'scroll', 'link'] as const

export const ruleIcon = (name: string | null | undefined): IconName =>
  (RULE_ICONS as readonly string[]).includes(name ?? '') ? (name as IconName) : 'check'

/** The four that ship, used whenever the editable array is empty. */
export const BUILT_IN_RULES: { icon: IconName; heading: string; body: string }[] = [
  {
    icon: 'check',
    heading: 'Nothing is invented',
    body: 'Every figure comes from a source and can be traced. A record with no source is refused at import.',
  },
  {
    icon: 'warn',
    heading: 'Unknown is not zero',
    body: 'Where nobody has published a number, the page says so. A plausible guess costs a reader a playthrough.',
  },
  {
    icon: 'scroll',
    heading: 'Disagreements are recorded',
    body: 'Where two sources differ, both appear. Quietly picking one hides what a careful reader came for.',
  },
  {
    icon: 'link',
    heading: 'Sources are on the page',
    body: 'Each record carries its citations and the date they were read, so you can check the work yourself.',
  },
]

export type LatestEntry = {
  id: string
  title: string
  href: string
  summary?: string | null
  wiki: string
  /** The wiki's favicon: small, and every wiki has one. */
  icon: string
  /** The article's own lead image. Every one of the 597 has one. */
  image: Media | null
}

/** A studio or publisher this network covers, with its mark. */
export type CompanyEntry = {
  id: string | number
  name: string
  href: string
  logo: Media | null
  /** How many of our games are theirs. */
  games: number
  role?: string | null
}

/** Somebody credited on one of these games, with a photograph. */
export type PersonEntry = {
  id: string | number
  name: string
  href: string
  photo: Media | null
  knownFor?: string | null
  /** Which kind of source credits them; decides the order and the filter. */
  basis: string
}

export type HomeData = {
  settings: SiteSetting
  wikis: DirectoryEntry[]
  asking: Awaited<ReturnType<typeof whatPeopleAreAsking>>
  latest: LatestEntry[]
  targets: HubTarget[]
  rules: { icon: IconName; heading: string; body: string }[]
  totalPages: number
  upcoming: number
  /*
    The other two hosts. They are the half of this network the hub never
    mentioned: 306 studio profiles and 741 people, reachable only by knowing
    that `companies.` and `people.` exist.
  */
  companies: CompanyEntry[]
  people: PersonEntry[]
  companyCount: number
  peopleCount: number
  guideCount: number
  /** The wiki whose key art fronts the network, and that art. */
  featured?: DirectoryEntry
  heroArt: Media | null
  /** `lastVerified`, only when it parses as a date. */
  verified: Date | null
}

export const homeData = async (): Promise<HomeData> => {
  const [settings, wikis, asking] = await Promise.all([
    getSiteSettings(),
    directory(),
    whatPeopleAreAsking(12),
  ])

  const recent = await getAllAcrossGames('guides', { depth: 1, sort: '-updatedAt', limit: 6 })
  const latest = await Promise.all(
    recent.slice(0, 6).map(async ({ doc, game }) => ({
      id: `${game.slug}-${doc.id}`,
      title: doc.title,
      href: `${await gameUrl(game)}/guides/${doc.slug}`,
      summary: doc.summary,
      wiki: game.shortTitle || game.title,
      icon: `/wiki-assets/${game.slug}/icon-32.png`,
      image: doc.image && typeof doc.image === 'object' ? (doc.image as Media) : null,
    })),
  )

  /*
    The companies and people hosts, on the hub at last.

    306 studio profiles and 741 people sat on two subdomains the front page
    never named, which is the "a page nothing links to is the same failure as
    an empty sitemap" rule pointed at two whole hosts. The counts come from
    `countRecords`, so they are the same figures those hosts print.

    **A company is shown only if it has a logo and made one of our games.**
    Ten qualify. The condition is not squeamishness about empty cells: a
    profile on this network exists because a sourced article named the
    company, and most of the 306 are there as somebody's parent or subsidiary
    rather than because they made anything a reader here recognises. Putting
    those on the front page would be padding the shelf.

    A person is shown only if there is a freely licensed photograph, which is
    25 of 741 — the honest fraction, and the reason `tools/fetch-person-photos`
    refuses a non-free press shot of somebody's face.
  */
  const payload = await client()

  const companyRows = await payload.find({
    collection: 'companies',
    depth: 1,
    limit: 0,
    pagination: false,
  })

  const companies: CompanyEntry[] = (
    companyRows.docs as unknown as Record<string, unknown>[]
  )
    .filter((row) => row.logo && Array.isArray(row.games) && row.games.length > 0)
    .map((row) => ({
      id: row.id as string | number,
      name: String(row.name ?? ''),
      href: companyUrl(`/${row.slug}`),
      logo: row.logo && typeof row.logo === 'object' ? (row.logo as Media) : null,
      games: (row.games as unknown[]).length,
      role: typeof row.role === 'string' ? row.role : null,
    }))
    /* Most of our games first, then alphabetical — a total order, so the row
       does not reshuffle between builds on ties. */
    .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name))

  const peopleRows = await payload.find({
    collection: 'people',
    depth: 1,
    limit: 0,
    pagination: false,
  })

  /*
    Credited on one of these games, and photographed.

    `wiki-mention` is excluded, and that is the load-bearing half. It is the
    basis for somebody a franchise wiki names *without* crediting them on a
    game this network covers — Christophe Gans directed the Silent Hill films
    and is all over the wiki Townfall is compiled from. Sorted alphabetically
    he was the fifth face on the front page under the heading "People", which
    reads as a claim that he worked on these games. `basis` exists to stop
    exactly that, and a list that ignores it undoes the distinction the people
    host is built on.

    Ordered by how directly the credit attaches: the game's own infobox first,
    then a character's, then by name so ties are stable between builds.
  */
  const CREDIT_ORDER: Record<string, number> = { 'game-credit': 0, 'character-credit': 1 }

  const people: PersonEntry[] = (peopleRows.docs as unknown as Record<string, unknown>[])
    .filter((row) => row.photo && CREDIT_ORDER[String(row.basis)] !== undefined)
    .map((row) => ({
      id: row.id as string | number,
      name: String(row.name ?? ''),
      href: personUrl(`/${row.slug}`),
      photo: row.photo && typeof row.photo === 'object' ? (row.photo as Media) : null,
      knownFor: typeof row.knownFor === 'string' ? row.knownFor : null,
      basis: String(row.basis ?? ''),
    }))
    .sort(
      (a, b) =>
        (CREDIT_ORDER[a.basis] ?? 9) - (CREDIT_ORDER[b.basis] ?? 9) ||
        a.name.localeCompare(b.name),
    )

  /*
    `count()` rather than reading the rows and taking `.length`. The audit code
    learned this one the hard way: a `find({ limit: 2000 })` reported "343 of
    2000" for a library of 2,254, a denominator wrong in the reassuring
    direction. These three are printed on the front page as the size of the
    network, so they are counted rather than sampled.
  */
  const [companyCount, peopleCount, guideCount] = await Promise.all([
    payload.count({ collection: 'companies' }),
    payload.count({ collection: 'people' }),
    payload.count({ collection: 'guides' }),
  ]).then((results) => results.map((result) => result.totalDocs))

  const totalPages = wikis.reduce((sum, wiki) => sum + wiki.pages, 0)
  const upcoming = wikis.filter(
    (wiki) => wiki.game.releaseDate && new Date(wiki.game.releaseDate).getTime() > Date.now(),
  ).length

  /*
    Whose key art fronts the network. `heroWiki` on Site settings; blank still
    means `wikis[0]`, and an id that no longer matches a published wiki falls
    back the same way rather than dropping the art — a game can be unpublished
    long after somebody chose it here. The reasoning about why this is a field
    at all is on the page that shipped it.
  */
  const featured = wikis.find((entry) => entry.game.id === settings.heroWiki) ?? wikis[0]
  const heroArt =
    featured && typeof featured.game.theme?.hero === 'object'
      ? (featured.game.theme.hero as Media)
      : null

  /* An unparseable stored date is not a date: no row rather than "Invalid Date". */
  const verifiedAt = settings.lastVerified ? new Date(settings.lastVerified) : null
  const verified = verifiedAt && Number.isFinite(verifiedAt.getTime()) ? verifiedAt : null

  /*
    The editor's rules if there are any, otherwise the four that shipped. A
    half-filled array is not a reason to fall back — `heading` and `body` are
    both required in the schema, so a row that exists is a row with words in
    it. An empty array is the blank that means "use the built-in".
  */
  const stored = settings.rules ?? []
  const rules =
    stored.length > 0
      ? stored.map((rule) => ({
          icon: ruleIcon(rule.icon),
          heading: rule.heading,
          body: rule.body,
        }))
      : BUILT_IN_RULES

  /* Wikis first in search, then the headline pages of each. */
  const targets: HubTarget[] = [
    ...wikis.map((entry) => ({
      label: entry.game.shortTitle || entry.game.title,
      sub: `${entry.pages.toLocaleString('en-GB')} pages · ${entry.game.status}`,
      href: entry.url,
      icon: `/wiki-assets/${entry.game.slug}/icon-32.png`,
      kind: 'wiki' as const,
    })),
    ...latest.map((entry) => ({
      label: entry.title,
      sub: entry.wiki,
      href: entry.href,
      icon: entry.icon,
      kind: 'page' as const,
    })),
  ]

  return {
    settings,
    wikis,
    asking,
    latest,
    targets,
    rules,
    totalPages,
    upcoming,
    companies,
    people,
    companyCount,
    peopleCount,
    guideCount,
    featured,
    heroArt,
    verified,
  }
}

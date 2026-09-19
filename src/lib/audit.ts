import type { Payload, Where } from 'payload'
import { GAME_SCOPED, SECTION_PATH, type GameScopedCollection } from './tenancy'
import { hostFor, hostLabelProblem } from './host-label'
import { isSeededPublishedAt } from './guide-dates'
import { daysSinceRelease, isReleased } from './released'
import { editorialScore } from './verdict'
import { demoDatesOn } from './sitemap-dates'
import { adminUrl } from './admin-path'

/**
 * Everything this network knows is unfinished, computed once.
 *
 * ## Why this is a library and not a script
 *
 * `pnpm check:launch` asked these questions from `src/seed/audit.ts` and the
 * admin dashboard asked two of them again, in its own words, from its own
 * queries. That is two implementations of "does this wiki have a Search
 * Console token", and the day they disagree the owner has no way to tell which
 * one is lying — which is the same failure as every other entry in this
 * project's gotchas list: nothing errors, both look right, and the wrong one
 * is the reassuring one.
 *
 * So the checks live here, the CLI prints them, and the admin renders them.
 * One pass, one set of numbers, one place to change a rule.
 *
 * ## What is deliberately not here
 *
 * The two checks that read the repository rather than the database — a
 * `[game]` route exporting one static metadata title for eight wikis, and the
 * shared files under `public/` — are in `audit-source.ts`. They are findings
 * about source code, nobody can act on them from the admin, and importing
 * `fs` into a module the admin renders is a footgun waiting for the first
 * client component that imports a type from here.
 *
 * ## Honesty rules this file follows
 *
 * - **A count is over the whole collection.** The scan this replaced used
 *   `find({ limit: 2000 })`, which silently stopped at two thousand rows and
 *   reported "343 of 2000 images have no credit line" for a library of 2,254.
 *   A truncated denominator is a figure wrong in the reassuring direction,
 *   which is worse than no figure.
 * - **Nothing is rounded to zero.** If a query cannot run, the pass throws and
 *   the caller says so. A dashboard reporting "nothing needs you" because a
 *   query failed is the exact shape of bug this whole project exists to avoid.
 * - **`actor` is not decoration.** It decides whether a finding is presented
 *   as a chore or as a gap nobody can close yet, and `blocked` findings are
 *   never shown as actions. `CLAUDE.md`'s Outstanding section is the authority
 *   on which is which.
 */

export type FindingLevel = 'blocking' | 'warn' | 'note'

/**
 * Who can actually do something about this.
 *
 *   owner      — only the person who owns the accounts can supply it: a
 *                Search Console token, an analytics ID, the network's real
 *                name, a real contributor in place of a placeholder.
 *   editorial  — work somebody with the sources in hand can do: a summary,
 *                a credit line, key art.
 *   blocked    — waiting on a source nobody has published. Never an action.
 *   info       — an answer, not a task. "Serves on companies.example.com".
 */
export type FindingActor = 'owner' | 'editorial' | 'blocked' | 'info'

/**
 * Where in the admin the fix is.
 *
 * `entity` is what gets the nav badge; `href` is where the row links to.
 *
 * `where` exists because **Payload 3.89 cannot deep-link a tab**: the active
 * tab is stored in user preferences, not in the URL, and nothing in
 * `@payloadcms/ui` reads `location.hash` to pick one. The `#field-…` fragment
 * lands on the field when its tab happens to be open and does nothing when it
 * is not, so the tab has to be named in words as well. A row that says "no
 * Search Console token" and leaves somebody hunting through six tabs has not
 * done the job the badge promised.
 */
export type FindingTarget = {
  entity: { kind: 'collection' | 'global'; slug: string; label: string }
  href: string
  where?: string
}

export type Finding = {
  level: FindingLevel
  actor: FindingActor
  /** The left-hand column in the CLI report: a wiki slug, a collection, a host. */
  area: string
  /** The sentence the CLI prints and the dashboard row shows. */
  detail: string
  /** How many things this is about. 36 placeholder contributors is 36, not 1. */
  count: number
  target?: FindingTarget
}

export type WikiRow = {
  id: string | number
  title: string
  slug: string
  status: string
  releaseDate?: string | null
  records: number
}

export type QueueRow = { label: string; count: number; href: string }

export type AuditSnapshot = {
  findings: Finding[]
  /** Per wiki, counted in the same pass the findings came from. */
  wikis: WikiRow[]
  /** Reader submissions waiting on a moderator. */
  queues: QueueRow[]
  /** What the pass cost, so a dashboard can say rather than imply. */
  cost: { queries: number; ms: number }
}

/* -------------------------------------------------------------------------- */
/* Admin URLs                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The DOM id Payload gives a field input.
 *
 * `path.replace(/\./g, '__')` — see `TextInput` in `@payloadcms/ui`. Written
 * here rather than inline at seven call sites so that if Payload changes it,
 * one line is wrong instead of seven silently-dead anchors.
 */
export const fieldAnchor = (path: string): string => `#field-${path.replace(/\./g, '__')}`

const docHref = (collection: string, id: string | number, field?: string): string =>
  `${adminUrl('/collections')}/${collection}/${id}${field ? fieldAnchor(field) : ''}`

const globalHref = (slug: string, field?: string): string =>
  `${adminUrl('/globals')}/${slug}${field ? fieldAnchor(field) : ''}`

/**
 * A filtered list view, as a URL.
 *
 * `or` is a list of AND-groups, which is the shape Payload's list view parses
 * out of the query string (`where[or][0][and][0][field][operator]=value`). It
 * is the only way to express "empty string **or** never set", and both of
 * those are states Payload hands back for a field nobody filled in — treating
 * one of them as filled is how a gap goes missing from a filtered list that
 * looks authoritative.
 *
 * Exported for the unit test, which is the only thing that would notice this
 * silently ceasing to filter: a list view given a `where` it cannot parse
 * shows every row and no error.
 */
export const listHref = (collection: string, or: Where[][] = [], limit = 50): string => {
  const params = [`limit=${limit}`]
  or.forEach((group, groupIndex) => {
    group.forEach((clause, clauseIndex) => {
      for (const [field, condition] of Object.entries(clause)) {
        for (const [operator, operand] of Object.entries(
          condition as Record<string, unknown>,
        )) {
          params.push(
            `where[or][${groupIndex}][and][${clauseIndex}][${field}][${operator}]=` +
              encodeURIComponent(operand === null || operand === undefined ? '' : String(operand)),
          )
        }
      }
    })
  })
  return `${adminUrl('/collections')}/${collection}?${params.join('&')}`
}

/** "Empty string or never set", which is the only honest test for a text field. */
const BLANK = (field: string): Where[][] => [
  [{ [field]: { exists: false } }],
  [{ [field]: { equals: '' } }],
]

/* -------------------------------------------------------------------------- */
/* Turning findings into something a person can act on                        */
/* -------------------------------------------------------------------------- */

/** One thing to do, and every place it is true. */
export type ActionRow = {
  level: FindingLevel
  actor: FindingActor
  detail: string
  /** Every place this is true, added up. Eight wikis with no token is 8. */
  count: number
  /** Where to click. More than one entry when the same gap spans wikis. */
  places: { area: string; href?: string; where?: string }[]
  /** The nav entry these all live under, when they share one. */
  entity?: FindingTarget['entity']
}

const LEVEL_ORDER: Record<FindingLevel, number> = { blocking: 0, warn: 1, note: 2 }

/**
 * Collapse findings into rows, one per distinct thing to do.
 *
 * Eight wikis with no Search Console token is one job with eight places, not
 * eight jobs. Printing it as eight rows is how a list of five real tasks
 * becomes forty lines nobody reads — and the count is the honest part, so it
 * stays on the row while the places become links.
 *
 * `info` findings are never rows. "Serves on companies.example.com" is an
 * answer, not a task, and the moment an answer is listed as a task the list
 * stops meaning anything.
 */
export const groupFindings = (findings: Finding[], actor: FindingActor): ActionRow[] => {
  const rows = new Map<string, ActionRow>()

  for (const finding of findings) {
    if (finding.actor !== actor || finding.actor === 'info') continue
    const existing = rows.get(finding.detail)
    const place = {
      area: finding.area,
      href: finding.target?.href,
      where: finding.target?.where,
    }
    if (existing) {
      existing.count += finding.count
      existing.places.push(place)
      // Findings that share a sentence but not a home lose the shared entity
      // rather than claiming one of them — a badge on the wrong nav entry is
      // worse than no badge.
      if (existing.entity?.slug !== finding.target?.entity.slug) existing.entity = undefined
      continue
    }
    rows.set(finding.detail, {
      level: finding.level,
      actor: finding.actor,
      detail: finding.detail,
      count: finding.count,
      places: [place],
      entity: finding.target?.entity,
    })
  }

  return [...rows.values()].sort(
    (a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || b.count - a.count,
  )
}

/**
 * How many things are waiting behind each nav entry — the literal `(1)`.
 *
 * Two rules, both about not lying:
 *
 * - **Deduplicated by href.** The companies host and the people host both
 *   report a missing Search Console token and both point at the one network
 *   field, so that is one field waiting, not two. Counting a screen's single
 *   empty box twice inflates a badge, and a badge that overstates gets
 *   ignored as fast as one that understates.
 * - **`blocked` never counts.** Seventy-eight quests with no published segment
 *   cost is the state of the world, not a chore, and a badge is a chore. They
 *   appear on the dashboard under their own heading instead.
 */
export const badgeCounts = (
  findings: Finding[],
): { entity: FindingTarget['entity']; count: number }[] => {
  const perHref = new Map<string, { entity: FindingTarget['entity']; count: number }>()

  for (const finding of findings) {
    if (finding.actor !== 'owner' && finding.actor !== 'editorial') continue
    if (!finding.target) continue
    const key = finding.target.href
    const seen = perHref.get(key)
    if (!seen || finding.count > seen.count) {
      perHref.set(key, { entity: finding.target.entity, count: finding.count })
    }
  }

  const perEntity = new Map<string, { entity: FindingTarget['entity']; count: number }>()
  for (const row of perHref.values()) {
    const key = `${row.entity.kind}:${row.entity.slug}`
    const seen = perEntity.get(key)
    if (seen) seen.count += row.count
    else perEntity.set(key, { entity: row.entity, count: row.count })
  }

  return [...perEntity.values()].sort(
    (a, b) => b.count - a.count || a.entity.label.localeCompare(b.entity.label),
  )
}

/** Where a nav entry's own screen is, for the badge to link to. */
export const entityHref = (entity: FindingTarget['entity']): string =>
  entity.kind === 'global'
    ? `${adminUrl('/globals')}/${entity.slug}`
    : `${adminUrl('/collections')}/${entity.slug}`

/* -------------------------------------------------------------------------- */
/* The pass                                                                   */
/* -------------------------------------------------------------------------- */

const GAMES: FindingTarget['entity'] = { kind: 'collection', slug: 'games', label: 'Games' }
const SETTINGS: FindingTarget['entity'] = {
  kind: 'global',
  slug: 'site-settings',
  label: 'Site settings',
}
const AUTHORS: FindingTarget['entity'] = {
  kind: 'collection',
  slug: 'authors',
  label: 'Contributors',
}
const MEDIA: FindingTarget['entity'] = { kind: 'collection', slug: 'media', label: 'Media' }
const GUIDES: FindingTarget['entity'] = { kind: 'collection', slug: 'guides', label: 'Guides' }
const UI_STRINGS: FindingTarget['entity'] = {
  kind: 'global',
  slug: 'ui-strings',
  label: 'Interface text',
}

/**
 * A collection nobody wrote a label for.
 *
 * The slug, made readable. Not read off the Payload config on purpose: this
 * module is imported by a CLI that has a `Payload` instance and by the admin
 * that has another, and a label is not worth making either of them the
 * authority. If a collection's admin label and this ever read differently,
 * the nav entry is still the one the owner clicks.
 */
const collectionEntity = (slug: string): FindingTarget['entity'] => ({
  kind: 'collection',
  slug,
  label: slug.replace(/-/g, ' ').replace(/^./, (first) => first.toUpperCase()),
})

/* -------------------------------------------------------------------------- */
/* Pages nothing links to                                                     */
/* -------------------------------------------------------------------------- */

/**
 * What "an inbound internal link" means on this network, and why it has to be
 * defined before it can be counted.
 *
 * Nothing on this site authors a link to a section. The rail, the footer
 * columns and the sitemap are all derived from `sectionsFor`, which returns
 * only the sections a wiki has at least one record in; a detail page is linked
 * from its own section index, which lists every row. So the link graph is a
 * consequence of the data rather than something an editor maintains, and the
 * honest question is not "did somebody forget a link" but **"is there any rule
 * in this codebase that puts this page in front of a reader, and does the data
 * satisfy it?"**
 *
 * Three things deliberately do **not** count as an inbound link:
 *
 * - **The sitemap.** It is a file for crawlers. A page listed only there is
 *   reachable by typing the URL or by arriving from a search result, which is
 *   the state the "empty section index served the wrong game's copy" defect
 *   lived in for months.
 * - **`/search-index.json`.** A reader who never types the name never sees the
 *   entry, and the index is data rather than a page with anchors on it.
 * - **The run planner and the other tools.** They link records a reader has
 *   already selected. A page reachable only after somebody has picked it out
 *   of a tool is not linked from anywhere they could have found it.
 *
 * Inline prose links (`Linked`, via `lib/link-index.ts`) are real links and
 * would count — but they are matched at render time from a name index, so
 * whether a given record is named in some other record's summary cannot be
 * answered without rendering every page. Counting them would make this check
 * *under*-report, never over-report: a page this finding names has no link
 * from any index, rail, footer or tile, which is the claim being made.
 */

/**
 * The section indexes that answer 404, rather than 200, on an empty
 * collection.
 *
 * All sixteen, now. Seven of them have since the "a section with no records
 * still served a 200" fix — Dawnwalker-only sections, where an empty index on
 * one of the other seven wikis was serving Dawnwalker's copy under a
 * Dawnwalker heading. The other nine answered 200 with a heading over nothing
 * on a URL the rail, the footer and the sitemap had all left out, which was
 * nineteen live pages across the network: `/maps` on all eight wikis,
 * `/achievements` on the four whose game is not out, `/quests` on four,
 * and one each of `/regions`, `/enemies` and `/items`.
 *
 * The rule is the same in both halves and it is worth stating once: **an
 * empty section is not that wiki's section.** The link graph here is derived
 * rather than authored — `sectionsFor` returns only the sections a wiki has
 * records in, and the rail, the footer columns and the sitemap all read it —
 * so a 200 on an empty one cannot be linked to by construction. It lifts by
 * itself the moment the first record arrives, which is what `pnpm refresh`
 * the week a game launches is for.
 *
 * The set is kept, rather than deleted as a constant that is now every
 * member, because the check below is what catches the *seventeenth*
 * collection: a new game-scoped section copied from a route that has the
 * guard keeps it, and one written fresh does not.
 *
 * This restates a fact that lives in each route file, which is normally the
 * thing this module exists to avoid. It cannot be imported: those are Next.js
 * server components that pull in the Payload config. So it is pinned instead —
 * `audit.test.ts` reads all sixteen `page.tsx` files and fails if this list and
 * their `notFound()` calls disagree, on the commit that changes either.
 */
export const GUARDS_EMPTY_INDEX: ReadonlySet<GameScopedCollection> = new Set<GameScopedCollection>(
  [
    'achievements',
    'builds',
    'characters',
    'court-activities',
    'courts',
    'endings',
    'enemies',
    'factions',
    'guides',
    'items',
    'maps',
    'mechanics',
    'perks',
    'quests',
    'regions',
    'skill-trees',
  ],
)

/**
 * How many rows each listing page can actually render.
 *
 * Every index on this network reads its collection in one query with a fixed
 * `limit` and no pagination, so a collection that grows past that limit does
 * not paginate — the surplus rows simply stop appearing, while they stay in
 * the database, in the sitemap and on their own detail pages. That is the
 * shape of the bug that put 199 company profiles on no page a reader could
 * reach, arriving through a different door.
 *
 * Nothing is over a limit today. This is the guard for the day something is,
 * and it is the reason the numbers are here rather than being discovered:
 * there is no error when a `find` returns exactly `limit` rows.
 *
 * Pinned against the routes by `audit.test.ts`, for the same reason as above.
 */
export const LISTING_LIMIT = {
  /** `getAll`'s default in `lib/payload.ts`, which every section index takes. */
  section: 1000,
  /** `companies/page.tsx`. */
  companies: 500,
  /** `people/page.tsx`. */
  people: 1000,
} as const

/** The sentence both the empty-index findings share, so they group as one row. */
const unreachable = (path: string): string =>
  `${path} answers 200 with nothing on it and nothing links to it — an empty index is off the rail, out of the footer and out of the sitemap, so it is reachable only by typing the URL or from a search result`

/**
 * Ask every question, in the order `pnpm check:launch` has always asked them.
 *
 * The order is load-bearing: the CLI groups findings by level and prints each
 * group in push order, so moving a check moves a line of a report somebody
 * diffs. Add new checks at the end of the section they belong to.
 *
 * Throws if the database will not answer. That is right for the CLI, which
 * exits non-zero, and the admin wrapper catches it — see
 * `components/admin/audit-snapshot.ts`.
 */
export async function auditNetwork(payload: Payload): Promise<AuditSnapshot> {
  const startedAt = Date.now()
  let queries = 0
  const findings: Finding[] = []

  const add = (finding: Finding) => findings.push(finding)

  const count = async (collection: string, where?: Where): Promise<number> => {
    queries += 1
    const result = await payload.count({
      collection: collection as Parameters<Payload['count']>[0]['collection'],
      ...(where ? { where } : {}),
    })
    return result.totalDocs
  }

  /** How many rows are blank in a text-ish field, counting '' as blank. */
  const countBlank = (collection: string, field: string, scope?: Where): Promise<number> =>
    count(collection, {
      or: BLANK(field).map((group) => ({ and: scope ? [scope, ...group] : group })),
    })

  queries += 2
  const [settings, games] = await Promise.all([
    payload.findGlobal({ slug: 'site-settings', depth: 0 }),
    payload.find({ collection: 'games', limit: 100, sort: 'title', depth: 0 }),
  ])

  const root = (process.env.NEXT_PUBLIC_SITE_URL || 'example.com')
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')

  // --- The network itself --------------------------------------------------
  if (!process.env.NEXT_PUBLIC_SITE_URL) {
    add({
      level: 'warn',
      /*
        No target. This one is an environment variable on the deployment, not a
        field in the admin, and pointing the owner at a screen where it cannot
        be typed would be worse than pointing them nowhere.
      */
      actor: 'owner',
      area: 'network',
      detail: 'NEXT_PUBLIC_SITE_URL is unset — fine locally, required in production',
      count: 1,
    })
  }
  if (settings.legalProvisional) {
    add({
      level: 'blocking',
      actor: 'owner',
      area: 'network',
      detail:
        'Legal details are still stand-ins (Site settings → Legal & contact). Privacy, terms and contact render a warning until this is unticked.',
      count: 1,
      target: {
        entity: SETTINGS,
        href: globalHref('site-settings', 'legalProvisional'),
        where: 'Legal & contact tab',
      },
    })
  }
  /*
    Demo dates in the sitemap, reported for exactly as long as they are on.

    This is the one thing on the site that publishes a figure it made up, and
    it is on by the owner's request for a demo. It renders nowhere a reader
    looks, which is the whole problem: nobody will notice it at launch, and
    what it costs is the credibility of the one sitemap field Google reads.

    `owner`, because nothing in the admin changes it — it is `SITEMAP_DEMO_DATES`
    in the environment. `warn` rather than `blocking` for the same reason the
    licence line is a warning: it is a decision somebody made, not a mistake,
    and a checklist that refuses to finish over a deliberate choice is a
    checklist people learn to skip.
  */
  if (demoDatesOn()) {
    add({
      level: 'warn',
      actor: 'owner',
      area: 'network',
      detail:
        'the sitemap is publishing spread demo dates, not real ones — every page gets its own invented <lastmod>. Set SITEMAP_DEMO_DATES=off before launch',
      count: 1,
    })
  }

  if (!settings.siteName || settings.siteName === 'Vellum') {
    add({
      level: 'note',
      actor: 'owner',
      area: 'network',
      detail: `Network is still called "${settings.siteName}" — a working name`,
      count: 1,
      target: {
        entity: SETTINGS,
        href: globalHref('site-settings', 'siteName'),
        where: 'Identity tab',
      },
    })
  }

  const networkVerification = (settings.verification as { google?: string } | undefined)?.google
  const networkAnalytics = settings.analytics as
    | { ga4Id?: string; gtmId?: string; plausibleDomain?: string }
    | undefined
  const hasNetworkAnalytics = Boolean(
    networkAnalytics?.ga4Id || networkAnalytics?.gtmId || networkAnalytics?.plausibleDomain,
  )
  /*
    The network's own page-view counting, which is not one of the fields above
    and is not a third-party service at all.

    It matters here because of what this pass used to say. "No analytics
    configured" was true when the only analytics on offer was somebody else's
    script; it reads as "nobody is counting anything" now that /admin/analytics
    exists and is on, and an owner reading that would either go and sign up for
    a service they do not need or conclude the numbers they are looking at are
    not real. Neither is a good outcome for a line of text.

    `!== false` because a global nobody has saved hands back `undefined` for a
    checkbox, and the default is on.
  */
  const countingOurselves =
    (settings.analytics as { firstParty?: boolean } | undefined)?.firstParty !== false

  // --- Per wiki ------------------------------------------------------------
  const wikis: WikiRow[] = []

  for (const game of games.docs) {
    const where: Where = { game: { equals: game.id } }
    const label = `${game.slug}`
    const gameTarget = (field?: string, tab?: string): FindingTarget => ({
      entity: GAMES,
      href: docHref('games', game.id, field),
      where: tab,
    })

    /*
      The host this wiki will answer on.

      There is nothing to configure per wiki - the deployment serves
      `*.<domain>` behind a wildcard certificate and `proxy.ts` maps the label
      onto the path - so the only way this goes wrong is a label DNS will not
      accept. That is now refused in the admin, but a record created before
      the check existed, or written by a script, can still carry one.
    */
    const wikiHost = String((game as { subdomain?: string }).subdomain || game.slug)
    const hostProblem = hostLabelProblem(wikiHost)
    if (hostProblem) {
      add({
        level: 'blocking',
        actor: 'owner',
        area: String(game.slug),
        detail: `host label "${wikiHost}" will not resolve — ${hostProblem}`,
        count: 1,
        // No `where`: `subdomain` is a top-level field on the Game, not inside
        // a group or a tab, so naming a container would send somebody looking
        // for one that does not exist.
        target: gameTarget('subdomain'),
      })
    } else {
      add({
        level: 'note',
        actor: 'info',
        area: String(game.slug),
        detail: `serves on ${hostFor(wikiHost, root)}`,
        count: 1,
      })
    }

    const counts = await Promise.all(
      GAME_SCOPED.map(async (collection) => ({ collection, n: await count(collection, where) })),
    )
    const records = counts.reduce((sum, row) => sum + row.n, 0)

    /*
      Pages on this wiki that nothing links to.

      Free: these are the counts the dashboard table already needs, asked once
      and read twice. A `planned` game is skipped because none of its pages
      exist — `getPublishedGames` leaves it out, so there is no route to be
      unreachable.

      The detail deliberately names the path and not the wiki, so that eight
      wikis with an unreachable `/maps` collapse into one row with eight
      places rather than eight rows saying the same thing.
    */
    if (game.status !== 'planned') {
      for (const { collection, n } of counts) {
        if (n === 0 && !GUARDS_EMPTY_INDEX.has(collection)) {
          add({
            level: 'warn',
            actor: 'editorial',
            area: label,
            detail: unreachable(SECTION_PATH[collection]),
            count: 1,
            /*
              No target, and not an oversight. There is no field in the admin
              that makes a route answer 404, and filing this against the
              collection's list view would badge "Quests (4)" at four wikis for
              games nobody has played — a chore the Outstanding section of
              CLAUDE.md exists to refuse.
            */
          })
        }
        if (n > LISTING_LIMIT.section) {
          add({
            level: 'blocking',
            actor: 'editorial',
            area: label,
            detail: `${n} records in ${collection}, and its index renders the first ${LISTING_LIMIT.section} — the rest are in the database and in the sitemap, on no page a reader can reach. Raise the limit in \`getAll\` or paginate the index.`,
            count: n - LISTING_LIMIT.section,
            target: {
              entity: collectionEntity(collection),
              href: listHref(collection),
            },
          })
        }
      }
    }

    wikis.push({
      id: game.id,
      title: String(game.title),
      slug: String(game.slug),
      status: String(game.status),
      releaseDate: game.releaseDate as string | null | undefined,
      records,
    })

    const theme = game.theme as { hero?: unknown; logo?: unknown; accent?: string } | undefined
    if (!theme?.hero) {
      add({
        level: 'warn',
        actor: 'editorial',
        area: label,
        detail: 'no hero art — the wiki home opens on a flat background',
        count: 1,
        target: gameTarget('theme.hero', 'Theme'),
      })
    }
    if (!theme?.logo) {
      add({
        level: 'warn',
        actor: 'editorial',
        area: label,
        detail: 'no capsule art — the hub rail falls back to a generic icon',
        count: 1,
        target: gameTarget('theme.logo', 'Theme'),
      })
    }
    if (!theme?.accent) {
      add({
        level: 'note',
        actor: 'editorial',
        area: label,
        detail: 'no accent colour set',
        count: 1,
        target: gameTarget('theme.accent', 'Theme'),
      })
    }

    if (!game.summary) {
      add({
        level: 'warn',
        actor: 'editorial',
        area: label,
        detail: 'no summary — used as the meta description and card blurb',
        count: 1,
        target: gameTarget('summary'),
      })
    }
    if (!game.tagline) {
      add({
        level: 'note',
        actor: 'editorial',
        area: label,
        detail: 'no tagline',
        count: 1,
        target: gameTarget('tagline'),
      })
    }
    if (!game.releaseDate) {
      add({
        level: 'note',
        actor: 'editorial',
        area: label,
        detail: 'no release date',
        count: 1,
        target: gameTarget('releaseDate'),
      })
    }

    /*
      The two things the release gate cannot say out loud.

      `editorialScore` withholds a score before launch and says nothing while
      it does, which is right on the page and useless to the person running
      the site: the failure is silent in the reassuring direction, and the
      whole point of this file is that nothing on this network is allowed to
      be. So the gate is asked the same question here, from the other side.

      Note `daysSinceRelease` rather than a bare "is it out". A game that came
      out yesterday needs nobody; one that came out five weeks ago and still
      has no verdict is the site's only opinion missing from a wiki where it
      could finally be earned. The number is in the sentence so the row argues
      for itself.
    */
    const out = isReleased(game as Parameters<typeof isReleased>[0])
    const printed = editorialScore(game as Parameters<typeof editorialScore>[0])
    const rating = game.rating as { score?: number | null; rationale?: string | null } | undefined

    if (out && !rating?.score) {
      const days = daysSinceRelease(game as Parameters<typeof daysSinceRelease>[0]) ?? 0
      add({
        level: days >= 14 ? 'warn' : 'note',
        actor: 'editorial',
        area: label,
        detail: `out ${days === 0 ? 'today' : `${days} day${days === 1 ? '' : 's'} ago`} and this site has no verdict on it — somebody has played it now`,
        count: 1,
        target: gameTarget('rating.score', 'Our rating'),
      })
    }

    /*
      A score that is filled in and does not appear anywhere.

      Three ways in: no rationale (the original rule — a number with no
      argument behind it does not render), or a stored `outlook`, which
      `fields/rating.ts` no longer offers and which expires rather than being
      promoted when the game ships. An editor who typed 8.9 into a box and saw
      nothing change on the site has no way to find out why, and every one of
      these is a sentence somebody wrote that nobody will ever read.
    */
    if (out && rating?.score && !printed) {
      add({
        level: 'warn',
        actor: 'editorial',
        area: label,
        detail: rating.rationale
          ? 'has a score that is not printed anywhere — it was written as an outlook, which expires at launch rather than becoming a review'
          : 'has a score with no reasoning under it, so nothing is printed — a number on its own is what every other site publishes',
        count: 1,
        target: gameTarget('rating.rationale', 'Our rating'),
      })
    }

    /*
      A score sitting on a game that is not out.

      It renders nowhere — `isReleased` refuses it, which is the owner's rule
      and the reason the "outlook" option was removed — so nothing looks wrong
      today. What it does is wait: on release day `editorialScore` starts
      printing it, and what gets printed is a verdict written before anybody
      could have played the game, dated whenever it was typed.

      Four rows were in exactly that state and nothing anywhere said so. They
      carried `basis: 'outlook'`, which `verdict.ts` reads as "expire this
      rather than promoting it" — a guard that works and that nobody can see,
      and that a well-meaning repair of the *other* problem those rows caused
      (a withdrawn select value refuses every write to its document, so
      `pnpm seed` died on them) would quietly remove by blanking the field.

      So it is a finding rather than a guard. It is `editorial` because the
      answer is a person deciding: delete it, or leave it and rewrite it the
      week the game ships. `blocked` would be wrong — nothing about this is
      waiting on a source nobody has published.
    */
    if (!out && typeof rating?.score === 'number') {
      add({
        level: 'warn',
        actor: 'editorial',
        area: label,
        detail:
          'carries a score although the game is not out — it prints nothing today and starts printing on release day, as a verdict written before anybody could play it',
        count: 1,
        target: gameTarget('rating.score', 'Our rating'),
      })
    }

    if (game.status === 'live' || game.status === 'building') {
      const own = game.verification as { google?: string } | undefined
      if (!own?.google && !networkVerification) {
        add({
          level: 'warn',
          actor: 'owner',
          area: label,
          detail: 'no Search Console token — each subdomain is its own property',
          count: 1,
          target: gameTarget('verification.google', 'Search engine verification'),
        })
      }

      const analytics = game.analytics as
        | { ga4Id?: string; gtmId?: string; plausibleDomain?: string }
        | undefined
      if (
        !analytics?.ga4Id &&
        !analytics?.gtmId &&
        !analytics?.plausibleDomain &&
        !hasNetworkAnalytics
      ) {
        add({
          level: 'note',
          actor: countingOurselves ? 'info' : 'owner',
          area: label,
          detail: countingOurselves
            ? 'no third-party analytics ID — this wiki is counted by the network’s own page-view measurement, under Analytics in the sidebar, so this is only worth setting if you want Google’s numbers as well'
            : 'nothing is counting page views on this wiki — the network’s own measurement is switched off and no third-party ID is set',
          count: 1,
          target: gameTarget('analytics.ga4Id', 'Analytics'),
        })
      }
    }

    if (records === 0 && game.status !== 'planned') {
      add({
        level: 'warn',
        actor: 'editorial',
        area: label,
        detail: 'live with no content at all',
        count: 1,
        target: gameTarget('status'),
      })
    }
  }

  // --- The two network hosts -----------------------------------------------
  /*
    `companies.<domain>` and `people.<domain>` are sites in the same sense the
    eight wikis are: their own shell, their own canonical origin, their own
    sitemap, their own entry in Search Console. This checklist did not know
    they existed — it walks the `games` collection, and neither of them is a
    game — so 918 pages were exempt from every question it asks, including the
    two it exists for: does this host resolve, and has anybody given it a
    verification token.

    They are listed here by hand rather than derived, because that is what they
    are: `NETWORK_SUBDOMAINS` in `proxy.ts` is also a hand-written list, and it
    is the thing that makes these labels unavailable to a wiki. A third network
    host belongs in both places.
  */
  const NETWORK_HOSTS: {
    label: string
    collection: 'companies' | 'people'
    /** The host's own settings record, which now carries its own token. */
    global: 'companies-site' | 'people-site'
  }[] = [
    { label: 'companies', collection: 'companies', global: 'companies-site' },
    { label: 'people', collection: 'people', global: 'people-site' },
  ]

  /*
    Each host's own verification token, read once.

    This check used to report "there is no per-host field to set one", which
    was true and was the finding: a Search Console property is a hostname, so
    the apex's token verifies the apex and neither of these. The field exists
    now, on each host's own global, so the check asks the right record and
    points a badge at a screen that can actually clear it.
  */
  const hostVerification = new Map<string, boolean>()
  for (const host of NETWORK_HOSTS) {
    try {
      const own = (await payload.findGlobal({ slug: host.global, depth: 0 })) as unknown as {
        verification?: Record<string, unknown>
      }
      hostVerification.set(
        host.label,
        Object.values(own?.verification ?? {}).some(
          (value) => typeof value === 'string' && value.trim() !== '',
        ),
      )
    } catch {
      hostVerification.set(host.label, false)
    }
  }
  for (const host of NETWORK_HOSTS) {
    const problem = hostLabelProblem(host.label)
    if (problem) {
      add({
        level: 'blocking',
        actor: 'owner',
        area: host.label,
        detail: `host label "${host.label}" will not resolve — ${problem}`,
        count: 1,
      })
    } else {
      add({
        level: 'note',
        actor: 'info',
        area: host.label,
        detail: `serves on ${hostFor(host.label, root)}`,
        count: 1,
      })
    }

    const total = await count(host.collection)
    /*
      The same question the wikis are asked, on the two hosts that are not
      wikis. Their indexes read the whole collection in one query and group it
      by `basis` with a catch-all group, so every row is on the page — up to
      the limit, which is the only way a profile can fall off it now. A
      hundred and ninety-nine of them once did, when the grouping had no
      catch-all, and nothing said so.
    */
    const cap = LISTING_LIMIT[host.collection]
    if (total > cap) {
      add({
        level: 'blocking',
        actor: 'editorial',
        area: host.label,
        detail: `${total} ${host.collection} profiles, and the index renders the first ${cap} — the rest are in the database and in the sitemap, on no page a reader can reach.`,
        count: total - cap,
        target: {
          entity: collectionEntity(host.collection),
          href: listHref(host.collection),
        },
      })
    }
    if (total === 0) {
      add({
        level: 'warn',
        actor: 'editorial',
        area: host.label,
        detail: 'host is reachable with nothing on it',
        count: 1,
        target: { entity: collectionEntity(host.collection), href: listHref(host.collection) },
      })
    } else {
      add({
        level: 'note',
        actor: 'info',
        area: host.label,
        detail: `${total} profiles`,
        count: total,
      })
    }

    /*
      The same warning each wiki gets, for the same reason: a subdomain is its
      own Search Console property and the network's token does not cover it.

      The badge points at this host's own settings record, which is where the
      field is. It used to point at Site settings and say there was no per-host
      field — a finding the owner could not act on, which is the decoration
      this feature exists to replace.
    */
    if (!hostVerification.get(host.label) && !networkVerification) {
      add({
        level: 'warn',
        actor: 'owner',
        area: host.label,
        detail: 'no Search Console token — this subdomain is its own property',
        count: 1,
        target: {
          entity: collectionEntity(host.collection),
          href: globalHref(host.global, 'verification.google'),
          where: 'Search engines tab',
        },
      })
    }
    if (!hasNetworkAnalytics) {
      add({
        level: 'note',
        actor: countingOurselves ? 'info' : 'owner',
        area: host.label,
        detail: countingOurselves
          ? 'no third-party analytics ID — this host is counted by the network’s own page-view measurement, under Analytics in the sidebar'
          : 'nothing is counting page views on this host — the network’s own measurement is switched off and no third-party ID is set',
        count: 1,
        target: {
          entity: SETTINGS,
          href: globalHref('site-settings', 'analytics.ga4Id'),
          where: 'SEO & analytics tab — the network ID; this host has no field of its own',
        },
      })
    }
  }

  // --- Content quality across every wiki -----------------------------------
  /*
    Counted rather than scanned.

    This was `find({ limit: 2000, pagination: false })` per collection, which
    loaded every column of every row — rich text bodies included — to arrive at
    two integers, and stopped at two thousand. Sixteen collections of that was
    360ms and a denominator that would start lying the moment a collection grew
    past the limit. `media` already had.
  */
  for (const collection of GAME_SCOPED) {
    const total = await count(collection)

    const noSummary = await countBlank(collection, 'summary')
    if (noSummary > 0) {
      add({
        level: 'warn',
        actor: 'editorial',
        area: collection,
        detail: `${noSummary} of ${total} have no summary — that is the meta description too`,
        count: noSummary,
        target: {
          entity: collectionEntity(collection),
          href: listHref(collection, BLANK('summary')),
        },
      })
    }

    // `sources.url` is a required subfield, so a row with no source at all is
    // a row with no `sources.url` — the same test as an empty array, one query
    // instead of a table scan.
    const noSources = await count(collection, { 'sources.url': { exists: false } })
    if (noSources > 0) {
      add({
        level: 'note',
        actor: 'editorial',
        area: collection,
        detail: `${noSources} of ${total} carry no source citation`,
        count: noSources,
        target: {
          entity: collectionEntity(collection),
          href: listHref(collection, [[{ 'sources.url': { exists: false } }]]),
        },
      })
    }
  }

  // --- Media ---------------------------------------------------------------
  const mediaTotal = await count('media')
  const noAlt = await countBlank('media', 'alt')
  if (noAlt > 0) {
    add({
      level: 'blocking',
      actor: 'editorial',
      area: 'media',
      detail: `${noAlt} images have no alt text`,
      count: noAlt,
      target: { entity: MEDIA, href: listHref('media', BLANK('alt')) },
    })
  }

  const noCredit = await countBlank('media', 'credit')
  if (noCredit > 0) {
    add({
      level: 'note',
      actor: 'editorial',
      area: 'media',
      detail: `${noCredit} of ${mediaTotal} images have no credit line`,
      count: noCredit,
      target: { entity: MEDIA, href: listHref('media', BLANK('credit')) },
    })
  }

  // --- Contributors --------------------------------------------------------
  const authorsTotal = await count('authors')
  const provisional = await count('authors', { provisional: { equals: true } })
  if (provisional > 0) {
    add({
      level: 'note',
      actor: 'owner',
      area: 'authors',
      /*
        The flag prints nothing on the site any more — it is an editorial one,
        for this list and this report. That makes the count matter *more*, not
        less: there is no longer a notice on the profile telling a reader the
        byline is a stand-in, so an invented name reads as a person until
        somebody replaces it.
      */
      detail: `${provisional} of ${authorsTotal} are placeholders — the flag is admin-only and prints nothing on the site, so their bylines read as real names and their profiles stay indexed unless "noindex" is ticked separately`,
      count: provisional,
      target: {
        entity: AUTHORS,
        href: listHref('authors', [[{ provisional: { equals: true } }]]),
        where: 'the list, filtered to the placeholders',
      },
    })
  }
  const noAvatar = await count('authors', { avatar: { exists: false } })
  if (noAvatar > 0) {
    add({
      level: 'warn',
      actor: 'editorial',
      area: 'authors',
      detail: `${noAvatar} have no avatar`,
      count: noAvatar,
      target: { entity: AUTHORS, href: listHref('authors', [[{ avatar: { exists: false } }]]) },
    })
  }

  // --- Guides --------------------------------------------------------------
  /*
    Publication dates that were computed rather than known.

    An earlier rule hashed each guide's slug into an offset and scattered the
    four hundred guides across the previous thirty days, so the dates looked
    like an editorial schedule. They were not one. A generated guide has no
    publication day at all — the page came into being when a generator ran and
    will come into being again, identically, the next time one does — and a
    plausible date under a headline is indistinguishable from a real one, which
    is what makes it worse than a blank. `src/lib/guide-dates.ts` carries the
    full argument.

    **So the fix is to clear the date, not to correct it.** `published` is an
    editor's field now and nothing else writes it; blank means no "Published"
    row on the page, no `datePublished` in the Article markup and no fallback
    to a row timestamp. What the page shows instead is "last checked" — the
    most recent `sources[].retrieved`, the day a harvester actually read the
    page being cited, which is a fact and survives a rebuild.
    `pnpm seed:publish` clears every fabricated date it finds.

    This reads zero on a database seeded since that change. It is kept because
    a database seeded before it will not be, and nothing else would say so:
    there is no flag to read, so "was this computed" is answered by recomputing
    it, which also means the finding clears itself the moment somebody blanks
    or replaces a date with no checkbox for anybody to remember.

    `select`, because this runs on every admin dashboard load and a default
    read would drag four hundred Lexical bodies over to compare two columns —
    the shape of query that made `next build` abort with SQLITE_BUSY.
  */
  queries += 1
  const datedGuides = await payload.find({
    collection: 'guides',
    where: { published: { exists: true } },
    limit: 2000,
    depth: 0,
    pagination: false,
    select: { slug: true, published: true } as never,
  })
  const seededDates = datedGuides.docs.filter((guide) =>
    isSeededPublishedAt(
      (guide as { slug?: string }).slug ?? '',
      (guide as { published?: string | null }).published,
    ),
  ).length
  if (seededDates > 0) {
    add({
      /*
        `warn`, not `note`, and `editorial`, not `owner`. It was a note while
        these dates were scaffolding somebody meant to replace; they are
        fabrications now — a date computed from a slug, published as a fact
        about when an article went up — and clearing one needs the sources in
        hand rather than an account nobody else has.
      */
      level: 'warn',
      actor: 'editorial',
      area: 'guides',
      detail: `${seededDates} of ${datedGuides.docs.length} dated guides carry a publication date computed from their slug rather than one anybody stated — clear it. A generated guide has no publication day, and the page prints "last checked" from its own citations instead`,
      count: seededDates,
      target: {
        entity: GUIDES,
        href: listHref('guides'),
        where: 'each guide, Provenance tab — empty the "Published" field, or run pnpm seed:publish to clear them all',
      },
    })
  }

  /*
    An override row pointing at a key nobody kept. It does nothing, looks
    saved, and reads exactly like an edit that would not stick.
  */
  try {
    queries += 1
    const ui = await payload.findGlobal({ slug: 'ui-strings', depth: 0 })
    const registry = await import('./ui-registry')
    const orphans = [
      ...((ui?.strings ?? []) as { key?: string | null }[]).filter(
        (row) => row?.key && !(row.key in registry.UI_DEFAULTS),
      ),
      ...((ui?.labels ?? []) as { key?: string | null }[]).filter(
        (row) => row?.key && !(row.key in registry.LABEL_DEFAULTS),
      ),
    ].map((row) => row.key)
    if (orphans.length > 0) {
      add({
        level: 'warn',
        actor: 'editorial',
        area: 'interface text',
        detail: `${orphans.length} override${orphans.length === 1 ? '' : 's'} point at keys that no longer exist: ${orphans.slice(0, 5).join(', ')}`,
        count: orphans.length,
        target: { entity: UI_STRINGS, href: globalHref('ui-strings') },
      })
    }
  } catch {
    // The global has never been saved. Nothing to orphan.
  }

  // --- Reader submissions --------------------------------------------------
  /*
    Not a launch finding — a queue. The CLI ignores these; the dashboard was
    already counting them and there is no reason to pay for the pass twice.
  */
  const [pending, corrections, requests] = await Promise.all([
    count('comments', { status: { equals: 'pending' } }),
    count('corrections', { status: { equals: 'new' } }),
    count('requests', { status: { equals: 'new' } }),
  ])

  const queues: QueueRow[] = [
    {
      label: 'Comments awaiting approval',
      count: pending,
      href: listHref('comments', [[{ status: { equals: 'pending' } }]]),
    },
    { label: 'New corrections', count: corrections, href: listHref('corrections') },
    { label: 'New feature requests', count: requests, href: listHref('requests') },
  ]

  return { findings, wikis, queues, cost: { queries, ms: Date.now() - startedAt } }
}

/* -------------------------------------------------------------------------- */
/* Search Console                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Does a token reach this host at all?
 *
 * One line, exported, because the per-wiki finding above and the property list
 * below both have to answer it and the whole reason this module exists is that
 * they once answered it separately. A wiki's own value wins and an empty one
 * inherits the network's — the same rule `resolveTags` applies when it renders
 * the tag, and the rule that makes "the network token covers everything" false
 * only for the two hosts that never render it.
 */
export const resolvedToken = (
  own: string | null | undefined,
  network: string | null | undefined,
): { value: string; from: 'own' | 'network' } | null => {
  const mine = (own ?? '').trim()
  if (mine) return { value: mine, from: 'own' }
  const theirs = (network ?? '').trim()
  return theirs ? { value: theirs, from: 'network' } : null
}

/** The bare domain every host on this network hangs off. */
export const networkRoot = (): string =>
  (process.env.NEXT_PUBLIC_SITE_URL || 'example.com')
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')

export type SearchConsoleProperty = {
  kind: 'hub' | 'wiki' | 'network'
  /** The label in front of the network domain; empty on the apex. */
  label: string
  host: string
  /** The URL-prefix property to add, exactly as Search Console wants it typed. */
  property: string
  /** The sitemap to submit once it is verified. */
  sitemap: string
  /** The token this host will actually serve, and whose it is. */
  token: { value: string; from: 'own' | 'network' } | null
  /** Where to paste one in the admin, and which tab it is on. */
  href: string
  where: string
  /** How many records the wiki has, for ordering. Zero for the two hosts. */
  records: number
}

/**
 * Every Search Console property this network needs, in the order to add them.
 *
 * Ten of them: the apex, eight wikis and the two network hosts. Each is its
 * own origin, and a search engine treats an origin as a separate site — a
 * token verified at `example.com` does nothing for `dawnwalker.example.com`,
 * which is the whole reason `verificationFields` exists twice.
 *
 * The order is biggest wiki first, after the apex, because that is the order
 * the work pays off in and because `directory()` already sorts the network
 * that way — a property added for a wiki with nine pages buys nine pages of
 * reporting.
 *
 * This is a *list*, not a finding: whether a host has a token is asked once,
 * in `auditNetwork`, and printed by the dashboard and the checklist. What is
 * here is the thing neither of those can give the owner — the exact string to
 * paste into Search Console's "Add property" box, and the sitemap URL that
 * follows it.
 */
export async function searchConsoleProperties(
  payload: Payload,
  wikis: WikiRow[],
): Promise<SearchConsoleProperty[]> {
  const [settings, games] = await Promise.all([
    payload.findGlobal({ slug: 'site-settings', depth: 0 }),
    payload.find({ collection: 'games', limit: 100, sort: 'title', depth: 0 }),
  ])

  const root = networkRoot()
  const scheme = /^http:\/\//.test(process.env.NEXT_PUBLIC_SITE_URL || '') ? 'http' : 'https'
  const origin = (host: string) => `${scheme}://${host}`
  const network = (settings.verification as { google?: string } | undefined)?.google

  const size = new Map(wikis.map((wiki) => [wiki.slug, wiki.records]))

  const rows: SearchConsoleProperty[] = [
    {
      kind: 'hub',
      label: '',
      host: root,
      property: `${origin(root)}/`,
      sitemap: `${origin(root)}/sitemap.xml`,
      token: resolvedToken(null, network),
      href: globalHref('site-settings', 'verification.google'),
      where: 'SEO & analytics tab',
      records: 0,
    },
  ]

  const wikiRows: SearchConsoleProperty[] = []
  for (const game of games.docs) {
    /*
      A `planned` wiki 404s for readers, so there is nothing to verify and
      nothing to submit. Listing it would be ten minutes of somebody's time
      spent proving ownership of a site that does not answer.
    */
    if (game.status === 'planned') continue
    const label = String((game as { subdomain?: string }).subdomain || game.slug)
    if (hostLabelProblem(label)) continue
    const host = hostFor(label, root)
    wikiRows.push({
      kind: 'wiki',
      label,
      host,
      property: `${origin(host)}/`,
      sitemap: `${origin(host)}/sitemap.xml`,
      token: resolvedToken((game.verification as { google?: string } | undefined)?.google, network),
      href: docHref('games', game.id, 'verification.google'),
      where: 'Search engine verification tab',
      records: size.get(String(game.slug)) ?? 0,
    })
  }
  wikiRows.sort((a, b) => b.records - a.records || a.host.localeCompare(b.host))
  rows.push(...wikiRows)

  for (const label of ['companies', 'people']) {
    const host = hostFor(label, root)
    rows.push({
      kind: 'network',
      label,
      host,
      property: `${origin(host)}/`,
      sitemap: `${origin(host)}/sitemap.xml`,
      /*
        These two can only ever inherit: there is no per-host settings record
        to hang a token on. Whether the inherited one is *served* is a
        different question, and a source one — see `audit-source.ts`.
      */
      token: resolvedToken(null, network),
      href: globalHref('site-settings', 'verification.google'),
      where: 'SEO & analytics tab — the network token; this host has no field of its own',
      records: 0,
    })
  }

  return rows
}

/* -------------------------------------------------------------------------- */
/* Gaps nobody can close                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The data gaps `CLAUDE.md`'s Outstanding section records, counted.
 *
 * These are **not** launch findings and `pnpm check:launch` does not print
 * them, deliberately: every one of them is blocked on a source nobody has
 * published, and a checklist that lists what nobody can fix is a checklist
 * people learn to ignore — the argument `src/seed/audit.ts` already makes for
 * leaving a thin wiki out of the failure count.
 *
 * They are computed rather than written down because a hardcoded "15 of 93"
 * is a figure that goes stale the first time somebody finds a source, and
 * nothing would say so. The admin shows them under their own heading, labelled
 * blocked, so they read as the state of the world rather than as a to-do list.
 *
 * Only the two that can be counted honestly are here. Xanthe's fifteenth Court
 * Activity is never named in any source found, which is a sentence and not a
 * number, so it stays in `CLAUDE.md` where a person can read it.
 */
export async function auditBlockedGaps(payload: Payload): Promise<Finding[]> {
  const findings: Finding[] = []

  /*
    Scoped to the wikis that actually have a clock.

    A segment cost is only a fact about a game with the 480-segment run
    planner; asking the Gears of War wiki for one would invent a gap. The
    `run-checker` feature flag is the same switch the tool pages read, so the
    two cannot drift.
  */
  const clocked = await payload.find({
    collection: 'games',
    where: { features: { in: ['run-checker'] } },
    limit: 100,
    depth: 0,
  })

  for (const game of clocked.docs) {
    const scope: Where = { game: { equals: game.id } }

    const quests = (await payload.count({ collection: 'quests', where: scope })).totalDocs
    const priced = (
      await payload.count({
        collection: 'quests',
        where: { and: [scope, { 'time.known': { equals: true } }] },
      })
    ).totalDocs
    if (quests > priced) {
      findings.push({
        level: 'note',
        actor: 'blocked',
        area: String(game.slug),
        detail: `${quests - priced} of ${quests} quests have no published segment cost — the run checker reports any total containing one as a floor rather than a figure`,
        count: quests - priced,
        target: {
          entity: collectionEntity('quests'),
          href: listHref('quests', [[{ 'time.known': { not_equals: true } }]]),
        },
      })
    }

    const perks = (await payload.count({ collection: 'perks', where: scope })).totalDocs
    const costed = (
      await payload.count({
        collection: 'perks',
        where: { and: [scope, { timeCostSegments: { exists: true } }] },
      })
    ).totalDocs
    if (perks > costed) {
      findings.push({
        level: 'note',
        actor: 'blocked',
        area: String(game.slug),
        detail: `${perks - costed} of ${perks} perks have no time cost — \`timeCostSegments\` has no default on purpose, so these read as unknown rather than free`,
        count: perks - costed,
        target: {
          entity: collectionEntity('perks'),
          href: listHref('perks', [[{ timeCostSegments: { exists: false } }]]),
        },
      })
    }
  }

  return findings
}

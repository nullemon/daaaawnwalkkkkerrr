import type { Payload, Where } from 'payload'
import { GAME_SCOPED } from './tenancy'
import { hostFor, hostLabelProblem } from './host-label'

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
  `/admin/collections/${collection}/${id}${field ? fieldAnchor(field) : ''}`

const globalHref = (slug: string, field?: string): string =>
  `/admin/globals/${slug}${field ? fieldAnchor(field) : ''}`

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
  return `/admin/collections/${collection}?${params.join('&')}`
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
  entity.kind === 'global' ? `/admin/globals/${entity.slug}` : `/admin/collections/${entity.slug}`

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
          actor: 'owner',
          area: label,
          detail: 'no analytics configured',
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
  const NETWORK_HOSTS: { label: string; collection: 'companies' | 'people' }[] = [
    { label: 'companies', collection: 'companies' },
    { label: 'people', collection: 'people' },
  ]
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
      There is no per-host settings record to hang one on, so this can only
      report the network's — which is exactly the gap worth printing.

      The target is therefore Site settings rather than the host's own global.
      A badge on `companies-site` would point at a screen with no such field on
      it, and a badge the owner cannot clear by doing what it says is the
      decoration this feature is supposed to replace.
    */
    if (!networkVerification) {
      add({
        level: 'warn',
        actor: 'owner',
        area: host.label,
        detail:
          'no Search Console token — this subdomain is its own property, and there is no per-host field to set one',
        count: 1,
        target: {
          entity: SETTINGS,
          href: globalHref('site-settings', 'verification.google'),
          where: 'SEO & analytics tab — the network token; this host has no field of its own',
        },
      })
    }
    if (!hasNetworkAnalytics) {
      add({
        level: 'note',
        actor: 'owner',
        area: host.label,
        detail: 'no analytics configured',
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
      detail: `${provisional} of ${authorsTotal} are placeholders — each profile page carries a placeholder notice; the bylines on their guides print the name as written, and the profiles stay indexed unless "noindex" is ticked separately`,
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

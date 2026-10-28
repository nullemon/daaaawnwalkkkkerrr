import type { Game } from '@/payload-types'

/**
 * One wiki, as a checklist.
 *
 * The dashboard answers the network's questions — what is waiting, which wiki
 * is thin. An editor working on *one* wiki has a different list: is it live,
 * does it have art, is it indexable, who is it verified with, is anything
 * written. Those are twenty fields across four tabs of the Games form, and
 * the only way to read them was to open each tab. This is the list, with each
 * row linking to the field that settles it.
 *
 * ## Three answers, not two
 *
 * `ok` is `true`, `false` or `null`. Null is "this does not apply" — a tool
 * on a wiki whose game publishes no achievements, a verdict on a game that is
 * not out — and it is shown as such rather than as a tick, because a green
 * mark on a row that cannot be acted on is the reassuring-control failure
 * this repository keeps finding. A checklist that is all green because half
 * of it does not apply is not a checklist.
 *
 * ## Pure, and tested as such
 *
 * Takes the game and the few facts that are not on the record (record
 * counts, whether its icon set exists on disk) as arguments, and reads nothing
 * itself. `WikiView` gathers; this decides. The decisions are the part worth
 * a test, and a function that reads the database cannot be given a game that
 * is out and has no verdict without first making one.
 */

export type HealthActor = 'owner' | 'editorial' | 'info'

export type HealthItem = {
  key: string
  /** The row's own words. */
  label: string
  ok: boolean | null
  /** What is true now, in a phrase: "set", "empty", "2 of 3 tokens". */
  detail: string
  /** Where in the admin the fix is, as a path under the admin root. */
  href?: string
  /** The tab the field is on, in words, because Payload cannot deep-link one. */
  tab?: string
  actor: HealthActor
}

export type HealthFacts = {
  records: number
  guides: number
  /** `public/wiki-assets/<slug>/` holds a generated icon set and share card. */
  ownAssets: boolean
  /** Comments on this wiki waiting for a moderator. */
  pendingComments: number
  /**
   * The tools the wiki's `features` enable, by label. Passed in rather than
   * read through `lib/sections.ts`, which imports the Payload client and so
   * cannot be loaded by a unit test — the one reason this module is pure.
   */
  tools: string[]
  now?: Date
}

export type HealthGroup = { heading: string; items: HealthItem[] }

const isOut = (game: Game, now: Date): boolean | null => {
  if (!game.releaseDate) return null
  return new Date(game.releaseDate).getTime() <= now.getTime()
}

const filled = (value: unknown): boolean => typeof value === 'string' && value.trim().length > 0

/** The whole checklist, grouped the way the Games form is tabbed. */
export const wikiChecklist = (game: Game, facts: HealthFacts): HealthGroup[] => {
  const now = facts.now ?? new Date()
  const edit = `/collections/games/${game.id}`
  const out = isOut(game, now)
  const tools = facts.tools

  const verification = game.verification ?? {}
  const tokens = [verification.google, verification.bing, verification.yandex].filter(filled).length
  const analytics = game.analytics ?? {}
  const analyticsIds = [
    analytics.ga4Id,
    analytics.gtmId,
    analytics.plausibleDomain,
    analytics.clarityId,
  ].filter(filled).length

  const hero = game.theme?.hero && typeof game.theme.hero === 'object'
  const logo = game.theme?.logo && typeof game.theme.logo === 'object'
  const rated = typeof game.rating?.score === 'number' && filled(game.rating?.rationale)

  const identity: HealthItem[] = [
    {
      key: 'status',
      label: 'Status',
      ok: game.status === 'live' ? true : game.status === 'planned' ? false : null,
      detail:
        game.status === 'live'
          ? 'live'
          : game.status === 'planned'
            ? 'planned — not served'
            : 'building — served, openly incomplete',
      href: `${edit}#field-status`,
      tab: 'Game',
      actor: 'editorial',
    },
    {
      key: 'release',
      label: 'Release date',
      ok: game.releaseDate ? (game.releaseDateConfirmed ? true : null) : false,
      detail: !game.releaseDate
        ? 'none — the wiki cannot say whether the game is out'
        : game.releaseDateConfirmed
          ? `${game.releaseDate.slice(0, 10)}, confirmed`
          : `${game.releaseDate.slice(0, 10)}, unconfirmed — printed as a window, not a date`,
      href: `${edit}#field-releaseDate`,
      tab: 'Game',
      actor: 'editorial',
    },
    {
      key: 'summary',
      label: 'Summary and tagline',
      ok: filled(game.summary) && filled(game.tagline),
      detail: [filled(game.summary) ? 'summary' : 'no summary', filled(game.tagline) ? 'tagline' : 'no tagline'].join(', '),
      href: `${edit}#field-summary`,
      tab: 'Game',
      actor: 'editorial',
    },
    {
      key: 'credits',
      label: 'Developer and publisher',
      ok: filled(game.developer) && filled(game.publisher),
      detail: [game.developer, game.publisher].filter(filled).join(' / ') || 'neither named',
      href: `${edit}#field-developer`,
      tab: 'Game',
      actor: 'editorial',
    },
  ]

  const look: HealthItem[] = [
    {
      key: 'hero',
      label: 'Key art',
      ok: Boolean(hero),
      detail: hero ? 'attached' : 'none — the home opens on a flat background',
      href: `${edit}#field-theme`,
      tab: 'Theme',
      actor: 'editorial',
    },
    {
      key: 'logo',
      label: 'Logo or capsule',
      ok: Boolean(logo),
      detail: logo ? 'attached' : 'none — the wordmark is set in type',
      href: `${edit}#field-theme`,
      tab: 'Theme',
      actor: 'editorial',
    },
    {
      key: 'accent',
      label: 'Accent colour',
      ok: filled(game.theme?.accent),
      detail: filled(game.theme?.accent) ? String(game.theme?.accent) : 'network red',
      href: `${edit}#field-theme`,
      tab: 'Theme',
      actor: 'editorial',
    },
    {
      key: 'assets',
      label: 'Favicon and share card',
      ok: facts.ownAssets,
      detail: facts.ownAssets
        ? 'its own, in public/wiki-assets'
        : 'the network’s — attach art, then run node tools/make-wiki-icons.mjs',
      actor: 'editorial',
    },
  ]

  const search: HealthItem[] = [
    {
      key: 'noindex',
      label: 'Indexable',
      ok: !game.seo?.noindex,
      detail: game.seo?.noindex ? 'noindex is ON — search engines are told to skip this wiki' : 'yes',
      href: `${edit}#field-seo`,
      tab: 'SEO',
      actor: 'owner',
    },
    {
      key: 'seo-title',
      label: 'Search title and description',
      ok: filled(game.seo?.title) && filled(game.seo?.description) ? true : null,
      detail:
        filled(game.seo?.title) && filled(game.seo?.description)
          ? 'written'
          : 'composed from the game’s own words — fine, an override is optional',
      href: `${edit}#field-seo`,
      tab: 'SEO',
      actor: 'editorial',
    },
    {
      key: 'verification',
      label: 'Search Console tokens',
      ok: tokens > 0,
      detail: `${tokens} of 3 (Google, Bing, Yandex) — each subdomain is its own property`,
      href: `${edit}#field-verification`,
      tab: 'SEO',
      actor: 'owner',
    },
    {
      key: 'analytics',
      label: 'Third-party analytics',
      ok: analyticsIds > 0 ? true : null,
      detail:
        analyticsIds > 0
          ? `${analyticsIds} configured`
          : 'none — counted by the network’s own measurement; only needed for Google’s numbers too',
      href: `${edit}#field-analytics`,
      tab: 'SEO',
      actor: 'owner',
    },
  ]

  const content: HealthItem[] = [
    {
      key: 'records',
      label: 'Records',
      ok: facts.records > 0,
      detail: facts.records > 0 ? `${facts.records.toLocaleString('en-GB')} across the database` : 'none yet',
      actor: 'editorial',
    },
    {
      key: 'guides',
      label: 'Guides',
      ok: facts.guides > 0,
      detail: facts.guides > 0 ? `${facts.guides.toLocaleString('en-GB')} published` : 'none',
      href: `/collections/guides?where[game][equals]=${game.id}`,
      actor: 'editorial',
    },
    {
      key: 'tools',
      label: 'Tools',
      ok: tools.length > 0 ? true : null,
      detail:
        tools.length > 0
          ? tools.join(', ')
          : 'none — a tool per wiki where the data supports one, and nowhere else',
      href: `${edit}#field-features`,
      tab: 'Game',
      actor: 'info',
    },
    {
      key: 'verdict',
      label: 'Our verdict',
      ok: out === true ? rated : null,
      detail:
        out === true
          ? rated
            ? `${game.rating?.score} / 10`
            : 'out, and no verdict yet — somebody has played it now'
          : 'not out — no score is published before release, by rule',
      href: `${edit}#field-rating`,
      tab: 'Our rating',
      actor: 'editorial',
    },
    {
      key: 'comments',
      label: 'Comments waiting',
      ok: facts.pendingComments === 0 ? true : false,
      detail: facts.pendingComments === 0 ? 'none' : `${facts.pendingComments} to moderate`,
      href: `/collections/comments?where[game][equals]=${game.id}&where[status][equals]=pending`,
      actor: 'editorial',
    },
  ]

  return [
    { heading: 'Identity', items: identity },
    { heading: 'Look', items: look },
    { heading: 'Search', items: search },
    { heading: 'Content', items: content },
  ]
}

/** A one-line score for a list of wikis: how many rows are green, of those that apply. */
export const healthScore = (groups: HealthGroup[]): { ok: number; applicable: number } => {
  const items = groups.flatMap((group) => group.items).filter((item) => item.ok !== null)
  return { ok: items.filter((item) => item.ok).length, applicable: items.length }
}

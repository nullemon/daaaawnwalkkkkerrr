import type { AdminViewServerProps, CollectionSlug, Payload } from 'payload'
import type { Game } from '@/payload-types'
import { adminUrl } from '@/lib/admin-path'
import { gameUrl } from '@/lib/payload'
import { SECTIONS, sectionsFor, toolsFor } from '@/lib/sections'
import { GAME_SCOPED, SECTION_PATH, type GameScopedCollection } from '@/lib/tenancy'
import { hasWikiAssets } from '@/lib/wiki-assets'
import { healthScore, wikiChecklist, type HealthItem } from '@/lib/wiki-health'
import { readAudit } from './audit-snapshot'

/**
 * One wiki, on one screen — and the list of them.
 *
 * The dashboard answers the network's questions. An editor working on one
 * wiki arrives with different ones: is it live, is it indexable, what art does
 * it have, what is in it, what changed last, what is waiting on it. Those
 * answers were spread over four tabs of the Games form, six collection lists
 * filtered by hand, the comments queue and the launch checklist. This is the
 * one screen, at `/wiki?game=<slug>`; `/wiki` alone is every wiki as a card
 * with its score.
 *
 * ## It gathers; `lib/wiki-health.ts` decides
 *
 * Every tick and cross on this page is `wikiChecklist`, which is pure and
 * tested. This file reads the database and the disk and hands the facts over.
 * A decision made in a server component is a decision that cannot be given a
 * game that is out with no verdict without first making one.
 *
 * ## Registered as a root view
 *
 * A root view and not a custom tab on the Games edit form, because half of
 * what it shows is not on the game record: the counts, the recent edits, the
 * pending comments, the icon set on disk. Linked from the sidebar by
 * `WikiNavLink` and from every row of the dashboard's wiki table.
 */

type Recent = { collection: GameScopedCollection; id: string | number; title: string; updatedAt: string }

const STATUS_WORD: Record<string, string> = {
  live: 'live',
  building: 'building',
  planned: 'planned — not served',
}

const fmt = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—'

const Mark = ({ ok }: { ok: boolean | null }) => (
  <span className={`net-wiki-mark net-wiki-mark--${ok === null ? 'na' : ok ? 'ok' : 'gap'}`} aria-hidden="true">
    {ok === null ? '–' : ok ? '✓' : '✕'}
  </span>
)

const Row = ({ item }: { item: HealthItem }) => (
  <li className="net-wiki-row" data-ok={item.ok === null ? 'na' : item.ok ? 'ok' : 'gap'}>
    <Mark ok={item.ok} />
    <div className="net-wiki-row-body">
      <span className="net-wiki-row-label">{item.label}</span>
      <span className="net-wiki-row-detail">{item.detail}</span>
    </div>
    {item.href ? (
      <a className="net-wiki-row-go" href={adminUrl(item.href)}>
        {item.tab ? `${item.tab} tab →` : 'open →'}
      </a>
    ) : null}
  </li>
)

/** The newest few rows of each of this wiki's collections, merged and cut to ten. */
const recentFor = async (payload: Payload, gameId: string | number): Promise<Recent[]> => {
  const batches = await Promise.all(
    GAME_SCOPED.map(async (collection) => {
      const result = await payload.find({
        collection: collection as CollectionSlug,
        where: { game: { equals: gameId } },
        sort: '-updatedAt',
        limit: 3,
        depth: 0,
      })
      return result.docs.map((doc) => ({
        collection: collection as GameScopedCollection,
        id: doc.id,
        title: String((doc as { title?: string }).title ?? doc.id),
        updatedAt: String((doc as { updatedAt?: string }).updatedAt ?? ''),
      }))
    }),
  )
  return batches
    .flat()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 10)
}

const pendingByGame = async (payload: Payload): Promise<Map<string | number, number>> => {
  const pending = await payload.find({
    collection: 'comments',
    where: { status: { equals: 'pending' } },
    limit: 1000,
    depth: 0,
  })
  const map = new Map<string | number, number>()
  for (const doc of pending.docs) {
    const game = typeof doc.game === 'object' && doc.game ? doc.game.id : doc.game
    if (game === null || game === undefined) continue
    map.set(game, (map.get(game) ?? 0) + 1)
  }
  return map
}

export default async function WikiView({ payload, searchParams, initPageResult }: AdminViewServerProps) {
  const user = initPageResult?.req?.user
  if (user?.collection !== 'users') {
    return (
      <div className="net-wiki">
        <h1 className="net-wiki-title">Wikis</h1>
        <p className="net-wiki-note">This page is for editors. Sign in with an editor account.</p>
      </div>
    )
  }

  const raw = searchParams?.game
  const slug = typeof raw === 'string' ? raw.trim().toLowerCase() : ''

  const [games, pending] = await Promise.all([
    payload.find({ collection: 'games', depth: 1, limit: 200, sort: 'title' }),
    pendingByGame(payload),
  ])

  /* ------------------------------------------------------------ one wiki */
  if (slug) {
    const game = games.docs.find((doc) => doc.slug === slug)
    if (!game) {
      return (
        <div className="net-wiki">
          <h1 className="net-wiki-title">Wikis</h1>
          <p className="net-wiki-note">
            No wiki is called “{slug}”. <a href={adminUrl('/wiki')}>Every wiki</a>.
          </p>
        </div>
      )
    }

    const [sections, recent, host, audit] = await Promise.all([
      sectionsFor(game.slug),
      recentFor(payload, game.id),
      gameUrl(game),
      readAudit(),
    ])
    const records = sections.reduce((sum, section) => sum + section.count, 0)
    const guides = sections.find((section) => section.collection === 'guides')?.count ?? 0
    const groups = wikiChecklist(game, {
      records,
      guides,
      ownAssets: hasWikiAssets(game.slug),
      pendingComments: pending.get(game.id) ?? 0,
      tools: toolsFor(game).map((tool) => tool.label),
    })
    const score = healthScore(groups)
    const findings = audit.ok
      ? [...audit.snapshot.findings, ...audit.blocked].filter((finding) => finding.area === game.slug)
      : []

    return (
      <div className="net-wiki">
        <p className="net-wiki-crumbs">
          <a href={adminUrl('/wiki')}>Wikis</a> / {game.shortTitle || game.title}
        </p>
        <header className="net-wiki-head">
          <div>
            <h1 className="net-wiki-title">{game.title}</h1>
            <p className="net-wiki-host">
              <a href={host} target="_blank" rel="noreferrer">
                {host.replace(/^https?:\/\//, '')} ↗
              </a>
              <span className="net-wiki-status" data-status={game.status}>
                {STATUS_WORD[game.status ?? ''] ?? game.status}
              </span>
              <span className="net-wiki-slug">{game.slug}</span>
            </p>
          </div>
          <div className="net-wiki-score" title="Rows that are right, of the rows that apply to this wiki">
            <b>{score.ok}</b> / {score.applicable}
            <span>ready</span>
          </div>
          <div className="net-wiki-actions">
            <a className="net-dash-action" href={adminUrl(`/collections/games/${game.id}`)}>
              Edit the game
            </a>
            <a className="net-dash-action" href={`${host}/sitemap.xml`} target="_blank" rel="noreferrer">
              sitemap.xml
            </a>
            <a className="net-dash-action" href={`${host}/feed.xml`} target="_blank" rel="noreferrer">
              feed.xml
            </a>
            <a className="net-dash-action" href={`${host}/robots.txt`} target="_blank" rel="noreferrer">
              robots.txt
            </a>
          </div>
        </header>

        <div className="net-wiki-grid">
          <section className="net-wiki-panel net-wiki-panel--wide">
            <h2 className="net-wiki-heading">Checklist</h2>
            <p className="net-wiki-note">
              A dash is a row that does not apply to this wiki — not a tick. Every field row opens the
              Games form; Payload cannot open a tab from a link, so the tab is named.
            </p>
            <div className="net-wiki-groups">
              {groups.map((group) => (
                <div key={group.heading} className="net-wiki-group">
                  <h3 className="net-wiki-group-head">{group.heading}</h3>
                  <ul className="net-wiki-rows">
                    {group.items.map((item) => (
                      <Row key={item.key} item={item} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <section className="net-wiki-panel">
            <h2 className="net-wiki-heading">
              What is in it <span className="net-wiki-count">{records.toLocaleString('en-GB')}</span>
            </h2>
            <table className="net-dash-table">
              <thead>
                <tr>
                  <th>Section</th>
                  <th className="net-dash-num">Records</th>
                  <th />
                  <th />
                </tr>
              </thead>
              <tbody>
                {SECTIONS.map((section) => {
                  const count = sections.find((row) => row.collection === section.collection)?.count ?? 0
                  return (
                    <tr key={section.collection} data-empty={count === 0 ? 'true' : undefined}>
                      <td>
                        {section.label}
                        {count === 0 ? <span className="net-wiki-empty"> — not in the rail until it has one</span> : null}
                      </td>
                      <td className="net-dash-num">{count.toLocaleString('en-GB')}</td>
                      <td>
                        <a href={adminUrl(`/collections/${section.collection}?where[game][equals]=${game.id}`)}>
                          list
                        </a>
                      </td>
                      <td>
                        <a href={adminUrl(`/collections/${section.collection}/create`)}>+ add</a>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>

          <section className="net-wiki-panel">
            <h2 className="net-wiki-heading">Changed most recently</h2>
            {recent.length === 0 ? (
              <p className="net-wiki-note">Nothing has been written for this wiki yet.</p>
            ) : (
              <ul className="net-wiki-recent">
                {recent.map((row) => (
                  <li key={`${row.collection}-${row.id}`}>
                    <a href={adminUrl(`/collections/${row.collection}/${row.id}`)}>{row.title}</a>
                    <span className="net-wiki-recent-meta">
                      {SECTIONS.find((section) => section.collection === row.collection)?.kind ?? row.collection}
                      {' · '}
                      {fmt(row.updatedAt)}
                      {' · '}
                      <a href={`${host}${SECTION_PATH[row.collection]}`} target="_blank" rel="noreferrer">
                        live ↗
                      </a>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="net-wiki-panel net-wiki-panel--wide">
            <h2 className="net-wiki-heading">From the launch checklist</h2>
            {!audit.ok ? (
              <p className="net-wiki-note">The checklist could not be read: {audit.message}</p>
            ) : findings.length === 0 ? (
              <p className="net-wiki-note">Nothing on the launch checklist names this wiki.</p>
            ) : (
              <ul className="net-wiki-findings">
                {findings.map((finding, index) => (
                  <li key={index} data-level={finding.level} data-actor={finding.actor}>
                    <span className="net-wiki-finding-actor">{finding.actor}</span>
                    <span>{finding.detail}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="net-wiki-note">
              The same rows <code>pnpm check:launch</code> prints, filtered to this wiki. “Blocked” is
              the state of the world, not a task.
            </p>
          </section>
        </div>
      </div>
    )
  }

  /* ----------------------------------------------------------- the list */
  const audit = await readAudit()
  const recordsBySlug = new Map<string, number>()
  if (audit.ok) for (const row of audit.snapshot.wikis) recordsBySlug.set(row.slug, row.records)

  const guideCounts = await Promise.all(
    games.docs.map(async (game) => {
      const result = await payload.count({ collection: 'guides', where: { game: { equals: game.id } } })
      return [game.id, result.totalDocs] as const
    }),
  )
  const guidesById = new Map<string | number, number>(guideCounts)

  const cards = await Promise.all(
    games.docs.map(async (game) => {
      const groups = wikiChecklist(game, {
        records: recordsBySlug.get(game.slug) ?? 0,
        guides: guidesById.get(game.id) ?? 0,
        ownAssets: hasWikiAssets(game.slug),
        pendingComments: pending.get(game.id) ?? 0,
        tools: toolsFor(game).map((tool) => tool.label),
      })
      const score = healthScore(groups)
      const gaps = groups.flatMap((group) => group.items).filter((item) => item.ok === false)
      return { game, score, gaps, host: await gameUrl(game), records: recordsBySlug.get(game.slug) ?? 0 }
    }),
  )
  cards.sort((a, b) => b.records - a.records)

  return (
    <div className="net-wiki">
      <header className="net-wiki-head">
        <div>
          <h1 className="net-wiki-title">Wikis</h1>
          <p className="net-wiki-note">
            One card per subdomain. The score is rows right of rows that apply; the list under it is
            what is wrong, in the order it is worth fixing. Open a card for the whole picture.
          </p>
        </div>
        <div className="net-wiki-actions">
          <a className="net-dash-action" href={adminUrl('/collections/games/create')}>
            + Add a wiki
          </a>
          <a className="net-dash-action" href={adminUrl('/seo')}>
            SEO &amp; indexing
          </a>
        </div>
      </header>
      <div className="net-wiki-cards">
        {cards.map(({ game, score, gaps, host, records }) => (
          <a
            key={game.id}
            className="net-wiki-card"
            href={adminUrl(`/wiki?game=${game.slug}`)}
            style={game.theme?.accent ? ({ '--wiki-accent': game.theme.accent } as React.CSSProperties) : undefined}
          >
            <span className="net-wiki-card-head">
              <b>{game.shortTitle || game.title}</b>
              <span className="net-wiki-card-score" data-full={score.ok === score.applicable ? 'true' : undefined}>
                {score.ok}/{score.applicable}
              </span>
            </span>
            <span className="net-wiki-card-host">{host.replace(/^https?:\/\//, '')}</span>
            <span className="net-wiki-card-meta">
              {records.toLocaleString('en-GB')} records · {guidesById.get(game.id) ?? 0} guides ·{' '}
              {STATUS_WORD[game.status ?? ''] ?? game.status}
              {pending.get(game.id) ? ` · ${pending.get(game.id)} comments waiting` : ''}
            </span>
            {gaps.length > 0 ? (
              <span className="net-wiki-card-gaps">
                {gaps.slice(0, 4).map((gap) => (
                  <span key={gap.key}>{gap.label}</span>
                ))}
                {gaps.length > 4 ? <span>+{gaps.length - 4}</span> : null}
              </span>
            ) : (
              <span className="net-wiki-card-clear">Nothing missing</span>
            )}
          </a>
        ))}
      </div>
    </div>
  )
}

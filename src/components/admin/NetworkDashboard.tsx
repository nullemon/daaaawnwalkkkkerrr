import { getPayload } from 'payload'
import config from '@payload-config'
import { GAME_SCOPED } from '@/lib/tenancy'

/**
 * What the admin opens on.
 *
 * Payload's default dashboard is a list of collection names. That was adequate
 * for one wiki; across seven it answers none of the questions an editor
 * actually arrives with — is anything waiting for me, which wiki is thin, and
 * is anything misconfigured on a site that is already live.
 *
 * Everything is counted live. A dashboard that can be out of date is one
 * nobody trusts twice, and a stale figure here would undermine the same claim
 * the public directory makes.
 */

const STATUS_NOTE: Record<string, string> = {
  planned: 'Hidden — 404s for readers',
  building: 'Live, labelled in progress',
  live: 'Live',
  archived: 'Online, not updated',
}

export default async function NetworkDashboard() {
  const payload = await getPayload({ config })

  const [games, settings, pending, corrections, requests] = await Promise.all([
    payload.find({ collection: 'games', limit: 100, sort: 'title', depth: 0 }),
    payload.findGlobal({ slug: 'site-settings', depth: 0 }),
    payload.count({ collection: 'comments', where: { status: { equals: 'pending' } } }),
    payload.count({ collection: 'corrections', where: { status: { equals: 'new' } } }),
    payload.count({ collection: 'requests', where: { status: { equals: 'new' } } }),
  ])

  const counted = await Promise.all(
    games.docs.map(async (game) => {
      const perCollection = await Promise.all(
        GAME_SCOPED.map((collection) =>
          payload.count({ collection, where: { game: { equals: game.id } } }),
        ),
      )

      /*
        Flag the two things that are invisible until they cost you: a live wiki
        with no Search Console token is not being indexed on purpose, and one
        with no analytics is running blind. Both are easy to forget, because
        nothing about the site looks wrong.
      */
      const verification = game.verification as { google?: string | null } | undefined
      const analytics = game.analytics as
        | { ga4Id?: string | null; gtmId?: string | null; plausibleDomain?: string | null }
        | undefined

      const gaps: string[] = []
      if (game.status === 'live' || game.status === 'building') {
        if (!verification?.google && !(settings.verification as { google?: string })?.google) {
          gaps.push('no Search Console token')
        }
        if (
          !analytics?.ga4Id &&
          !analytics?.gtmId &&
          !analytics?.plausibleDomain &&
          !(settings.analytics as { ga4Id?: string })?.ga4Id
        ) {
          gaps.push('no analytics')
        }
      }

      return {
        game,
        pages: perCollection.reduce((total, result) => total + result.totalDocs, 0),
        gaps,
      }
    }),
  )

  const queues = [
    {
      label: 'Comments awaiting approval',
      count: pending.totalDocs,
      href: '/admin/collections/comments?limit=50&where[or][0][and][0][status][equals]=pending',
    },
    {
      label: 'New corrections',
      count: corrections.totalDocs,
      href: '/admin/collections/corrections?limit=50',
    },
    {
      label: 'New feature requests',
      count: requests.totalDocs,
      href: '/admin/collections/requests?limit=50',
    },
  ]

  const waiting = queues.reduce((total, queue) => total + queue.count, 0)
  const total = counted.reduce((sum, row) => sum + row.pages, 0)

  return (
    <div className="net-dash">
      <section>
        <h2 className="net-dash-heading">Waiting for you</h2>
        {waiting === 0 ? (
          <p className="net-dash-clear">
            Nothing in any queue. Everything readers have sent has been dealt with.
          </p>
        ) : null}
        <ul className="net-dash-queues">
          {queues.map((queue) => (
            <li key={queue.label} data-busy={queue.count > 0 ? 'true' : undefined}>
              <a href={queue.href}>
                <span className="net-dash-count">{queue.count}</span>
                <span className="net-dash-label">{queue.label}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <div className="net-dash-bar">
          <h2 className="net-dash-heading">
            The wikis · {counted.length} · {total.toLocaleString('en-GB')} records
          </h2>
          <a className="net-dash-action" href="/admin/collections/games/create">
            + Add a wiki
          </a>
        </div>

        <table className="net-dash-table">
          <thead>
            <tr>
              <th>Wiki</th>
              <th>Status</th>
              <th className="net-dash-num">Records</th>
              <th>Released</th>
              <th>Needs attention</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {counted.map(({ game, pages, gaps }) => (
              <tr key={game.id}>
                <td>
                  <a href={`/admin/collections/games/${game.id}`}>{game.title}</a>
                  <span className="net-dash-slug">{game.slug}</span>
                </td>
                <td title={STATUS_NOTE[game.status] ?? ''}>{game.status}</td>
                <td className="net-dash-num">{pages.toLocaleString('en-GB')}</td>
                <td>
                  {game.releaseDate
                    ? new Date(game.releaseDate).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })
                    : '—'}
                </td>
                <td>
                  {gaps.length > 0 ? (
                    <span className="net-dash-gap">{gaps.join(', ')}</span>
                  ) : (
                    <span className="net-dash-ok">nothing</span>
                  )}
                </td>
                <td className="net-dash-num">
                  {/*
                    The internal path form on the apex. proxy.ts redirects it to
                    the wiki's own host, so this keeps working if a subdomain is
                    ever changed, and needs no origin to be configured here.
                  */}
                  <a href={`/${game.slug}`} target="_blank" rel="noreferrer">
                    view ↗
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="net-dash-note">
          Counted from the database just now, across all {GAME_SCOPED.length} content collections.
          A wiki showing zero has nothing written for it yet, which is expected until its game is
          out. Adding a wiki is a row here plus content — no deploy and no DNS change, because the
          domain is a wildcard.
        </p>
      </section>
    </div>
  )
}

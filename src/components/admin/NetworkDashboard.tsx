import { getPayload } from 'payload'
import config from '@payload-config'
import { GAME_SCOPED } from '@/lib/tenancy'

/**
 * What the admin opens on.
 *
 * Payload's default dashboard is a list of collection names, which was fine
 * for one wiki and is not for seven: the questions an editor actually arrives
 * with are "is anything waiting for me" and "which wiki is thin", and neither
 * is answerable from a list of links.
 *
 * So: the queues first, because they have people waiting at the other end of
 * them, and then a row per wiki with its real page count. Everything is
 * counted live — a dashboard that can be out of date is a dashboard nobody
 * trusts twice.
 */
export default async function NetworkDashboard() {
  const payload = await getPayload({ config })

  const [games, pending, corrections, requests] = await Promise.all([
    payload.find({ collection: 'games', limit: 100, sort: 'title', depth: 0 }),
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
      return {
        game,
        pages: perCollection.reduce((total, result) => total + result.totalDocs, 0),
      }
    }),
  )

  const queues = [
    { label: 'Comments awaiting approval', count: pending.totalDocs, href: '/admin/collections/comments?where[or][0][and][0][status][equals]=pending' },
    { label: 'New corrections', count: corrections.totalDocs, href: '/admin/collections/corrections' },
    { label: 'New feature requests', count: requests.totalDocs, href: '/admin/collections/requests' },
  ]

  const waiting = queues.reduce((total, queue) => total + queue.count, 0)

  return (
    <div className="net-dash">
      <section>
        <h2 className="net-dash-heading">Waiting for you</h2>
        {waiting === 0 ? (
          <p className="net-dash-clear">Nothing in any queue. Everything submitted has been dealt with.</p>
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
        <h2 className="net-dash-heading">The wikis</h2>
        <table className="net-dash-table">
          <thead>
            <tr>
              <th>Wiki</th>
              <th>Status</th>
              <th className="net-dash-num">Records</th>
              <th>Released</th>
            </tr>
          </thead>
          <tbody>
            {counted.map(({ game, pages }) => (
              <tr key={game.id}>
                <td>
                  <a href={`/admin/collections/games/${game.id}`}>{game.title}</a>
                </td>
                <td>{game.status}</td>
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
              </tr>
            ))}
          </tbody>
        </table>
        <p className="net-dash-note">
          Counted from the database just now, across all {GAME_SCOPED.length} content collections.
          A wiki showing zero is one nobody has written anything for yet, which is expected until
          its game is out.
        </p>
      </section>
    </div>
  )
}

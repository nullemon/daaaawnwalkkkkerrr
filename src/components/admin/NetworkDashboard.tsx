import { GAME_SCOPED } from '@/lib/tenancy'
import { groupFindings, type ActionRow, type Finding } from '@/lib/audit'
import { readAudit } from './audit-snapshot'

/**
 * What the admin opens on.
 *
 * Payload's default dashboard is a list of collection names. That was adequate
 * for one wiki; across eight it answers none of the questions an editor
 * actually arrives with — is anything waiting for me, which wiki is thin, and
 * is anything misconfigured on a site that is already live.
 *
 * ## Where the numbers come from
 *
 * `src/lib/audit.ts`, which is the same module `pnpm check:launch` prints.
 * This file used to ask two of those questions itself — whether a wiki had a
 * Search Console token, whether it had analytics — in its own words, from its
 * own queries. That is the drift every other entry in CLAUDE.md's gotchas list
 * is about: two implementations, neither erroring, and the day they disagree
 * the owner cannot tell which one is lying. Nothing on this page computes a
 * finding any more; it renders them.
 *
 * ## Why every row carries a link
 *
 * A row that says "no Search Console token" and leaves somebody to find the
 * tab has moved the work rather than done it. Each row links as close to the
 * field as Payload allows — the document or the filtered list, plus the tab
 * named in words, because Payload 3.89 keeps the active tab in preferences
 * rather than in the URL and cannot be deep-linked to one.
 *
 * ## Nothing here is dismissable
 *
 * Same reasoning as `src/components/LegalGap.tsx`, recorded in `docs/COPY.md`.
 * A badge the owner can clear without fixing the thing is decoration.
 */

const STATUS_NOTE: Record<string, string> = {
  planned: 'Hidden — 404s for readers',
  building: 'Live, labelled in progress',
  live: 'Live',
  archived: 'Online, not updated',
}

/** The gist of a finding, for a table cell that has no room for the reason. */
const gist = (detail: string): string => detail.split(' — ')[0].split(' (')[0]

const Rows = ({ rows }: { rows: ActionRow[] }) => (
  <ul className="net-dash-actions">
    {rows.map((row) => (
      <li key={row.detail} data-level={row.level}>
        <span className="net-dash-count">{row.count.toLocaleString('en-GB')}</span>
        <div className="net-dash-action-body">
          <span className="net-dash-action-detail">{row.detail}</span>
          <span className="net-dash-places">
            {row.places.map((place, index) => (
              <span key={`${place.area}-${index}`}>
                {place.href ? (
                  <a href={place.href} title={place.where}>
                    {place.area}
                    {place.where ? ` · ${place.where}` : ''}
                  </a>
                ) : (
                  /*
                    No link on purpose. NEXT_PUBLIC_SITE_URL is an environment
                    variable on the deployment, and sending somebody to a
                    screen where it cannot be typed is worse than sending them
                    nowhere.
                  */
                  <span className="net-dash-nowhere">
                    {place.area} · not settable in the admin
                  </span>
                )}
              </span>
            ))}
          </span>
        </div>
      </li>
    ))}
  </ul>
)

export default async function NetworkDashboard() {
  const result = await readAudit()

  if (!result.ok) {
    /*
      The one thing this must not do is render a clean dashboard. An owner
      who reads "nothing is waiting for you" off a failed query is worse off
      than one who reads nothing at all — and the rest of the admin has to
      keep working, so this is a message and not a thrown error.
    */
    return (
      <div className="net-dash">
        <section>
          <h2 className="net-dash-heading">Waiting for you</h2>
          <p className="net-dash-failed">
            The counts could not be read: {result.message}. Nothing below is a zero — it is
            unknown. The rest of the admin is unaffected; reload to try again, or run{' '}
            <code>pnpm check:launch</code> for the same findings from the command line.
          </p>
        </section>
      </div>
    )
  }

  const { snapshot, blocked } = result
  const { findings, wikis, queues, cost } = snapshot

  const owner = groupFindings(findings, 'owner')
  const editorial = groupFindings(findings, 'editorial')
  const blockedRows = groupFindings(blocked, 'blocked')

  const waiting = queues.reduce((total, queue) => total + queue.count, 0)
  const total = wikis.reduce((sum, row) => sum + row.records, 0)

  /** Every gap a single wiki has, so the table cell can say how many. */
  const gapsFor = (slug: string): Finding[] =>
    findings.filter(
      (finding) =>
        finding.area === slug && (finding.actor === 'owner' || finding.actor === 'editorial'),
    )

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
        <h2 className="net-dash-heading">
          You can set these · {owner.reduce((sum, row) => sum + row.count, 0)}
        </h2>
        {owner.length === 0 ? (
          <p className="net-dash-clear">
            Nothing is waiting on an account, a token or a name only you have.
          </p>
        ) : (
          <>
            <p className="net-dash-note">
              Settings and values no source can supply — a verification token per subdomain, an
              analytics ID, the network&rsquo;s own name, a real contributor in place of a
              placeholder. Every one of these is a few minutes and a copy-and-paste.
            </p>
            <Rows rows={owner} />
          </>
        )}
      </section>

      <section>
        <h2 className="net-dash-heading">
          Editorial work · {editorial.reduce((sum, row) => sum + row.count, 0)}
        </h2>
        {editorial.length === 0 ? (
          <p className="net-dash-clear">No record is missing a summary, a credit or a picture.</p>
        ) : (
          <>
            <p className="net-dash-note">
              Work anybody with the sources in hand can do. A gap is fine and a fabricated figure
              is not, so leaving one of these empty is always allowed.
            </p>
            <Rows rows={editorial} />
          </>
        )}
      </section>

      {blockedRows.length > 0 ? (
        <section>
          <h2 className="net-dash-heading">Blocked — not a to-do list</h2>
          <p className="net-dash-note">
            Nobody has published the source these need. They are counted here so the size of the
            gap is visible, and listed separately because doing them would mean inventing a
            figure, which is the one thing that would cost this network its argument. See
            CLAUDE.md, &ldquo;Outstanding&rdquo;.
          </p>
          <ul className="net-dash-actions net-dash-actions--blocked">
            {blockedRows.map((row) => (
              <li key={row.detail} data-level="blocked">
                <span className="net-dash-count">{row.count.toLocaleString('en-GB')}</span>
                <div className="net-dash-action-body">
                  <span className="net-dash-action-detail">{row.detail}</span>
                  <span className="net-dash-places">
                    {row.places.map((place, index) => (
                      <span key={`${place.area}-${index}`}>
                        {place.href ? (
                          <a href={place.href}>{place.area} · see the records</a>
                        ) : (
                          <span className="net-dash-nowhere">{place.area}</span>
                        )}
                      </span>
                    ))}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <div className="net-dash-bar">
          <h2 className="net-dash-heading">
            The wikis · {wikis.length} · {total.toLocaleString('en-GB')} records
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
            {wikis.map((wiki) => {
              const gaps = gapsFor(wiki.slug)
              return (
                <tr key={wiki.id}>
                  <td>
                    <a href={`/admin/collections/games/${wiki.id}`}>{wiki.title}</a>
                    <span className="net-dash-slug">{wiki.slug}</span>
                  </td>
                  <td title={STATUS_NOTE[wiki.status] ?? ''}>{wiki.status}</td>
                  <td className="net-dash-num">{wiki.records.toLocaleString('en-GB')}</td>
                  <td>
                    {wiki.releaseDate
                      ? new Date(wiki.releaseDate).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })
                      : '—'}
                  </td>
                  <td>
                    {gaps.length > 0 ? (
                      <span className="net-dash-gap">
                        {gaps.map((gap) => gist(gap.detail)).join(', ')}
                      </span>
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
                    <a href={`/${wiki.slug}`} target="_blank" rel="noreferrer">
                      view ↗
                    </a>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <p className="net-dash-note">
          Counted from the database just now, across all {GAME_SCOPED.length} content collections:{' '}
          {cost.queries} count queries in {cost.ms}ms, cached for thirty seconds and shared with
          the sidebar so the pass runs once per screen rather than twice. A wiki showing zero has
          nothing written for it yet, which is expected until its game is out. Adding a wiki is a
          row here plus content — no deploy and no DNS change, because the domain is a wildcard.
        </p>
      </section>
    </div>
  )
}

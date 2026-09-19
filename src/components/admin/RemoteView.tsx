import type { AdminViewServerProps } from 'payload'
import { formatCode } from '@/lib/remote/credentials'
import { gateRefusal, remoteBlockers } from '@/lib/remote/gate'
import {
  CAPABILITY_LABEL,
  MAX_CODE_ATTEMPTS,
  describeCapabilities,
  parseCapabilities,
  remoteSecret,
} from '@/lib/remote/policy'
import { readSession, timeLeft } from '@/lib/remote/session'
import { readAudit } from './audit-snapshot'
import { adminUrl } from '@/lib/admin-path'

/**
 * The half of remote control that is on the site.
 *
 * ## What this screen is for
 *
 * The owner's requirement, in their words, was that the code appear "on site
 * too so it works by showing we have all valid data". This is that screen: a
 * pending session here shows the same sixteen characters the terminal printed,
 * beside the device asking, the address it asked from, and what it wants to be
 * allowed to do. Comparing the two is the confirmation, and typing the code in
 * is where the owner says so.
 *
 * ## Why every control is a form and nothing is a client component
 *
 * Same reasoning as the analytics screen: no hydration, no bundle to fail to
 * load. An approval screen that stops working because a client component threw
 * is an approval screen that stops working on precisely the day somebody is
 * trying to fix the site from a train.
 *
 * ## What it does not do
 *
 * It does not mint the token, and it says so on the page. Approving flips a
 * status; the terminal collects its own credential on its next poll, signed by
 * the device key this browser does not have. That split is the whole reason
 * the code above it can safely be printed at all, so the sentence explaining
 * it lives next to the button rather than in a document nobody opens.
 *
 * Registered as a root view at `/admin/remote`, linked from `RemoteNavLink`.
 */

const NUM = (value: number): string => value.toLocaleString('en-GB')

type SessionRow = {
  id: number | string
  code: string
  status: string
  requestedCapabilities?: (string | null)[] | null
  approvedCapabilities?: (string | null)[] | null
  capabilities?: (string | null)[] | null
  pairingExpiresAt?: string | null
  expiresAt?: string | null
  approvedAt?: string | null
  lastUsedAt?: string | null
  idleMs?: number | null
  codeAttempts?: number | null
  ip?: string | null
  agent?: string | null
  writes?: number | null
  reads?: number | null
  endedReason?: string | null
  createdAt?: string
  device?: { id: number | string; label?: string; fingerprint?: string; enabled?: boolean } | number | string
}

const deviceOf = (row: SessionRow) =>
  typeof row.device === 'object' && row.device !== null ? row.device : null

const when = (iso?: string | null): string =>
  iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—'

export default async function RemoteView({ payload, searchParams, initPageResult }: AdminViewServerProps) {
  /*
    Editors only, checked here as well as by the admin's own gate — and read
    from `initPageResult.req`, not from the `user` prop, for the reason
    AnalyticsView records at length: the type declares `user` and Payload 3.89
    does not supply one to a root view, so the wrong version compiles and tells
    a signed-in editor to sign in.
  */
  const user = initPageResult?.req?.user
  if (user?.collection !== 'users') {
    return (
      <div className="net-rc">
        <h1 className="net-rc-title">Remote control</h1>
        <p className="net-rc-bad">This page is for editors. Sign in with an editor account.</p>
      </div>
    )
  }

  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (typeof value === 'string') params.set(key, value)
  }

  const settings = (await payload.findGlobal({ slug: 'remote-access', depth: 0 })) as {
    enabled?: boolean | null
    collections?: (string | null)[] | null
  }

  const hasSecret = remoteSecret() !== null

  const [sessions, devices, log] = await Promise.all([
    payload.find({
      collection: 'remote-sessions',
      where: { status: { in: ['pending', 'approved', 'open'] } },
      sort: '-createdAt',
      limit: 20,
      depth: 1,
      overrideAccess: false,
      user,
    }),
    payload.find({
      collection: 'remote-devices',
      sort: '-updatedAt',
      limit: 25,
      depth: 0,
      overrideAccess: false,
      user,
    }),
    payload.find({
      collection: 'remote-log',
      sort: '-createdAt',
      limit: 25,
      depth: 1,
      overrideAccess: false,
      user,
    }),
  ])

  const rows = sessions.docs as unknown as SessionRow[]
  const live = rows.filter((row) => readSession(row as never).status === row.status)
  const pending = live.filter((row) => row.status === 'pending')
  const held = live.filter((row) => row.status === 'open' || row.status === 'approved')

  /*
    The gate, read through the same cached pass the dashboard and the nav
    badges use — one audit, one set of numbers. Shown here because the
    alternative is an owner running `pnpm remote connect`, being refused, and
    having to work out from a terminal what the admin already knew.

    A failed pass is **not** rendered as "nothing outstanding". The route that
    opens a session runs the audit itself and refuses on a throw, so a screen
    that reported a clean gate off a failed query would be promising something
    the server is about to deny — and it would be the reassuring answer, which
    is the failure this project keeps a list of.
  */
  const audit = await readAudit()
  const blockers = audit.ok ? remoteBlockers(audit.snapshot.findings) : null

  const done = params.get('done')
  const problem = params.get('problem')

  return (
    <div className="net-rc">
      <h1 className="net-rc-title">Remote control</h1>
      <p className="net-rc-lede">
        Writing to this live site from a terminal. A session is asked for from the command line and
        approved here — the sixteen characters below are printed in both places, and comparing them
        is what shows the session waiting here is the one in front of you.
      </p>

      {done ? <p className="net-rc-done">{done}</p> : null}
      {problem ? <p className="net-rc-bad">{problem}</p> : null}

      {/* --- Is it on at all ------------------------------------------------ */}
      <section className="net-rc-section">
        <h2 className="net-rc-heading">The two switches</h2>
        <ul className="net-rc-switches">
          <li data-on={hasSecret ? 'true' : 'false'}>
            <strong>REMOTE_CONTROL_SECRET</strong>
            <span>
              {hasSecret
                ? 'set on this deployment'
                : 'not set — every /api/remote route answers 404, whatever the box below says'}
            </span>
          </li>
          <li data-on={settings?.enabled ? 'true' : 'false'}>
            <strong>Remote sessions are enabled</strong>
            <span>
              {settings?.enabled ? (
                'ticked'
              ) : (
                <>
                  off — <a href={adminUrl('/globals/remote-access')}>Remote control settings</a>
                </>
              )}
            </span>
          </li>
        </ul>
        <p className="net-rc-note">
          Both are needed. Neither is on by default, and a deployment that never turns them on has
          no endpoint here that does anything. <code>docs/REMOTE.md</code> is the design.
        </p>
      </section>

      {/* --- The audit gate -------------------------------------------------- */}
      <section className="net-rc-section">
        <h2 className="net-rc-heading">Launch checks</h2>
        {blockers === null ? (
          <p className="net-rc-bad">
            The launch checks could not be read, so this is unknown rather than clear. Reload, or run{' '}
            <code>pnpm check:launch</code> for the same findings from the command line — a session
            will refuse to open while any of them is outstanding.
          </p>
        ) : blockers.length === 0 ? (
          <p className="net-rc-ok">
            Nothing outstanding that only you can supply. A session may open.
          </p>
        ) : (
          <>
            <p className="net-rc-bad">
              No session will open while these are outstanding. They are the same findings{' '}
              <code>pnpm check:launch</code> prints — nothing on this page asks its own version of
              the question.
            </p>
            <ul className="net-rc-blockers">
              {blockers.map((blocker) => (
                <li key={`${blocker.area}-${blocker.detail}`}>
                  <span className="net-rc-area">{blocker.area}</span>
                  {blocker.detail}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* --- Waiting for you ------------------------------------------------- */}
      <section className="net-rc-section">
        <h2 className="net-rc-heading">
          Waiting for approval {pending.length > 0 ? `(${pending.length})` : ''}
        </h2>

        {pending.length === 0 ? (
          <p className="net-rc-note">
            Nothing is waiting. A session appears here within a second of{' '}
            <code>pnpm remote connect</code> being run on an approved device.
          </p>
        ) : (
          pending.map((row) => {
            const device = deviceOf(row)
            /*
              The boxes offered are the ones the terminal asked for, and only
              those. A session is granted the intersection of the two lists, so
              a box for something it did not ask for would be a box that does
              nothing — and an approval screen with a control that has no
              effect is how somebody comes to believe a grant is wider than it
              is. Widening is `pnpm remote connect` again, which is one command.
            */
            const requested = parseCapabilities(row.requestedCapabilities ?? []).capabilities
            return (
              <article key={row.id} className="net-rc-pending">
                <p className="net-rc-code" aria-label="Pairing code">
                  {formatCode(row.code)}
                </p>
                <p className="net-rc-compare">
                  This must be exactly what your terminal printed. If it is not, refuse it — somebody
                  else asked for this session.
                </p>

                <dl className="net-rc-facts">
                  <div>
                    <dt>Device</dt>
                    <dd>{device?.label ?? 'unknown'}</dd>
                  </div>
                  <div>
                    <dt>Key fingerprint</dt>
                    <dd className="net-rc-mono">{device?.fingerprint ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>From</dt>
                    <dd className="net-rc-mono">{row.ip || 'unknown'}</dd>
                  </div>
                  <div>
                    <dt>Asked to</dt>
                    <dd>{describeCapabilities(requested)}</dd>
                  </div>
                  <div>
                    <dt>Expires</dt>
                    <dd>{timeLeft(row.pairingExpiresAt)}</dd>
                  </div>
                  <div>
                    <dt>Client</dt>
                    <dd className="net-rc-mono">{row.agent || '—'}</dd>
                  </div>
                </dl>

                {(row.codeAttempts ?? 0) > 0 ? (
                  <p className="net-rc-bad">
                    {row.codeAttempts} wrong {row.codeAttempts === 1 ? 'code' : 'codes'} typed.{' '}
                    {MAX_CODE_ATTEMPTS - (row.codeAttempts ?? 0)} left before this session locks.
                  </p>
                ) : null}

                <form method="post" action="/api/remote/decide" className="net-rc-form">
                  <input type="hidden" name="session" value={String(row.id)} />
                  <label>
                    <span>Type the code</span>
                    <input
                      type="text"
                      name="code"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="XXXX-XXXX-XXXX-XXXX"
                      required
                    />
                  </label>
                  <fieldset className="net-rc-caps">
                    <legend>What this session may do</legend>
                    {requested.map((capability) => (
                      <label key={capability} className="net-rc-cap">
                        <input
                          type="checkbox"
                          name="capability"
                          value={capability}
                          defaultChecked
                        />
                        <span>{CAPABILITY_LABEL[capability]}</span>
                      </label>
                    ))}
                    <p className="net-rc-note">
                      Untick anything this session does not need. The grant is fixed when the
                      terminal collects its token and cannot be widened afterwards — a session
                      that turns out to need more is a new <code>pnpm remote connect</code>, which
                      takes a few seconds. Every operation is checked against these boxes on the
                      server, and every row in the log below records what the session was
                      permitted to do as well as what it did.
                    </p>
                  </fieldset>
                  <div className="net-rc-buttons">
                    <button type="submit" name="action" value="approve" className="net-rc-approve">
                      Approve
                    </button>
                    <button type="submit" name="action" value="deny" className="net-rc-deny">
                      Refuse
                    </button>
                  </div>
                </form>

                <p className="net-rc-note">
                  Approving hands nothing over through this page. It records that you said yes and
                  which boxes you ticked; the terminal mints its own credential on its next poll,
                  signed by a key this browser does not have. The session gets the narrower of what
                  you ticked and what it asked for, so nothing here can widen a request.
                </p>
              </article>
            )
          })
        )}
      </section>

      {/* --- Live sessions ---------------------------------------------------- */}
      <section className="net-rc-section">
        <h2 className="net-rc-heading">Sessions in progress {held.length > 0 ? `(${held.length})` : ''}</h2>
        {held.length === 0 ? (
          <p className="net-rc-note">None open.</p>
        ) : (
          <table className="net-rc-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Device</th>
                <th>May</th>
                <th>Expires</th>
                <th>Writes</th>
                <th>Reads</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {held.map((row) => (
                <tr key={row.id}>
                  <td className="net-rc-mono">{formatCode(row.code)}</td>
                  <td>{deviceOf(row)?.label ?? '—'}</td>
                  {/*
                    What it holds if it is open, what it asked for if it has not
                    collected its token yet — labelled either way, because a
                    column that shows a request and a grant in the same cell
                    without saying which is a column that will be misread.
                  */}
                  <td>
                    {row.status === 'open'
                      ? describeCapabilities(parseCapabilities(row.capabilities ?? []).capabilities)
                      : `asked to ${describeCapabilities(
                          parseCapabilities(row.requestedCapabilities ?? []).capabilities,
                        )}`}
                  </td>
                  <td>{row.status === 'open' ? timeLeft(row.expiresAt) : 'not collected yet'}</td>
                  <td>{NUM(row.writes ?? 0)}</td>
                  <td>{NUM(row.reads ?? 0)}</td>
                  <td>
                    <form method="post" action="/api/remote/decide">
                      <input type="hidden" name="session" value={String(row.id)} />
                      <button type="submit" name="action" value="revoke" className="net-rc-deny">
                        Revoke
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="net-rc-note">
          Revoking stops the session on its next request. There is no cached grant anywhere that
          outlives it, and no way to re-open one — a new session is a new row, because a session
          that could be re-opened would be a credential that outlived the decision to end it.
        </p>
      </section>

      {/* --- Devices ---------------------------------------------------------- */}
      <section className="net-rc-section">
        <h2 className="net-rc-heading">Devices</h2>
        {devices.docs.length === 0 ? (
          <p className="net-rc-note">
            None yet. A device registers itself the first time it connects, disabled, and is refused
            until you enable it.
          </p>
        ) : (
          <table className="net-rc-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Enabled</th>
                <th>Key fingerprint</th>
                <th>Last seen</th>
                <th>From</th>
              </tr>
            </thead>
            <tbody>
              {(devices.docs as unknown as {
                id: number | string
                label: string
                enabled?: boolean | null
                fingerprint: string
                lastSeenAt?: string | null
                lastSeenIp?: string | null
              }[]).map((device) => (
                <tr key={device.id} data-off={device.enabled ? undefined : 'true'}>
                  <td>
                    <a href={adminUrl(`/collections/remote-devices/${device.id}`)}>{device.label}</a>
                  </td>
                  <td>{device.enabled ? 'yes' : 'no'}</td>
                  <td className="net-rc-mono">{device.fingerprint}</td>
                  <td>{when(device.lastSeenAt)}</td>
                  <td className="net-rc-mono">{device.lastSeenIp ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="net-rc-note">
          A device is an Ed25519 key the command line generated and keeps to itself. That proves a
          key you approved signed the request — <strong>not</strong> that a particular laptop did: a
          copied key file is a valid device. Unticking Enabled closes every session it holds on its
          next request.
        </p>
      </section>

      {/* --- The trail --------------------------------------------------------- */}
      <section className="net-rc-section">
        <h2 className="net-rc-heading">What sessions have changed</h2>
        {log.docs.length === 0 ? (
          <p className="net-rc-note">Nothing yet.</p>
        ) : (
          <table className="net-rc-table">
            <thead>
              <tr>
                <th>When</th>
                <th>What</th>
                <th>Wiki</th>
                <th>Permitted</th>
                <th>By</th>
                <th>Outcome</th>
              </tr>
            </thead>
            <tbody>
              {(log.docs as unknown as {
                id: number | string
                createdAt: string
                summary: string
                game?: string | null
                granted?: string | null
                outcome: string
                detail?: string | null
                actor?: { email?: string } | number | string | null
              }[]).map((entry) => (
                <tr key={entry.id} data-outcome={entry.outcome}>
                  <td>{when(entry.createdAt)}</td>
                  <td>
                    {entry.summary}
                    {entry.detail ? <span className="net-rc-detail"> — {entry.detail}</span> : null}
                  </td>
                  <td>{entry.game ?? '—'}</td>
                  <td>{entry.granted ?? '—'}</td>
                  <td>
                    {typeof entry.actor === 'object' && entry.actor ? entry.actor.email ?? '—' : '—'}
                  </td>
                  <td>{entry.outcome}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="net-rc-note">
          Writes, all of them, including the ones that were refused — an attempt to write something
          a session was not allowed to write is the entry you will most want to find. Reads are
          counted on the session rather than logged row by row. The full list is{' '}
          <a href={adminUrl('/collections/remote-log')}>Remote log</a>, which nothing in the admin can
          delete from.
        </p>
      </section>

      {blockers && blockers.length > 0 ? (
        <pre className="net-rc-refusal">{gateRefusal(blockers)}</pre>
      ) : null}
    </div>
  )
}

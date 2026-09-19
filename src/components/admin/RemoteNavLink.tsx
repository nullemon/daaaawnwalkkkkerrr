import { getPayload } from 'payload'
import config from '@payload-config'
import { remoteSecret } from '@/lib/remote/policy'
import { adminUrl } from '@/lib/admin-path'

/**
 * The sidebar's way in to `/admin/remote`.
 *
 * Payload builds its nav from collections and globals, and a root view
 * registered through `admin.components.views` is neither — it exists at a URL
 * and nothing links to it. `AnalyticsNavLink` records why this is a block under
 * the links rather than a badge spliced into Payload's own markup.
 *
 * Unlike analytics, this one does carry a count, because a pending session
 * genuinely is somebody waiting: a terminal is sitting on a ten-minute timer,
 * and a link with no number would mean the owner has to open the screen to
 * find out whether there is anything on it.
 *
 * It renders nothing at all on a deployment with no `REMOTE_CONTROL_SECRET`.
 * The routes answer 404 there, so a nav entry would be an invitation to a
 * screen whose every button fails — and one that told anybody who reached the
 * admin that the feature exists.
 *
 * The count cannot throw the nav. Every admin screen renders this, and an
 * owner who cannot use the CMS because a count query failed is much worse off
 * than one with no number beside a link. A failure renders the link and no
 * count, never a zero: "nothing is waiting" because a query threw is the
 * reassuring-answer failure this project keeps a list of.
 */
export default async function RemoteNavLink() {
  if (!remoteSecret()) return null

  let waiting: number | null = null
  try {
    const payload = await getPayload({ config })
    const found = await payload.count({
      collection: 'remote-sessions',
      where: { status: { equals: 'pending' } },
      overrideAccess: true,
    })
    waiting = found.totalDocs
  } catch {
    waiting = null
  }

  return (
    <div className="net-nav-extra">
      <a className="net-nav-extra-link" href={adminUrl('/remote')}>
        Remote control
        {waiting !== null && waiting > 0 ? (
          <span className="net-nav-extra-badge">{waiting}</span>
        ) : null}
      </a>
      <span className="net-nav-extra-note">
        {waiting === null
          ? 'Sessions from a terminal. The pending count could not be read.'
          : waiting > 0
            ? `${waiting} session${waiting === 1 ? '' : 's'} waiting for you to approve.`
            : 'Approve a terminal to write to this live site.'}
      </span>
    </div>
  )
}

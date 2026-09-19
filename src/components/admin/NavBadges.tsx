import { badgeCounts, entityHref } from '@/lib/audit'
import { readAudit } from './audit-snapshot'
import { adminUrl } from '@/lib/admin-path'

/**
 * The `(1)` in the sidebar: what is waiting for you, and behind which entry.
 *
 * ## Why it is a block under the nav and not a number on each nav link
 *
 * Payload 3.89 renders the nav links itself, from `groupNavItems`, and gives a
 * custom component no way in between them — `afterNavLinks` lands a component
 * inside `nav.nav__wrap`, immediately after the whole list (see
 * `@payloadcms/next/dist/elements/Nav/index.js`). The two ways to get a number
 * onto a link itself are replacing `admin.components.Nav` wholesale, which
 * means owning Payload's nav markup, its groups, its collapse preferences and
 * its mobile behaviour forever; or a client component that reaches into the
 * DOM after paint and appends a span to `a[href="…"]`. The second is the one
 * that looks cheap and is not: when Payload changes its nav markup, the badge
 * does not error, it silently stops appearing — which is this project's whole
 * catalogue of bugs in one line.
 *
 * So the badges are their own block, directly under the links, naming the entry
 * each one belongs to and linking to it. Same information, same place on
 * screen, nothing that can quietly stop working.
 *
 * ## Nothing here is dismissable
 *
 * Same reasoning as `src/components/LegalGap.tsx`, recorded in `docs/COPY.md`:
 * a warning the person being warned can delete is not a warning, and a badge
 * that can be cleared without fixing the thing is decoration. The only way
 * this block goes away is the findings going away.
 */
export default async function NavBadges() {
  const result = await readAudit()

  if (!result.ok) {
    /*
      A number is not available, so no number is shown. Rendering 0, or
      rendering nothing at all, would both report "all clear" on the strength
      of a failed query.
    */
    return (
      <div className="net-nav-badges net-nav-badges--failed">
        <span className="net-nav-badges-title">Needs you</span>
        <p className="net-nav-badges-failed">
          Could not be counted just now. Open the dashboard for the reason — this is not a count
          of zero.
        </p>
      </div>
    )
  }

  const badges = badgeCounts(result.snapshot.findings)
  if (badges.length === 0) return null

  const total = badges.reduce((sum, badge) => sum + badge.count, 0)

  return (
    <div className="net-nav-badges">
      <a className="net-nav-badges-title" href={adminUrl()}>
        Needs you · {total.toLocaleString('en-GB')}
      </a>
      <ul>
        {badges.map((badge) => (
          <li key={`${badge.entity.kind}:${badge.entity.slug}`}>
            <a href={entityHref(badge.entity)}>
              <span className="net-nav-badge">{badge.count.toLocaleString('en-GB')}</span>
              <span className="net-nav-badges-label">{badge.entity.label}</span>
            </a>
          </li>
        ))}
      </ul>
      <a className="net-nav-badges-more" href={adminUrl()}>
        What each one needs →
      </a>
    </div>
  )
}

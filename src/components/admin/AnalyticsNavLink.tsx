/**
 * The sidebar's way in to `/admin/analytics`.
 *
 * Payload builds its nav from the collections and globals it knows about, and
 * a root view registered through `admin.components.views` is neither — it
 * exists at a URL and nothing links to it. Without this the analytics screen is
 * a page the owner has to remember the address of, which is the same as not
 * having built it.
 *
 * `afterNavLinks`, alongside `NavBadges`, and for the reason recorded there:
 * Payload 3.89 renders its own nav links with no slot between them, and the
 * alternative — a client component that appends to the DOM after paint —
 * stops working silently the day Payload changes its markup. A block under the
 * links cannot do that.
 *
 * Deliberately not a badge. There is no number here that is waiting for
 * anybody: traffic is something to look at, not a queue to clear, and a count
 * next to it would make Tuesday's readers feel like a chore.
 */
export default function AnalyticsNavLink() {
  return (
    <div className="net-nav-extra">
      <a className="net-nav-extra-link" href="/admin/analytics">
        Analytics
      </a>
      <span className="net-nav-extra-note">Who read the site, and how they got here.</span>
    </div>
  )
}

/**
 * The search box, at the top of the sidebar on every admin screen.
 *
 * `beforeNavLinks`, not `afterNavLinks` where `Analytics` and `Remote` sit.
 * Those two are destinations you go to occasionally; this is the thing you
 * reach for while already doing something else, and a search box below
 * twenty-odd collection links is one you scroll past.
 *
 * A plain form with `method="get"`, so it works before any JavaScript loads
 * and the query lands in the URL where it can be pasted, bookmarked and
 * backed out of. `SearchView` explains why the results page is not a
 * typeahead.
 *
 * `name="q"` matches what the view reads, and the action is built from
 * `adminUrl` so moving the admin moves this with it — the whole reason that
 * helper exists.
 */

import { adminUrl } from '@/lib/admin-path'
import { SEARCH_TARGETS } from '@/lib/admin-search'

export default function SearchNavLink() {
  return (
    <form className="net-navsearch" method="get" action={adminUrl('/search')} role="search">
      <label className="net-navsearch-label" htmlFor="net-navsearch-input">
        Search
      </label>
      <input
        id="net-navsearch-input"
        className="net-navsearch-input"
        type="search"
        name="q"
        placeholder={`All ${SEARCH_TARGETS.length} collections…`}
        aria-label="Search every collection"
      />
    </form>
  )
}

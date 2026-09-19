import type { AdminViewServerProps } from 'payload'
import { adminUrl } from '@/lib/admin-path'
import {
  MIN_QUERY,
  PER_COLLECTION,
  SEARCH_TARGETS,
  cleanQuery,
  isSearchable,
} from '@/lib/admin-search'

/**
 * One box, every collection.
 *
 * Payload gives each collection its own search, which is right when you know
 * the answer is a quest and wrong for the question somebody actually arrives
 * with — *"where is the Anca page"*. Across sixteen game-scoped collections,
 * three directories and three queues, picking the collection first is the hard
 * half of the job. `lib/admin-search.ts` holds what is searched and why the
 * list is written out rather than derived.
 *
 * Registered as a root view and linked from the sidebar by `SearchNavLink`.
 *
 * ## A form, not a typeahead
 *
 * It submits with GET, so the query is in the URL: a result worth keeping is a
 * link somebody can paste into a message, the back button works, and a reload
 * shows the same thing. A typeahead would be prettier and would be a client
 * component firing twenty-three queries per keystroke against SQLite, on a
 * database where one page render already fans out across thirteen collections.
 *
 * ## Truncation is stated
 *
 * Each collection contributes at most `PER_COLLECTION` rows, and a group that
 * was cut says so with a link to that collection's own list view filtered by
 * the same text. A truncated list that does not admit it is the
 * `find({ limit: 2000 })` mistake — a denominator wrong in the reassuring
 * direction, which this repository has already paid for once.
 */

type Row = { id: string | number; label: string; where: string | null }
type Group = { slug: string; label: string; rows: Row[]; total: number }

export default async function SearchView({
  payload,
  searchParams,
  initPageResult,
}: AdminViewServerProps) {
  /*
    Editors only, and read from `initPageResult.req` rather than the `user`
    prop. `AdminViewServerProps` declares `user` because it spreads
    `ServerProps`, and Payload 3.89 does not put one in the props it builds for
    a root view — so the typed version compiles and renders "sign in" to an
    editor who is signed in. `AnalyticsView` records the same trap.
  */
  const user = initPageResult?.req?.user
  if (user?.collection !== 'users') {
    return (
      <div className="net-search">
        <h1 className="net-search-title">Search</h1>
        <p className="net-search-note">This page is for editors. Sign in with an editor account.</p>
      </div>
    )
  }

  const raw = searchParams?.q
  const query = cleanQuery(typeof raw === 'string' ? raw : null)

  const form = (
    <form className="net-search-form" method="get" action={adminUrl('/search')} role="search">
      <input
        className="net-search-input"
        type="search"
        name="q"
        defaultValue={query}
        placeholder="Search every collection — a quest, a studio, a guide, an image…"
        aria-label="Search the network"
        autoFocus
      />
      <button className="net-search-go" type="submit">
        Search
      </button>
    </form>
  )

  if (!isSearchable(query)) {
    return (
      <div className="net-search">
        <h1 className="net-search-title">Search</h1>
        {form}
        <p className="net-search-note">
          {query.length === 0
            ? `Looks in all ${SEARCH_TARGETS.length} collections at once, so you do not have to pick one first.`
            : `At least ${MIN_QUERY} characters — a single letter matches most of the database.`}
        </p>
      </div>
    )
  }

  /*
    One query per collection, in parallel, and every one of them can fail on
    its own. A collection whose search field does not exist — a schema change
    landed, a slug renamed — must not take the whole screen down with it, so a
    rejection becomes an empty group rather than an exception. The alternative
    is a search box that shows nothing and says nothing, which is the one
    outcome worse than showing twenty-two of twenty-three groups.
  */
  const groups: Group[] = (
    await Promise.all(
      SEARCH_TARGETS.map(async (target): Promise<Group | null> => {
        try {
          const result = await payload.find({
            collection: target.slug as Parameters<typeof payload.find>[0]['collection'],
            where: { [target.field]: { like: query } },
            limit: PER_COLLECTION,
            depth: target.scoped ? 1 : 0,
            sort: target.field,
            overrideAccess: false,
            user,
          })
          if (result.docs.length === 0) return null

          const rows: Row[] = (result.docs as unknown as Record<string, unknown>[]).map((doc) => {
            const game = doc.game
            const wiki =
              target.scoped && game && typeof game === 'object'
                ? ((game as { shortTitle?: string; title?: string }).shortTitle ??
                  (game as { title?: string }).title ??
                  null)
                : null
            return {
              id: doc.id as string | number,
              /* A row whose name field is empty is still a real record, and an
                 empty link is unclickable — so it falls back to its id. */
              label: String(doc[target.field] ?? '').trim() || `Untitled (#${doc.id})`,
              where: wiki,
            }
          })

          return { slug: target.slug, label: target.label, rows, total: result.totalDocs }
        } catch {
          return null
        }
      }),
    )
  ).filter((group): group is Group => group !== null)

  const found = groups.reduce((sum, group) => sum + group.total, 0)

  return (
    <div className="net-search">
      <h1 className="net-search-title">Search</h1>
      {form}

      {groups.length === 0 ? (
        <p className="net-search-note">
          Nothing matches “{query}”. The search is on each record’s name, not on the body text — a
          phrase from inside a guide will not find it.
        </p>
      ) : (
        <>
          <p className="net-search-note">
            {found.toLocaleString('en-GB')} {found === 1 ? 'match' : 'matches'} for “{query}”, in{' '}
            {groups.length} {groups.length === 1 ? 'collection' : 'collections'}. Names only, not
            body text.
          </p>
          <div className="net-search-groups">
            {groups.map((group) => (
              <section key={group.slug} className="net-search-group">
                <h2 className="net-search-group-head">
                  {group.label}
                  <span className="net-search-count">{group.total.toLocaleString('en-GB')}</span>
                </h2>
                <ul className="net-search-list">
                  {group.rows.map((row) => (
                    <li key={`${group.slug}-${row.id}`}>
                      <a href={adminUrl(`/collections/${group.slug}/${row.id}`)}>{row.label}</a>
                      {row.where ? <span className="net-search-where">{row.where}</span> : null}
                    </li>
                  ))}
                </ul>
                {group.total > group.rows.length ? (
                  <a
                    className="net-search-more"
                    href={`${adminUrl(`/collections/${group.slug}`)}?limit=50&search=${encodeURIComponent(query)}`}
                  >
                    All {group.total.toLocaleString('en-GB')} in {group.label.toLowerCase()}
                  </a>
                ) : null}
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

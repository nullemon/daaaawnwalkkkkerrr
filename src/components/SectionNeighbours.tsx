import Link from 'next/link'
import { getAll } from '@/lib/payload'
import { SECTION_PATH, type GameScopedCollection } from '@/lib/tenancy'

/**
 * The rest of the section, from inside one of its records.
 *
 * A measured weakness: 113 of 152 sampled pages carried fewer than
 * twenty-five internal links, and the detail pages were the worst of them at
 * eleven to twenty-one. A reader who lands on one enemy from a search has
 * nowhere to go but the back button, which is the difference between a
 * database that happens to be on the web and something that reads like a
 * wiki.
 *
 * Three things, in the order they are useful:
 *
 *   - **Previous and next**, so the section can be read straight through.
 *     Alphabetical rather than by any editorial rank, because alphabetical is
 *     the order somebody can predict and resume.
 *   - **A window of neighbours** around this record, which is where most of
 *     the new links come from and why they are worth following: they are the
 *     records most likely to be confused with this one.
 *   - **The index**, always, with its real count.
 *
 * Deliberately not "related records you might like". Every link here is a
 * fact about the section - it is the record before, the record after, or one
 * of its neighbours - and none of it is a guess about what a reader wants.
 */
export async function SectionNeighbours({
  collection,
  game,
  slug,
  label,
  /*
    How many neighbours to show. Twelve rather than six: on a wiki with a
    thin section the smaller window left detail pages at seventeen internal
    links, still under the twenty-five the audit treats as poorly linked,
    and a wrapped row of short names costs nothing to scan.
  */
  window = 12,
}: {
  collection: GameScopedCollection
  game: string
  slug: string
  /** Plural, lower case: "enemies", "quests". */
  label: string
  window?: number
}) {
  const all = await getAll(collection, { game, depth: 0, sort: 'title' })
  if (all.length < 2) return null

  const index = all.findIndex((record) => String(record.slug) === slug)
  if (index === -1) return null

  const base = SECTION_PATH[collection]
  const previous = index > 0 ? all[index - 1] : null
  const next = index < all.length - 1 ? all[index + 1] : null

  /*
    A window that slides rather than clips. Near either end the range would
    otherwise be half as long, and the first record in a section is exactly
    the one a reader is most likely to have arrived at.
  */
  const half = Math.floor(window / 2)
  let from = Math.max(0, index - half)
  const to = Math.min(all.length, from + window + 1)
  from = Math.max(0, to - window - 1)

  const neighbours = all.slice(from, to).filter((record) => String(record.slug) !== slug)

  return (
    <nav className="neighbours" aria-label={`More ${label}`}>
      <div className="neighbours-step">
        {previous ? (
          <Link className="neighbours-prev" href={`${base}/${previous.slug}`} rel="prev">
            <span className="neighbours-dir">Previous</span>
            <span className="neighbours-name">{previous.title}</span>
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link className="neighbours-next" href={`${base}/${next.slug}`} rel="next">
            <span className="neighbours-dir">Next</span>
            <span className="neighbours-name">{next.title}</span>
          </Link>
        ) : (
          <span />
        )}
      </div>

      {neighbours.length > 0 ? (
        <>
          <p className="neighbours-head">
            More {label} · <Link href={base}>all {all.length}</Link>
          </p>
          <ul className="neighbours-list">
            {neighbours.map((record) => (
              <li key={record.id}>
                <Link href={`${base}/${record.slug}`}>{record.title}</Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </nav>
  )
}

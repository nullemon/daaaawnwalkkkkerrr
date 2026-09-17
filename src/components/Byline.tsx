import type { Author, Media } from '@/payload-types'
import { getSiteSettings } from '@/lib/payload'
import { copy } from '@/lib/copy'
import { hub } from '@/lib/urls'

/**
 * Who wrote this, and when it was last looked at.
 *
 * Only guides carry one. A record page — a quest, an item, a region — has no
 * byline and never has: it is a compiled fact sheet rather than a piece of
 * writing, and putting a name on it would claim authorship of the game's own
 * data. Guides are written, so guides are signed.
 *
 * ## `provisional` does nothing here, and that is deliberate
 *
 * The contributor roster ships as placeholders with `provisional` ticked. This
 * component does not read the flag: a byline prints the name on the record,
 * placeholder or not.
 *
 * That is a decision rather than an oversight, and it replaced an earlier one
 * where the flag swapped the name for the editorial team, hid the profile from
 * search and dropped the author out of the Article markup — three behaviours
 * hanging off one editorial checkbox, so a real contributor stayed invisible
 * until somebody remembered to untick it, and nobody remembers.
 *
 * The failure mode that leaves behind is a claim about a person who does not
 * exist, printed on 394 guides. The answer is not to print a warning 394 times
 * — the marker belongs where a reader who wants to know who wrote this
 * actually goes, which is the profile the byline links to. `/authors/[slug]`
 * carries it, unconditionally and in code rather than as editable copy, for
 * the same reason `LegalGap` is in code: a warning the person being warned can
 * edit away is not a warning. See `docs/COPY.md`.
 *
 * **Anything that claims this component reads `provisional` is stale.** Four
 * separate comments did, for as long as 36 of 36 contributors were
 * placeholders and not one page said so.
 *
 * No avatar placeholder either: a blank circle beside a name looks like a
 * broken image rather than a person.
 */
export async function Byline({
  author,
  updated,
}: {
  author?: Author | number | string | null
  updated?: string | null
}) {
  const settings = await getSiteSettings()
  const person = author && typeof author === 'object' ? (author as Author) : null
  /*
    Three states, not two, and the middle one is the one that bites.

      person          the relationship resolved — print the name
      author, no doc  an id came back unpopulated, i.e. the caller read at
                      depth 0. There *is* an author; we just cannot name them,
                      so crediting the team here would be a false statement
                      about a page that is signed. Print the date alone.
      no author       genuinely unsigned — this is what `bylineTeamFallback`
                      is for.

    The middle and last cases were collapsed into `const named = person`, which
    made the team branch below unreachable and the Site settings field labelled
    "Byline when nobody is named" inert: it saved, and changed nothing on any
    page. A control that is present, reachable and useless is worse than no
    control, because somebody will set it and believe it took.
  */
  const unsigned = !author
  const avatar =
    person?.avatar && typeof person.avatar === 'object' ? (person.avatar as Media) : null
  const checked = updated ? new Date(updated) : null

  /*
    Who the page is credited to when nobody is named.

    The editable line wins outright, including over `maintainer` — a field
    labelled "Byline when nobody is named" that quietly loses to another field
    on a different tab is a control that is present, reachable and useless.
    Left blank it falls back to exactly what shipped: the maintainer if there
    is one, otherwise the team, named after the site.
  */
  const team = copy(
    settings.bylineTeamFallback,
    settings.maintainer || 'the {site} team',
    { site: settings.siteName ?? 'editorial' },
  )

  if (!author && !checked) return null

  const date = checked ? (
    <time className="byline-date" dateTime={checked.toISOString().slice(0, 10)}>
      Last checked{' '}
      {checked.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
    </time>
  ) : null

  return (
    <div className="byline">
      {person ? (
        <>
          {avatar?.url ? (
            <img
              className="byline-avatar"
              src={avatar.url}
              alt=""
              width={34}
              height={34}
              loading="lazy"
              decoding="async"
            />
          ) : null}
          <span className="byline-text">
            <span>
              By <a href={hub(`/authors/${person.slug}`)}>{person.name}</a>
              {person.role ? <span className="byline-role"> · {person.role}</span> : null}
            </span>
            {date}
          </span>
        </>
      ) : unsigned ? (
        <span className="byline-text">
          <span>
            Compiled and checked by {team}
            <span className="byline-role"> · no single author is claimed for this page</span>
          </span>
          {date}
        </span>
      ) : (
        <span className="byline-text">{date}</span>
      )}
    </div>
  )
}

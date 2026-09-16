import type { Author, Media } from '@/payload-types'
import { getSiteSettings } from '@/lib/payload'
import { hub } from '@/lib/urls'

/**
 * Who wrote this, and when it was last looked at.
 *
 * Only guides carry one. A record page — a quest, an item, a region — has no
 * byline and never has: it is a compiled fact sheet rather than a piece of
 * writing, and putting a name on it would claim authorship of the game's own
 * data. Guides are written, so guides are signed.
 *
 * ## Why a placeholder shows the team and not a name
 *
 * The six seeded authors are placeholders. They were already held out of the
 * Article structured data, on the grounds that claiming authorship to a
 * crawler is a stronger statement than printing a name — but they still
 * *printed* an invented person, which is the same claim made to the reader
 * instead of the machine.
 *
 * So a provisional author is shown as the editorial team that actually stands
 * behind the page. That is true, it is what organisational authorship is for,
 * and it costs nothing: the moment a real person with real credentials is in
 * the record and the flag comes off, their name appears here and in the
 * structured data together.
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
  const named = person && person.provisional === false ? person : null
  const avatar = named?.avatar && typeof named.avatar === 'object' ? (named.avatar as Media) : null
  const checked = updated ? new Date(updated) : null

  const team = settings.maintainer || `the ${settings.siteName ?? 'editorial'} team`

  if (!person && !checked) return null

  const date = checked ? (
    <time className="byline-date" dateTime={checked.toISOString().slice(0, 10)}>
      Last checked{' '}
      {checked.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
    </time>
  ) : null

  return (
    <div className="byline">
      {named ? (
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
              By <a href={hub(`/authors/${named.slug}`)}>{named.name}</a>
              {named.role ? <span className="byline-role"> · {named.role}</span> : null}
            </span>
            {date}
          </span>
        </>
      ) : person ? (
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

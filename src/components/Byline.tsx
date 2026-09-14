import Link from 'next/link'
import type { Author, Media } from '@/payload-types'

/**
 * Who wrote this, and when it was last looked at.
 *
 * No avatar placeholder: a blank circle beside a name looks like a broken image
 * rather than a person, so the picture appears only once there is one to show.
 *
 * The `provisional` flag on an author no longer prints anything here — the site
 * owner tracks that in the admin instead. It still keeps the name out of the
 * Article structured data, which is the half that matters: claiming authorship
 * to a crawler is a stronger statement than printing a name, and it costs
 * nothing to hold that back until a real person is behind the page.
 */
export function Byline({
  author,
  updated,
}: {
  author?: Author | number | string | null
  updated?: string | null
}) {
  const person = author && typeof author === 'object' ? (author as Author) : null
  const avatar = person?.avatar && typeof person.avatar === 'object' ? (person.avatar as Media) : null
  const checked = updated ? new Date(updated) : null

  if (!person && !checked) return null

  return (
    <div className="byline">
      {person ? (
        <>
          {avatar?.url ? (
            <img className="byline-avatar" src={avatar.url} alt="" width={34} height={34} />
          ) : null}
          <span className="byline-text">
            <span>
              By <Link href={`/authors/${person.slug}`}>{person.name}</Link>
              {person.role ? <span className="byline-role"> · {person.role}</span> : null}
            </span>
            {checked ? (
              <time className="byline-date" dateTime={checked.toISOString().slice(0, 10)}>
                Last checked {checked.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
              </time>
            ) : null}
          </span>
        </>
      ) : (
        checked && (
          <span className="byline-text">
            <time className="byline-date" dateTime={checked.toISOString().slice(0, 10)}>
              Last checked {checked.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
            </time>
          </span>
        )
      )}

    </div>
  )
}

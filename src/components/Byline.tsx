import Link from 'next/link'
import { Icon } from './Icon'
import type { Author, Media } from '@/payload-types'

/**
 * Who wrote this, and when it was last looked at.
 *
 * A byline is only worth printing if it is answerable, so a placeholder author
 * says so rather than presenting an invented person as a real one. The notice
 * disappears the moment an editor unticks `provisional` on a record that names
 * somebody real — the same switch the legal pages use.
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
          ) : (
            <span className="byline-avatar byline-avatar-blank">
              <Icon name="person" size={17} />
            </span>
          )}
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

      {person?.provisional ? (
        <p className="byline-provisional">
          This byline is a placeholder. Nobody of this name has written this page — the site owner
          replaces these with real contributors in the admin.
        </p>
      ) : null}
    </div>
  )
}

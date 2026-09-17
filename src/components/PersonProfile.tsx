import type { ReactNode } from 'react'
import type { Media, Person } from '@/payload-types'
import { copy } from '@/lib/copy'
import { externalSite } from '@/lib/urls'
import {
  PEOPLE_BUILT_IN,
  PERSON_ROLE_LABEL,
  PERSON_ROW_LABEL,
  getPeopleSite,
} from '@/lib/people-copy'

/**
 * The infobox on a person's page.
 *
 * The same shape as `GameProfile` on a wiki home — a portrait card with a
 * heading, an image and one column of label/value rows — because it answers the
 * same kind of question in the same place, and two boxes that do the same job
 * in two different shapes is a network that looks assembled from parts.
 *
 * Two things here are not negotiable, and both are about these being pages
 * about living people:
 *
 * **It never returns null.** `GameProfile` drops out when a game has no facts,
 * which is right for a product and wrong here: a record with a name, a role and
 * a source and nothing else is the honest state of most of these profiles, and
 * the panel is where the page says so. A page that renders a name and then
 * nothing reads as a stub somebody abandoned.
 *
 * **No silhouette.** Where there is no freely licensed photograph the panel
 * prints `noPhotoNote` instead. A grey outline of a head reads as an image that
 * failed to load, which is a different claim from "no such photograph exists we
 * are allowed to publish" — and the second one is true.
 */

type Row = { label: string; value: ReactNode }

export async function PersonProfile({ person }: { person: Person }) {
  const site = await getPeopleSite()
  const profile = site.profile ?? {}

  /* Read here rather than in the JSX: it is tested for emptiness before it is
     printed, because the built-in is deliberately blank. */
  const sourcingNote = copy(profile.sourcingNote, PEOPLE_BUILT_IN.profile.sourcingNote)

  const photo = person.photo && typeof person.photo === 'object' ? (person.photo as Media) : null
  const roles = (person.roles ?? []).map((role) => PERSON_ROLE_LABEL[role] ?? role)

  /*
    The host, not the whole URL. A personal site is often a long path with a
    tracking tail on it, and this column is 318px wide on a desktop — an
    un-breakable URL in it either overflows or wraps to five lines. The href
    stays exactly what the record holds.
  */
  const websiteHref = externalSite(person.website)
  const websiteLabel = (() => {
    const raw = person.website?.trim()
    if (!raw) return null
    if (!websiteHref) return raw
    return new URL(websiteHref).host.replace(/^www\./, '')
  })()

  /* Only rows a source actually gave. Nothing prints as "unknown": the schema's
     whole argument is that an empty field is a gap somebody can fill, and a
     column of "unknown" is thirty claims nobody made. */
  const rows: Row[] = [
    roles.length ? { label: PERSON_ROW_LABEL.roles, value: roles.join(', ') } : null,
    person.born ? { label: PERSON_ROW_LABEL.born, value: person.born } : null,
    person.birthPlace ? { label: PERSON_ROW_LABEL.birthPlace, value: person.birthPlace } : null,
    person.nationality ? { label: PERSON_ROW_LABEL.nationality, value: person.nationality } : null,
    person.activeSince ? { label: PERSON_ROW_LABEL.activeSince, value: person.activeSince } : null,
    person.alsoKnownAs ? { label: PERSON_ROW_LABEL.alsoKnownAs, value: person.alsoKnownAs } : null,
    websiteLabel
      ? {
          label: PERSON_ROW_LABEL.website,
          /*
            A link only when the record holds a URL a browser can follow.
            Three of these eight values are a bare domain and one is two
            domains in a space-separated pair, and a bare domain in an `href`
            is a *relative* path: the Website row on a living person's profile
            resolved to `people.<domain>/olivierderiviere.com` and answered
            404. The value still prints, because it is what the source said —
            it just stops pretending to be somewhere to go. See
            `externalSite`.
          */
          value: websiteHref ? (
            <a href={websiteHref} rel="nofollow noopener noreferrer" target="_blank">
              {websiteLabel}
            </a>
          ) : (
            websiteLabel
          ),
        }
      : null,
  ].filter(Boolean) as Row[]

  return (
    <aside className="personprofile" aria-labelledby="personprofile-head">
      <h2 className="personprofile-title" id="personprofile-head">
        {person.name}
      </h2>

      {photo?.url ? (
        <figure className="personprofile-art">
          <img
            src={photo.sizes?.card?.url ?? photo.url}
            alt={photo.alt ?? person.name}
            /* Not lazy. On a phone this panel comes first, which makes the
               portrait a candidate for the largest contentful paint — the one
               place a lazy attribute costs more than it saves. */
            fetchPriority="high"
            decoding="async"
          />
          {/* A freely licensed photograph is only freely licensed while the
              credit travels with it, which is the same condition the logos on
              the companies host are published under. */}
          {photo.credit ? <figcaption>{photo.credit}</figcaption> : null}
        </figure>
      ) : (
        <p className="personprofile-nophoto">
          {copy(profile.noPhotoNote, PEOPLE_BUILT_IN.profile.noPhotoNote)}
        </p>
      )}

      {rows.length > 0 ? (
        <dl className="personprofile-facts">
          {rows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {/*
        Blank by default now, by the owner's decision: the standing sourcing
        sentence came off the profiles and they are writing the provenance
        wording themselves. The call site stays wired so the admin box still
        reaches the page — deleting it would leave a field that changes
        nothing, which is worse than an empty one. Where it renders at all it
        renders on every profile with no condition on the facts, because a
        note that appears only on the pages that happen to have facts is
        missing from exactly the pages where a reader most needs it.
      */}
      {sourcingNote ? <p className="personprofile-note">{sourcingNote}</p> : null}
    </aside>
  )
}

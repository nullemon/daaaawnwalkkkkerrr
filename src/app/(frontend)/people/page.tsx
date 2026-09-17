import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { EntityCard } from '@/components/EntityCard'
import { Badge } from '@/components/Badges'
import { client } from '@/lib/payload'
import { copy, pick, splitTokens } from '@/lib/copy'
import {
  PEOPLE_BUILT_IN,
  PERSON_ROLE_LABEL,
  UNFILED_HEADING,
  UNFILED_NOTE,
  getPeopleSite,
} from '@/lib/people-copy'
import { companyUrl } from '@/lib/urls'
import type { Media, Person } from '@/payload-types'

/**
 * Metadata reads the global, so it cannot be a module-level constant: the title
 * and the description on this page are editable like everything else, a `const
 * metadata` is evaluated once at import with no way to await a read, and
 * `pnpm check:launch` fails the build on one.
 */
export async function generateMetadata(): Promise<Metadata> {
  const site = await getPeopleSite()
  return {
    title: { absolute: copy(site.title, PEOPLE_BUILT_IN.title) },
    description: copy(site.metaDescription, PEOPLE_BUILT_IN.metaDescription),
    alternates: { canonical: '/' },
  }
}

const photoOf = (person: Person): { url?: string | null; alt?: string | null } | null => {
  const photo = person.photo && typeof person.photo === 'object' ? (person.photo as Media) : null
  if (!photo?.url) return null
  return { url: photo.sizes?.card?.url ?? photo.url, alt: photo.alt }
}

/**
 * How a name files in a list.
 *
 * `sortName` where the record has one, the name as written where it does not —
 * because "last word of the name" is wrong for a great many people and a wrong
 * guess about somebody's name is the kind of small disrespect the schema spends
 * a whole column to avoid. See the comment on `sortName` in
 * `src/collections/People.ts`.
 */
const filingName = (person: Person): string => (person.sortName || person.name).trim()

const byFilingName = (a: Person, b: Person): number =>
  filingName(a).localeCompare(filingName(b), 'en', { sensitivity: 'base' })

/** A section note, or nothing at all when neither the editor nor the code has one. */
function Note({ text }: { text?: string | null }) {
  const value = (text ?? '').trim()
  if (!value) return null
  return <p className="note">{value}</p>
}

/**
 * The callout body, with `{companiesLink}` as a real anchor.
 *
 * Parts, not markup: the alternative is an admin-editable string reaching the
 * DOM through `dangerouslySetInnerHTML`, which is a stored-XSS hole waiting for
 * the first editor account that should not have had one. An unknown token is
 * left visible — a typo somebody fixes in a minute beats a silent gap.
 */
function whyBodyNodes(text: string): ReactNode[] {
  return splitTokens(text).map((part, index) => {
    if (!('token' in part)) return <span key={index}>{part.text}</span>
    if (part.token === 'companiesLink') {
      return (
        <a key={index} href={companyUrl('/')}>
          studios and publishers
        </a>
      )
    }
    return <span key={index}>{`{${part.token}}`}</span>
  })
}

/** One group of the directory. Rendered only when somebody is in it. */
function Group({
  heading,
  note,
  people,
}: {
  heading: string
  note?: string | null
  people: Person[]
}) {
  if (people.length === 0) return null
  return (
    <section className="section">
      <div className="section-head">
        <h2>{heading}</h2>
      </div>
      <Note text={note} />
      <div className="grid">
        {people.map((person) => (
          <EntityCard
            key={person.id}
            href={`/${person.slug}`}
            title={person.name}
            /* `knownFor` is the one line written for exactly this spot; the
               summary is the fallback so a record without one still says
               something on a card. */
            summary={person.knownFor || person.summary}
            image={photoOf(person)}
            icon="person"
            badges={
              <>
                {(person.roles ?? []).map((role) => (
                  <Badge key={role}>{PERSON_ROLE_LABEL[role] ?? role}</Badge>
                ))}
              </>
            }
          />
        ))}
      </div>
    </section>
  )
}

export default async function PeopleIndex() {
  const payload = await client()
  const [{ docs }, site] = await Promise.all([
    payload.find({ collection: 'people', limit: 1000, depth: 1, sort: 'name' }),
    getPeopleSite(),
  ])
  const people = (docs as Person[]).slice().sort(byFilingName)
  const groups = site.groups ?? {}

  /*
    Grouped on `basis` — how the name reached this network — which is the same
    disclosure the companies host makes, and for the same reason: how a name was
    chosen is part of what a reader is owed.

    The fourth group is not a fourth basis. `basis` is optional on the schema, so
    anything that writes a record without setting it would otherwise be in the
    database, in the sitemap and on no page a reader could reach — which is
    precisely what three-way grouping did to a hundred and ninety-nine companies.
  */
  const credited = people.filter((person) => person.basis === 'game-credit')
  const cast = people.filter((person) => person.basis === 'character-credit')
  const officers = people.filter((person) => person.basis === 'company-officer')
  const unfiled = people.filter(
    (person) =>
      !['game-credit', 'character-credit', 'company-officer'].includes(String(person.basis)),
  )

  return (
    <>
      <PageHeader
        eyebrow={copy(site.eyebrow, PEOPLE_BUILT_IN.eyebrow)}
        crumbs={[{ label: 'People' }]}
        icon="person"
        title={copy(site.title, PEOPLE_BUILT_IN.title)}
        /* The count is filled at render time: a typed-in total is a sentence
           that goes wrong the week the harvester reads another cast list. */
        lede={copy(site.lede, PEOPLE_BUILT_IN.lede, { count: people.length })}
      />
      <div className="page body-main">
        {people.length === 0 ? (
          /*
            The host ships before the collection is filled. A heading over white
            space reads as a page that broke, and the difference between "not
            written yet" and "broken" is the only thing a reader can act on.
          */
          <div className="callout">
            <h2>{copy(site.title, PEOPLE_BUILT_IN.title)}</h2>
            <p>{copy(site.emptyNote, PEOPLE_BUILT_IN.emptyNote)}</p>
          </div>
        ) : null}

        <Group
          heading={copy(groups.creditedHeading, PEOPLE_BUILT_IN.groups.creditedHeading)}
          note={pick(groups.creditedNote, PEOPLE_BUILT_IN.groups.creditedNote)}
          people={credited}
        />
        <Group
          heading={copy(groups.castHeading, PEOPLE_BUILT_IN.groups.castHeading)}
          note={pick(groups.castNote, PEOPLE_BUILT_IN.groups.castNote)}
          people={cast}
        />
        <Group
          heading={copy(groups.officersHeading, PEOPLE_BUILT_IN.groups.officersHeading)}
          note={pick(groups.officersNote, PEOPLE_BUILT_IN.groups.officersNote)}
          people={officers}
        />
        <Group heading={UNFILED_HEADING} note={UNFILED_NOTE} people={unfiled} />

        <div className="callout">
          <h2>{copy(site.whyHeading, PEOPLE_BUILT_IN.whyHeading)}</h2>
          <p>{whyBodyNodes(copy(site.whyBody, PEOPLE_BUILT_IN.whyBody))}</p>
        </div>
      </div>
    </>
  )
}

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { JsonLd } from '@/components/JsonLd'
import { breadcrumbs, person as personSchema } from '@/lib/schema'
import { PEOPLE_ORIGIN } from '@/lib/urls'
import { Confidence } from '@/components/Badges'
import { PersonProfile } from '@/components/PersonProfile'
import { Linked, LinkedRichText } from '@/components/Linked'
import type { LinkScope } from '@/lib/link-index'
import { Attribution } from '@/components/Attribution'
import { Sources } from '@/components/Sources'
import { client, gameUrl } from '@/lib/payload'
import { copy } from '@/lib/copy'
import {
  NO_BIOGRAPHY_NOTE,
  PEOPLE_BUILT_IN,
  PERSON_ROLE_LABEL,
  WORK_KIND_LABEL,
  WORK_KIND_ORDER,
  getPeopleSite,
} from '@/lib/people-copy'
import { clamp } from '@/lib/seo'
import { companyUrl, hub } from '@/lib/urls'
import type { Character, Company, Game, Person } from '@/payload-types'

type Props = { params: Promise<{ slug: string }> }

const asGame = (value: unknown): Game | null =>
  value && typeof value === 'object' ? (value as Game) : null

/*
  Depth 2, not 1.

  A person's characters are one hop away and each character's *game* is two, and
  the game is what turns a character into a URL — every wiki is its own host, so
  `${gameUrl(game)}/characters/${slug}` needs the game record, not its id. At
  depth 1 every character would arrive with a numeric `game` and the section
  that exists to be a route back into the wikis would render as plain text.
*/
const find = async (slug: string): Promise<Person | null> => {
  const payload = await client()
  const { docs } = await payload.find({
    collection: 'people',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 2,
  })
  return (docs[0] as Person | undefined) ?? null
}

export async function generateStaticParams() {
  const payload = await client()
  const { docs } = await payload.find({ collection: 'people', limit: 1000, depth: 0 })
  return docs.map((person) => ({ slug: String(person.slug) }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const person = await find(slug)
  if (!person) return {}

  const roles = (person.roles ?? []).map((role) => PERSON_ROLE_LABEL[role] ?? role).join(' and ')
  return {
    title: person.seo?.title || clamp(`${person.name} — ${roles.toLowerCase() || 'credits'}`, 60),
    description: person.seo?.description || clamp(person.summary ?? ''),
    alternates: { canonical: `/${person.slug}` },
    robots: person.seo?.noindex ? { index: false, follow: true } : undefined,
  }
}

export default async function PersonPage({ params }: Props) {
  const { slug } = await params
  const [person, site] = await Promise.all([find(slug), getPeopleSite()])
  if (!person) notFound()

  /*
    Where this page is, for the inline linker.

    `self` is the whole reason it is passed: composed prose names the record it
    is about in its own first sentence, and a link from a page to itself reads
    as a bug. See `src/components/Linked.tsx`.
  */
  const scope: LinkScope = { host: 'people', self: `people:${person.id}` }
  const profile = site.profile ?? {}

  const games = ((person.games ?? []) as unknown[]).map(asGame).filter(Boolean) as Game[]
  const gameLinks = await Promise.all(
    games.map(async (game) => ({ game, href: await gameUrl(game) })),
  )

  const companies = ((person.companies ?? []) as unknown[]).filter(
    (value): value is Company => Boolean(value) && typeof value === 'object',
  )

  /*
    Characters, grouped by the wiki they live on.

    A flat list of twenty names across three games tells a reader nothing about
    which game they are about to leave for, and every one of these links crosses
    an origin. Anything whose game did not resolve is still listed, unlinked,
    rather than dropped: a record that quietly disappears from a page is the
    failure this repository has been bitten by more than once.
  */
  const characters = ((person.characters ?? []) as unknown[]).filter(
    (value): value is Character => Boolean(value) && typeof value === 'object',
  )
  const characterGroups = await Promise.all(
    [...new Map(characters.map((character) => [asGame(character.game)?.id ?? 0, character])).keys()]
      .map(async (gameId) => {
        const members = characters.filter((c) => (asGame(c.game)?.id ?? 0) === gameId)
        const game = asGame(members[0]?.game)
        return {
          key: gameId,
          title: game ? game.shortTitle || game.title : null,
          base: game ? await gameUrl(game) : null,
          members,
        }
      }),
  )

  /*
    Credits beyond this network, grouped by kind in a fixed order rather than
    sorted — "Games, Film, Television, Albums, Other" is the order somebody reads
    a filmography in, and an alphabetical one puts Albums first for no reason.
  */
  const works = person.works ?? []
  const workGroups = WORK_KIND_ORDER.map((kind) => ({
    kind,
    label: WORK_KIND_LABEL[kind] ?? kind,
    items: works.filter((work) => (work.kind ?? 'game') === kind),
  })).filter((group) => group.items.length > 0)

  const photo =
    person.photo && typeof person.photo === 'object'
      ? (person.photo as { url?: string | null })
      : null

  return (
    <>
      {/*
        The person, with an `@id` the company profiles point at through
        `employee` and the games through `subjectOf`. Note what is *not* here:
        `birthDate` only when `born` already holds a full date, because our
        sources write "c. 1970" and turning that into 1 January invents a day
        and a month about a living person.
      */}
      <JsonLd
        data={personSchema(
          { ...person, slug: String(person.slug) },
          {
            image: photo?.url
              ? photo.url.startsWith('http')
                ? photo.url
                : `${PEOPLE_ORIGIN}${photo.url}`
              : null,
            sources: (person.sources ?? []).map((source) => source?.url),
            companies: companies.map((company) => ({ slug: String(company.slug) })),
            games: gameLinks.map((entry) => ({ url: entry.href })),
          },
        )}
      />
      <JsonLd
        data={breadcrumbs(PEOPLE_ORIGIN, [{ label: 'People', href: '/' }, { label: person.name }])}
      />
      <PageHeader
        eyebrow="Person"
        crumbs={[{ label: 'People', href: '/' }, { label: person.name }]}
        icon="person"
        title={person.name}
        lede={person.summary ? <Linked text={person.summary} scope={scope} /> : undefined}
        badges={<Confidence level={person.confidence} />}
      />
      <div className="page body-main">
        <div className="split">
          <div className="stack">
            {person.body ? (
              <div className="prose">
                <LinkedRichText data={person.body} scope={scope} />
              </div>
            ) : (
              /* "Nothing has been published about this person" and "somebody
                 started this page and gave up" look identical on the page, and
                 only the first is true here. */
              <p className="note">{NO_BIOGRAPHY_NOTE}</p>
            )}

            {gameLinks.length > 0 ? (
              <section className="section section-card">
                <div className="section-head">
                  <h2>{copy(profile.gamesHeading, PEOPLE_BUILT_IN.profile.gamesHeading)}</h2>
                </div>
                <div className="grid">
                  {gameLinks.map(({ game, href }) => (
                    /*
                      A plain anchor, not `next/link`: every wiki is its own
                      origin, so there is no client-side navigation to be had
                      and a prefetch would only fail quietly.
                    */
                    <a key={game.id} className="card entity-card" href={href}>
                      <span className="card-top">
                        <h3>{game.shortTitle || game.title}</h3>
                      </span>
                      {game.summary ? <p>{game.summary}</p> : null}
                    </a>
                  ))}
                </div>
              </section>
            ) : null}

            {characters.length > 0 ? (
              <section className="section section-card">
                <div className="section-head">
                  <h2>
                    {copy(profile.charactersHeading, PEOPLE_BUILT_IN.profile.charactersHeading)}
                  </h2>
                </div>
                {characterGroups.map((group) => (
                  <div key={group.key}>
                    {group.title ? <h3 className="person-subhead">{group.title}</h3> : null}
                    <ul className="person-chips">
                      {group.members.map((character) => (
                        <li key={character.id}>
                          {group.base ? (
                            <a href={`${group.base}/characters/${character.slug}`}>
                              {character.title}
                            </a>
                          ) : (
                            <span>{character.title}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            ) : null}

            {workGroups.length > 0 ? (
              <section className="section section-card">
                <div className="section-head">
                  <h2>{copy(profile.creditsHeading, PEOPLE_BUILT_IN.profile.creditsHeading)}</h2>
                </div>
                {workGroups.map((group) => (
                  <div key={group.kind}>
                    <h3 className="person-subhead">{group.label}</h3>
                    <ul className="person-credits">
                      {group.items.map((work, index) => (
                        <li className="person-credit" key={work.id ?? `${work.title}-${index}`}>
                          <span className="person-credit-title">{work.title}</span>
                          {/* Year and role are printed only where the source
                              gave them. A credit with no year is a credit with
                              no year, not a credit from an invented one. */}
                          {work.year ? <span className="person-credit-year">{work.year}</span> : null}
                          {work.role ? <span className="person-credit-role">{work.role}</span> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            ) : null}

            {companies.length > 0 ? (
              <section className="section section-card">
                <div className="section-head">
                  <h2>{copy(profile.companiesHeading, PEOPLE_BUILT_IN.profile.companiesHeading)}</h2>
                </div>
                <ul className="person-chips">
                  {companies.map((company) => (
                    <li key={company.id}>
                      {/* `companies.<domain>` is a sibling host, not a path on
                          this one, so this is an absolute URL and a plain
                          anchor — a relative href would resolve to
                          `people.<domain>/<slug>` and 404 on a name that is not
                          a person. */}
                      <a href={companyUrl(`/${company.slug}`)}>{company.name}</a>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {/* The hub's contact page, not `/corrections`: that route is a
                wiki's and 404s on this host. See the prop's note in Sources.

                `cite`, because this is a page about a living person. A profile
                here can carry a date of birth and a birthplace, and with
                `showSources` off it carried both with nothing visible saying
                where either came from — an unsourced claim about a named human
                being, which is the failure the whole record schema exists to
                prevent. A release date can wait for a switch; this cannot. */}
            <Sources sources={person.sources} correctionsHref={hub('/contact')} cite />
            {/*
              The licence line, on the same footing as every record page on the
              network. Twenty-odd `[game]` routes render it and this host did
              not — and this host is built almost entirely out of Wikipedia,
              which is CC BY-SA and asks for attribution as a condition of
              reuse. It renders nothing while the owner keeps
              `attributionStyle` at "hidden", exactly as on a wiki; what
              matters is that the switch now reaches these pages at all.
            */}
            <Attribution sources={person.sources} />
          </div>

          <div className="stack">
            <PersonProfile person={person} />
          </div>
        </div>
      </div>
    </>
  )
}

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { Badge, Confidence } from '@/components/Badges'
import { CompanyTitles, type CatalogueRow } from '@/components/CompanyTitles'
import { FactPanel } from '@/components/FactPanel'
import { breadcrumbs, organization } from '@/lib/schema'
import { JsonLd } from '@/components/JsonLd'
import { Icon } from '@/components/Icon'
import { RichText } from '@/components/RichText'
import { Sources } from '@/components/Sources'
import { client, gameUrl, rel, relMany } from '@/lib/payload'
import { copy, hasRichText } from '@/lib/copy'
import { COMPANIES_BUILT_IN, COMPANY_ROLE_LABEL, getCompaniesSite } from '@/lib/companies-copy'
import { clamp } from '@/lib/seo'
import { COMPANIES_ORIGIN, personUrl } from '@/lib/urls'
import { readOfficers } from '@/lib/officers'
import type { Company, Game } from '@/payload-types'

type Props = { params: Promise<{ slug: string }> }

/**
 * Depth 1 populates `logo`, `parent`, `subsidiaries`, `games` — and `coveredBy`
 * inside each catalogue row, which is what turns that row into a link into one
 * of this network's wikis. Depth counts relationship hops, not nesting, so the
 * array does not cost an extra level.
 */
const find = async (slug: string): Promise<Company | null> => {
  const payload = await client()
  const { docs } = await payload.find({
    collection: 'companies',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 1,
  })
  return (docs[0] as Company | undefined) ?? null
}

export async function generateStaticParams() {
  const payload = await client()
  /*
    A thousand, not five hundred. The harvester follows the corporate graph one
    edge at a time and the count only goes up; a limit that the collection grows
    past does not error, it silently stops prerendering the companies past it —
    rows in the database, entries in the sitemap, 404 for a reader.
  */
  const { docs } = await payload.find({ collection: 'companies', limit: 1000, depth: 0 })
  return docs.map((company) => ({ slug: String(company.slug) }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const company = await find(slug)
  if (!company) return {}

  const roles = (company.role ?? []).map((role) => COMPANY_ROLE_LABEL[role] ?? role).join(' and ')
  return {
    title: company.seo?.title || `${company.name} — ${roles.toLowerCase() || 'company'}`,
    description: company.seo?.description || clamp(company.summary ?? ''),
    alternates: { canonical: `/${company.slug}` },
    // The checkbox exists on every content collection and did nothing here: a
    // profile marked noindex was still indexable, with nothing on the page or
    // in any log to say so.
    robots: company.seo?.noindex ? { index: false, follow: true } : undefined,
  }
}

/**
 * A website as a reader would say it out loud.
 *
 * `https://www.remedygames.com/` is a string a browser needs and nobody reads.
 * The whole URL stays in the `href`; the label is the host. An unparseable
 * value falls back to itself rather than disappearing — an editor's typo should
 * be visible on the page, not swallowed by a `try`.
 */
const siteLabel = (url: string): string => {
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/\/$/, '')
  }
}

export default async function CompanyPage({ params }: Props) {
  const { slug } = await params
  const [company, site] = await Promise.all([find(slug), getCompaniesSite()])
  if (!company) notFound()
  const profile = site.profile ?? {}
  const built = COMPANIES_BUILT_IN.profile
  /* Read once rather than inside the JSX, because it is tested for emptiness
     before it is printed — the built-in is deliberately blank now. */
  const sourcingNote = copy(profile.sourcingNote, built.sourcingNote)

  const games = relMany<Game>(company.games)
  const links = await Promise.all(
    games.map(async (game) => ({ game, href: await gameUrl(game) })),
  )

  /*
    The catalogue, with every row's destination resolved here rather than in the
    component: a covered title links into its wiki, which is a different origin
    whose host only `gameUrl` knows, and that is an async read the renderer
    should not be doing per row.
  */
  const rows: CatalogueRow[] = await Promise.all(
    (company.titles ?? []).map(async (entry, index) => {
      const covered = rel<Game>(entry.coveredBy)
      const store = (entry.storeUrl ?? '').trim()
      return {
        key: entry.id ?? `${entry.title}-${index}`,
        title: entry.title,
        year: entry.year,
        role: entry.role,
        priceText: entry.priceText,
        isFree: entry.isFree,
        metacritic: entry.metacritic,
        reviews: entry.reviews,
        genre: entry.genre,
        platforms: entry.platforms,
        href: covered ? await gameUrl(covered) : store || null,
        internal: Boolean(covered),
      }
    }),
  )

  const logo =
    company.logo && typeof company.logo === 'object'
      ? (company.logo as { url?: string | null })
      : null
  /*
    The people this network has a profile for who are named as officers here.
    Read from the person side because that is where the relationship lives —
    one person holds posts at two companies and a string copied onto each
    company drifts the first time one is corrected.
  */
  const officers = (
    await (await client()).find({
      collection: 'people',
      where: { companies: { contains: company.id } },
      limit: 50,
      depth: 0,
    })
  ).docs

  /*
    `keyPeople` read back against those records, so each name can link to the
    page this network already has for them. Order and role text come from the
    infobox string rather than from the relationship: the relationship is a
    set, and "Megan Ellison (founder), Nathan Gary (president)" is a source
    that states both who and in what post.
  */
  const officerList = readOfficers(company.keyPeople, officers as { name?: string; slug?: string }[])

  const absolute = (url: string) => (url.startsWith('http') ? url : `${COMPANIES_ORIGIN}${url}`)

  const parent = rel<Company>(company.parent)
  const subsidiaries = relMany<Company>(company.subsidiaries)
  const defunct = company.defunct?.trim() || null
  const website = company.website?.trim() || null

  /*
    Only what the record actually has. Every one of these is dropped when the
    company's own article does not state it, rather than printed as "unknown"
    — the same rule the game records follow.

    "Closed" sits third, above everything about where the company is and how
    many people work there, because on a studio that no longer exists those rows
    are all in the past tense and this is the row that says so.
  */
  const facts = [
    { label: 'Role', value: (company.role ?? []).map((r) => COMPANY_ROLE_LABEL[r] ?? r).join(', ') },
    ...(company.founded ? [{ label: 'Founded', value: company.founded }] : []),
    ...(company.founders ? [{ label: 'Founders', value: company.founders }] : []),
    ...(defunct ? [{ label: 'Closed', value: defunct }] : []),
    ...(company.formerNames ? [{ label: 'Formerly', value: company.formerNames }] : []),
    ...(company.acquired ? [{ label: 'Acquired', value: company.acquired }] : []),
    ...(company.headquarters ? [{ label: 'Headquarters', value: company.headquarters }] : []),
    ...(company.country ? [{ label: 'Country', value: company.country }] : []),
    ...(company.employees ? [{ label: 'Employees', value: company.employees }] : []),
    ...(company.revenue ? [{ label: 'Revenue', value: company.revenue }] : []),
    ...(company.industry ? [{ label: 'Industry', value: company.industry }] : []),
    ...(company.franchises ? [{ label: 'Known for', value: company.franchises }] : []),
    ...(rows.length > 0 ? [{ label: 'Titles listed', value: rows.length }] : []),
    ...(games.length > 0 ? [{ label: 'Games covered here', value: games.length }] : []),
  ]

  return (
    <>
      {/*
        The organisation, with an `@id` every game record on the network points
        at. Without it a wiki saying "Capcom" and this page about Capcom are two
        unrelated strings that happen to match.
      */}
      <JsonLd
        data={organization(company, {
          image: logo?.url ? absolute(logo.url) : null,
          sources: (company.sources ?? []).map((source) => source?.url),
          parent: parent ? { slug: String(parent.slug) } : null,
          subsidiaries: subsidiaries.map((child) => ({ slug: String(child.slug) })),
          people: officers.map((officer) => ({ slug: String(officer.slug) })),
        })}
      />
      <JsonLd
        data={breadcrumbs(COMPANIES_ORIGIN, [
          { label: 'Companies', href: '/' },
          { label: company.name },
        ])}
      />
      <PageHeader
        eyebrow="Company"
        crumbs={[{ label: 'Companies', href: '/' }, { label: company.name }]}
        icon="person"
        title={company.name}
        lede={company.summary}
        badges={
          <>
            <Confidence level={company.confidence} />
            {/* The field holds a year, so the badge supplies the word. Beside a
                company's name a bare "2015" could be anything. */}
            {defunct ? <Badge>Closed {defunct}</Badge> : null}
          </>
        }
      />
      <div className="page body-main">
        <div className="split">
          <div className="stack">
            {/*
              A closed studio, said first and said in red. It is the single most
              useful thing a page like this carries and the thing most often
              missing elsewhere, and a reader who takes the present tense of the
              paragraph below at face value has been misled by this page rather
              than by a source.
            */}
            {defunct ? (
              <div className="callout" data-tone="risk">
                <p>{copy(profile.defunctNote, built.defunctNote, { defunct })}</p>
              </div>
            ) : null}

            {logo?.url ? (
              <figure className="company-logo">
                <img src={logo.url} alt={`${company.name} logo`} loading="lazy" />
              </figure>
            ) : null}

            {/* Where it is now, in one click. Buried at the bottom of a fact
                panel this was the least findable thing on a page whose subject
                publishes it on every page of its own site. */}
            {website ? (
              <a className="company-site" href={website} rel="nofollow noopener noreferrer" target="_blank">
                <span className="company-site-label">
                  {copy(profile.siteLabel, built.siteLabel)}
                </span>
                <span className="company-site-url">{siteLabel(website)}</span>
                <Icon className="ic" name="external" size={14} />
              </a>
            ) : null}

            {/* `hasRichText`, not truthiness: a field somebody clicked into and
                left comes back as a root holding one empty paragraph, which
                renders as a blank measure-width gap above the catalogue. */}
            {hasRichText(company.body) ? (
              <div className="prose">
                <RichText data={company.body} />
              </div>
            ) : null}

            {links.length > 0 ? (
              <section className="section">
                <div className="section-head">
                  <h2>{copy(profile.gamesHeading, built.gamesHeading)}</h2>
                </div>
                <div className="grid">
                  {links.map(({ game, href }) => (
                    /*
                      A plain anchor, not `next/link`: every wiki is its own
                      origin, so there is no client-side navigation to be had
                      and a prefetch would only fail quietly.
                    */
                    <a key={game.id} className="card entity-card" href={href}>
                      <span>
                        <h3>{game.shortTitle || game.title}</h3>
                        {game.summary ? <p className="note">{game.summary}</p> : null}
                      </span>
                    </a>
                  ))}
                </div>
              </section>
            ) : null}

            {/*
              The catalogue, which is the reason this host exists. The section
              renders even when it is empty: "nobody has read a store listing
              for this company" and "this company has released nothing" look
              identical as a missing section, and only the first one is true.
            */}
            <section className="section">
              <div className="section-head">
                <h2>{copy(profile.catalogueHeading, built.catalogueHeading)}</h2>
                {/* `.eyebrow` is what every other section head on the network puts a count
                    in; a class of its own here would be a second thing to keep in step. */}
                {rows.length > 0 ? <span className="eyebrow">{rows.length}</span> : null}
              </div>
              {rows.length > 0 ? (
                <>
                  <CompanyTitles
                    rows={rows}
                    coveredLabel={copy(profile.catalogueCovered, built.catalogueCovered)}
                  />
                  {/* The record's own note carries the storefront and the date
                      it was read; the editable one carries what is true of
                      every catalogue on the host. A price without a date is a
                      claim this site cannot stand behind. */}
                  {company.catalogueNote ? <p className="note">{company.catalogueNote}</p> : null}
                  <p className="note">
                    {copy(profile.cataloguePriceNote, built.cataloguePriceNote)}
                  </p>
                </>
              ) : (
                <p className="note">{copy(profile.catalogueEmpty, built.catalogueEmpty)}</p>
              )}
            </section>

            {company.keyPeople ? (
              <section className="section">
                <div className="section-head">
                  <h2>{copy(profile.peopleHeading, built.peopleHeading)}</h2>
                </div>
                {/*
                  One entry per name the infobox printed, linked where this
                  network has a record for them. A plain `<a>`, not
                  `next/link`: `people.<domain>` is a sibling origin, so there
                  is no client-side navigation to be had and a prefetch would
                  only fail quietly.
                */}
                <ul className="officer-list">
                  {officerList.map((entry, index) => (
                    <li key={`${entry.text}-${index}`}>
                      {entry.slug ? (
                        <a href={personUrl(`/${entry.slug}`)}>{entry.name}</a>
                      ) : (
                        /* No record for them, or a fragment the split rules
                           refuse on purpose. It still prints: a name we cannot
                           link is still a name the source stated. */
                        entry.name ?? entry.text
                      )}
                      {entry.role ? <span className="note"> — {entry.role}</span> : null}
                    </li>
                  ))}
                </ul>
                {/*
                  Blank by default and kept wired anyway. The owner is writing
                  the provenance wording themselves; deleting the call site
                  would leave a box in the admin that changes nothing on the
                  page, which is the control that reads as present and does not
                  work.
                */}
                {sourcingNote ? <p className="note">{sourcingNote}</p> : null}
              </section>
            ) : null}

            {parent || subsidiaries.length > 0 ? (
              <section className="section">
                <div className="section-head">
                  {/*
                    Parent and subsidiaries share one section, and the schema has
                    a heading for each, so the heading follows whichever relation
                    this company actually has. Both ship as "Corporate
                    structure", so nothing on any page moves until somebody edits
                    one. Leaving either unwired was the other option, and a box
                    in the admin that changes nothing is the control that reads
                    as present and does not work.
                  */}
                  <h2>
                    {parent
                      ? copy(profile.parentHeading, built.parentHeading)
                      : copy(profile.subsidiariesHeading, built.subsidiariesHeading)}
                  </h2>
                </div>
                {parent ? (
                  <p>
                    Owned by <Link href={`/${parent.slug}`}>{parent.name}</Link>.
                  </p>
                ) : null}
                {subsidiaries.length > 0 ? (
                  <>
                    <p>{subsidiaries.length === 1 ? 'It owns:' : `It owns ${subsidiaries.length}:`}</p>
                    <ul className="company-tree">
                      {subsidiaries.map((child) => (
                        <li key={child.id}>
                          <Link href={`/${child.slug}`}>{child.name}</Link>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
                <p className="note">{copy(profile.structureNote, built.structureNote)}</p>
              </section>
            ) : null}

            <Sources sources={company.sources} />
          </div>

          <div className="stack">
            <FactPanel title={company.name} facts={facts} />
            {games.length > 0 ||
            rows.length > 0 ||
            company.basis !== 'related-company' ||
            company.founded ? null : (
              <section className="panel">
                <div className="panel-head">
                  <h2>{copy(profile.knownHeading, built.knownHeading)}</h2>
                </div>
                <p className="note">{copy(profile.knownNote, built.knownNote)}</p>
              </section>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { Badge, Confidence } from '@/components/Badges'
import { FactPanel } from '@/components/FactPanel'
import { RichText } from '@/components/RichText'
import { Sources } from '@/components/Sources'
import { client, gameUrl } from '@/lib/payload'
import { copy } from '@/lib/copy'
import { COMPANIES_BUILT_IN, getCompaniesSite } from '@/lib/companies-copy'
import { clamp } from '@/lib/seo'
import type { Company, Game } from '@/payload-types'

type Props = { params: Promise<{ slug: string }> }

// Duplicated in `companies/page.tsx`; both belong in the central label registry
// (`src/lib/ui-registry.ts`) so a role is worded once for the network.
const ROLE_LABEL: Record<string, string> = {
  developer: 'Developer',
  publisher: 'Publisher',
}

const rel = (value: unknown): Game | null =>
  value && typeof value === 'object' ? (value as Game) : null

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
  const { docs } = await payload.find({ collection: 'companies', limit: 500, depth: 0 })
  return docs.map((company) => ({ slug: String(company.slug) }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const company = await find(slug)
  if (!company) return {}

  const roles = (company.role ?? []).map((role) => ROLE_LABEL[role] ?? role).join(' and ')
  return {
    title: company.seo?.title || `${company.name} — ${roles.toLowerCase() || 'company'}`,
    description: company.seo?.description || clamp(company.summary ?? ''),
    alternates: { canonical: `/${company.slug}` },
  }
}

export default async function CompanyPage({ params }: Props) {
  const { slug } = await params
  const [company, site] = await Promise.all([find(slug), getCompaniesSite()])
  if (!company) notFound()
  const profile = site.profile ?? {}

  const games = (company.games ?? []).map(rel).filter(Boolean) as Game[]
  const links = await Promise.all(
    games.map(async (game) => ({ game, href: await gameUrl(game) })),
  )

  const logo =
    company.logo && typeof company.logo === 'object'
      ? (company.logo as { url?: string | null })
      : null
  const parent = company.parent && typeof company.parent === 'object' ? (company.parent as Company) : null
  const subsidiaries = ((company.subsidiaries ?? []) as unknown[])
    .filter((value): value is Company => Boolean(value) && typeof value === 'object')

  /*
    Only what the record actually has. Every one of these is dropped when the
    company's own article does not state it, rather than printed as "unknown"
    — the same rule the game records follow.
  */
  const facts = [
    { label: 'Role', value: (company.role ?? []).map((r) => ROLE_LABEL[r] ?? r).join(', ') },
    ...(company.founded ? [{ label: 'Founded', value: company.founded }] : []),
    ...(company.headquarters ? [{ label: 'Headquarters', value: company.headquarters }] : []),
    ...(company.country ? [{ label: 'Country', value: company.country }] : []),
    ...(company.employees ? [{ label: 'Employees', value: company.employees }] : []),
    ...(company.revenue ? [{ label: 'Revenue', value: company.revenue }] : []),
    ...(company.industry ? [{ label: 'Industry', value: company.industry }] : []),
    ...(games.length > 0 ? [{ label: 'Games covered here', value: games.length }] : []),
  ]

  return (
    <>
      <PageHeader
        eyebrow="Company"
        crumbs={[{ label: 'Companies', href: '/' }, { label: company.name }]}
        icon="person"
        title={company.name}
        lede={company.summary}
        badges={<Confidence level={company.confidence} />}
      />
      <div className="page body-main">
        <div className="split">
          <div className="stack">
            {logo?.url ? (
              <figure className="company-logo">
                <img src={logo.url} alt={`${company.name} logo`} loading="lazy" />
              </figure>
            ) : null}

            {company.body ? (
              <div className="prose">
                <RichText data={company.body} />
              </div>
            ) : null}

            {links.length > 0 ? (
              <section className="section">
                <div className="section-head">
                  <h2>{copy(profile.gamesHeading, COMPANIES_BUILT_IN.profile.gamesHeading)}</h2>
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

            {company.keyPeople ? (
              <section className="section">
                <div className="section-head">
                  <h2>{copy(profile.peopleHeading, COMPANIES_BUILT_IN.profile.peopleHeading)}</h2>
                </div>
                <p>{company.keyPeople}</p>
                {/*
                  People change job far more often than this page is rebuilt,
                  so the date the figure was read is part of the figure. The
                  citation below carries it.
                */}
                <p className="note">
                  {copy(profile.sourcingNote, COMPANIES_BUILT_IN.profile.sourcingNote)}
                </p>
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
                      ? copy(profile.parentHeading, COMPANIES_BUILT_IN.profile.parentHeading)
                      : copy(
                          profile.subsidiariesHeading,
                          COMPANIES_BUILT_IN.profile.subsidiariesHeading,
                        )}
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
                <p className="note">
                  {copy(profile.structureNote, COMPANIES_BUILT_IN.profile.structureNote)}
                </p>
              </section>
            ) : null}

            {company.website ? (
              <p className="note">
                <a href={company.website} rel="nofollow noopener noreferrer" target="_blank">
                  {company.name}’s own site
                </a>
              </p>
            ) : null}

            <Sources sources={company.sources} />
          </div>

          <div className="stack">
            <FactPanel title={company.name} facts={facts} />
            {games.length > 0 || company.basis !== 'related-company' || company.founded ? null : (
              <section className="panel">
                <div className="panel-head">
                  <h2>{copy(profile.knownHeading, COMPANIES_BUILT_IN.profile.knownHeading)}</h2>
                </div>
                <p className="note">
                  {copy(profile.knownNote, COMPANIES_BUILT_IN.profile.knownNote)}
                </p>
              </section>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

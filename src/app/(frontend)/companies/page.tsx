import type { Metadata } from 'next'
import { PageHeader } from '@/components/PageHeader'
import { EntityCard } from '@/components/EntityCard'
import { Badge, Confidence } from '@/components/Badges'
import { client } from '@/lib/payload'
import { hub } from '@/lib/urls'
import type { Company, Game } from '@/payload-types'

export const metadata: Metadata = {
  title: { absolute: 'Studios and publishers' },
  description:
    'Every developer and publisher behind the games this network covers, with which of their games are here and where each claim comes from.',
  alternates: { canonical: '/' },
}

const ROLE_LABEL: Record<string, string> = {
  developer: 'Developer',
  publisher: 'Publisher',
}

const rel = (value: unknown): Game | null =>
  value && typeof value === 'object' ? (value as Game) : null

const logoOf = (company: Company): { url?: string | null; alt?: string | null } | null =>
  company.logo && typeof company.logo === 'object'
    ? (company.logo as { url?: string | null; alt?: string | null })
    : null

export default async function CompaniesIndex() {
  const payload = await client()
  const { docs } = await payload.find({
    collection: 'companies',
    limit: 500,
    depth: 1,
    sort: 'name',
  })
  const companies = docs as Company[]

  /*
    Companies whose games we cover first, then the rest. A reader arriving
    here wants Capcom and The Coalition, not an alphabetical list in which the
    studios with a game on the network are scattered between studios that are
    only named in a franchise wiki's history.
  */
  const withGames = companies.filter((company) => (company.games ?? []).length > 0)
  const rest = companies.filter((company) => (company.games ?? []).length === 0)
  const ranked = rest.filter((company) => company.basis === 'revenue-ranking')
  const catalogued = rest.filter((company) => company.basis === 'gaming-category')
  /*
    Everything else, so nobody falls through. The first version grouped on
    three bases and there were four, which quietly hid a hundred and
    ninety-nine companies that were in the database and on the sitemap but on
    no page a reader could reach.
  */
  const mentioned = rest.filter(
    (company) => !['revenue-ranking', 'gaming-category'].includes(String(company.basis)),
  )

  return (
    <>
      <PageHeader
        eyebrow="Network"
        crumbs={[{ label: 'Companies' }]}
        icon="person"
        title="Studios and publishers"
        lede={`${companies.length} companies: the largest in games by published revenue, the studios behind the games this network covers, and everything those two name as a parent or a subsidiary. Every figure on a profile comes from that company's own article, with the date it was read.`}
      />
      <div className="page body-main">
        <section className="section">
          <div className="section-head">
            <h2>Behind a game we cover</h2>
          </div>
          <div className="grid">
            {withGames.map((company) => {
              const games = (company.games ?? []).map(rel).filter(Boolean) as Game[]
              return (
                <EntityCard
                  key={company.id}
                  href={`/${company.slug}`}
                  title={company.name}
                  summary={company.summary}
                  image={logoOf(company)}
                  thumbFit="contain"
                  badges={
                    <>
                      {(company.role ?? []).map((role) => (
                        <Badge key={role}>{ROLE_LABEL[role] ?? role}</Badge>
                      ))}
                      {games.length > 0 ? <Badge>{games.length} here</Badge> : null}
                    </>
                  }
                />
              )
            })}
          </div>
        </section>

        {ranked.length > 0 ? (
          <section className="section">
            <div className="section-head">
              <h2>The largest in games</h2>
            </div>
            <p className="note">
              Ranked by published revenue. <strong>Popularity is not a measurable quantity</strong>,
              so this is the ranking somebody actually publishes rather than one we invented — and
              it means revenue, on the date the list was read.
            </p>
            <div className="grid">
              {ranked.map((company) => (
                <EntityCard
                  key={company.id}
                  href={`/${company.slug}`}
                  title={company.name}
                  summary={company.summary}
                  image={logoOf(company)}
                  thumbFit="contain"
                  badges={
                    <>
                      {(company.role ?? []).map((role) => (
                        <Badge key={role}>{ROLE_LABEL[role] ?? role}</Badge>
                      ))}
                    </>
                  }
                />
              ))}
            </div>
          </section>
        ) : null}

        {catalogued.length > 0 ? (
          <section className="section">
            <div className="section-head">
              <h2>Developers and publishers</h2>
            </div>
            <p className="note">
              Every company Wikipedia files under video game development or publishing, which is a
              claim somebody else maintains rather than a list we drew up.
            </p>
            <div className="grid">
              {catalogued.map((company) => (
                <EntityCard
                  key={company.id}
                  href={`/${company.slug}`}
                  title={company.name}
                  summary={company.summary}
                  image={logoOf(company)}
                  thumbFit="contain"
                  badges={
                    <>
                      {(company.role ?? []).map((role) => (
                        <Badge key={role}>{ROLE_LABEL[role] ?? role}</Badge>
                      ))}
                    </>
                  }
                />
              ))}
            </div>
          </section>
        ) : null}

        {mentioned.length > 0 ? (
          <section className="section">
            <div className="section-head">
              <h2>Named by another company</h2>
            </div>
            <p className="note">
              These are here because a company above names them as a parent or a subsidiary in its
              own article. Nobody drew up this list — it is what the corporate graph contains once
              you follow it one step, which is also why it is worth reading.
            </p>
            <div className="grid">
              {mentioned.map((company) => (
                <EntityCard
                  key={company.id}
                  href={`/${company.slug}`}
                  title={company.name}
                  summary={company.summary}
                  image={logoOf(company)}
                  thumbFit="contain"
                  badges={<Confidence level={company.confidence} />}
                />
              ))}
            </div>
          </section>
        ) : null}

        <div className="callout">
          <h3>Why these have their own site</h3>
          <p>
            A studio turns up on more than one wiki, and a company page that exists once carries its
            whole body of work instead of being three thin copies that disagree the first time one
            is corrected. It is the same reason{' '}
            <a href={hub('/authors')}>contributors</a> live on the hub rather than on each wiki.
          </p>
        </div>
      </div>
    </>
  )
}

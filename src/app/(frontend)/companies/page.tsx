import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'
import { EntityCard } from '@/components/EntityCard'
import { Badge, Confidence } from '@/components/Badges'
import { client } from '@/lib/payload'
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
  const mentioned = companies.filter((company) => (company.games ?? []).length === 0)

  return (
    <>
      <PageHeader
        eyebrow="Network"
        crumbs={[{ label: 'Companies' }]}
        icon="person"
        title="Studios and publishers"
        lede={`${companies.length} companies. ${withGames.length} of them made or published a game covered on this network; the rest are named in the sources we compiled and are here so the name resolves to something.`}
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

        {mentioned.length > 0 ? (
          <section className="section">
            <div className="section-head">
              <h2>Named in the sources</h2>
            </div>
            <p className="note">
              These appear in the community wikis compiled for a game here, usually because they
              worked on an earlier title in the same series. What each one did, and when, is not
              established on this network — so these pages say only where the name was found.
            </p>
            <div className="grid">
              {mentioned.map((company) => (
                <EntityCard
                  key={company.id}
                  href={`/${company.slug}`}
                  title={company.name}
                  summary={company.summary}
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
            <Link href="/">contributors</Link> live on the hub rather than on each wiki.
          </p>
        </div>
      </div>
    </>
  )
}

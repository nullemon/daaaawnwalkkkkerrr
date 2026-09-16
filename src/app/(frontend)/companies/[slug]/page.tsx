import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { Badge, Confidence } from '@/components/Badges'
import { EntityImage } from '@/components/EntityImage'
import { FactPanel } from '@/components/FactPanel'
import { RichText } from '@/components/RichText'
import { Sources } from '@/components/Sources'
import { client, gameUrl } from '@/lib/payload'
import { clamp } from '@/lib/seo'
import type { Company, Game } from '@/payload-types'

type Props = { params: Promise<{ slug: string }> }

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
  const company = await find(slug)
  if (!company) notFound()

  const games = (company.games ?? []).map(rel).filter(Boolean) as Game[]
  const links = await Promise.all(
    games.map(async (game) => ({ game, href: await gameUrl(game) })),
  )

  const facts = [
    { label: 'Role', value: (company.role ?? []).map((r) => ROLE_LABEL[r] ?? r).join(', ') },
    ...(company.founded ? [{ label: 'Founded', value: company.founded }] : []),
    ...(company.country ? [{ label: 'Based in', value: company.country }] : []),
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
            <EntityImage media={company.logo} shape="wide" />

            {company.body ? (
              <div className="prose">
                <RichText data={company.body} />
              </div>
            ) : null}

            {links.length > 0 ? (
              <section className="section">
                <div className="section-head">
                  <h2>Their games on this network</h2>
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
            {games.length > 0 ? null : (
              <section className="panel">
                <div className="panel-head">
                  <h2>What we know</h2>
                </div>
                <p className="note">
                  This name appears in the community-wiki sources compiled for a game on this
                  network. We have not established what it worked on or when, and would rather say
                  so than fill the gap with a guess.
                </p>
              </section>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

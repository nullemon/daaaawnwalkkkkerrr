import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { Badge, Confidence } from '@/components/Badges'
import { Facts } from '@/components/Facts'
import { RichText } from '@/components/RichText'
import { Sources } from '@/components/Sources'
import { AdSlot } from '@/components/AdSlot'
import { getAll, getBySlug, rel, relMany } from '@/lib/payload'
import type { Build, Item, Perk, SkillTree } from '@/payload-types'

type Props = { params: Promise<{ slug: string }> }

export async function generateStaticParams() {
  const docs = await getAll<Build>('builds', { depth: 0 })
  return docs.map((doc) => ({ slug: doc.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const doc = await getBySlug<Build>('builds', slug, 0)
  if (!doc) return {}
  return {
    title: doc.seo?.title || `${doc.title} build — perks, gear and how it plays`,
    description: doc.seo?.description || doc.summary,
    alternates: { canonical: `/builds/${doc.slug}` },
  }
}

export default async function BuildPage({ params }: Props) {
  const { slug } = await params
  const doc = await getBySlug<Build>('builds', slug, 2)
  if (!doc) notFound()

  const tree = rel<SkillTree>(doc.primaryTree)
  const perks = relMany<Perk>(doc.perks)
  const items = relMany<Item>(doc.items)
  const planner = perks.length
    ? `/tools/build-planner?perks=${perks.map((perk) => perk.slug).join(',')}`
    : '/tools/build-planner'

  return (
    <>
      <PageHeader
        eyebrow="Build"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Builds', href: '/builds' }, { label: doc.title }]}
        title={doc.title}
        lede={doc.summary}
        badges={
          <>
            <Badge>{doc.playstyle}</Badge>
            {doc.difficulty ? <Badge>{doc.difficulty}</Badge> : null}
            <Confidence level={doc.confidence} />
          </>
        }
      />
      <div className="page body-main">
        <Facts
          items={[
            { label: 'Plays in', value: doc.playstyle },
            { label: 'Primary tree', value: tree ? tree.title : '—' },
            { label: 'Perks', value: perks.length || '—' },
            { label: 'Segment cost', value: doc.segmentCost ?? 'Not confirmed' },
          ]}
        />

        <RichText data={doc.body} />

        {perks.length > 0 ? (
          <section className="section">
            <div className="section-head">
              <h2>Perks</h2>
              <Link href={planner} className="eyebrow">
                Open in the planner
              </Link>
            </div>
            <ul className="chain">
              {perks.map((perk) => (
                <li key={perk.id}>
                  <span className="step">{perk.isUltimate ? '★' : '·'}</span>
                  <span>
                    <strong>{perk.title}</strong>
                    {perk.effect ? <span className="sub">{perk.effect}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {items.length > 0 ? (
          <section className="section">
            <div className="section-head">
              <h2>Gear</h2>
            </div>
            <ul className="chain">
              {items.map((item) => (
                <li key={item.id}>
                  <span className="step">·</span>
                  <span>
                    <Link href={`/items/${item.slug}`}>{item.title}</Link>
                    {item.howToGet ? <span className="sub">{item.howToGet}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <AdSlot />
        <Sources sources={doc.sources} />
      </div>
    </>
  )
}

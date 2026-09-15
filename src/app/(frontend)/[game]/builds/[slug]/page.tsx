import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { Badge, Confidence } from '@/components/Badges'
import { Facts } from '@/components/Facts'
import { RichText } from '@/components/RichText'
import { Sources } from '@/components/Sources'
import { CommentThread } from '@/components/CommentThread'
import { AdSlot } from '@/components/AdSlot'
import { EntityImage } from '@/components/EntityImage'
import { getBySlug, rel, relMany } from '@/lib/payload'
import { gameSlugParams } from '@/lib/params'
import type { Build, Item, Perk, SkillTree } from '@/payload-types'
import { buildMeta } from '@/lib/seo'

type Props = { params: Promise<{ game: string; slug: string }> }

export const generateStaticParams = () => gameSlugParams('builds')

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { game, slug } = await params
  const doc = await getBySlug('builds', slug, { game, depth: 1 })
  if (!doc) return {}
  const meta = buildMeta(doc)
  return {
    // Composed from the record's own fields unless an editor has written one.
    title: doc.seo?.title || meta.title,
    description: doc.seo?.description || meta.description,
    alternates: { canonical: `/builds/${doc.slug}` },
  }
}

export default async function BuildPage({ params }: Props) {
  const { game, slug } = await params
  const doc = await getBySlug('builds', slug, { game, depth: 2 })
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
        <EntityImage media={doc.image} shape="wide" />

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
        <CommentThread game={game} path={`/builds/${slug}`} />
      </div>
    </>
  )
}

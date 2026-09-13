import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { Badge, Confidence } from '@/components/Badges'
import { RichText } from '@/components/RichText'
import { Sources } from '@/components/Sources'
import { EntityImage } from '@/components/EntityImage'
import { getAll, getBySlug } from '@/lib/payload'
import type { Item } from '@/payload-types'

type Props = { params: Promise<{ slug: string }> }

export async function generateStaticParams() {
  const docs = await getAll<Item>('items', { depth: 0 })
  return docs.map((doc) => ({ slug: doc.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const doc = await getBySlug<Item>('items', slug, 0)
  if (!doc) return {}
  return {
    title: doc.seo?.title || `${doc.title} — location and stats`,
    description: doc.seo?.description || doc.summary,
    alternates: { canonical: `/items/${doc.slug}` },
  }
}

export default async function ItemPage({ params }: Props) {
  const { slug } = await params
  const doc = await getBySlug<Item>('items', slug, 1)
  if (!doc) notFound()

  return (
    <>
      <PageHeader
        eyebrow="Item"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Items', href: '/items' }, { label: doc.title }]}
        title={doc.title}
        lede={doc.summary}
        badges={
          <>
            <Badge>{doc.category}</Badge>
            {doc.rarity ? <Badge>{doc.rarity}</Badge> : null}
            <Confidence level={doc.confidence} />
          </>
        }
      />
      <div className="page body-main">
        <EntityImage media={doc.image} shape="square" />

        {doc.howToGet ? (
          <div className="callout">
            <h3>Where to find it</h3>
            <p>{doc.howToGet}</p>
          </div>
        ) : null}
        {doc.stats?.length ? (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Stat</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {doc.stats.map((stat) => (
                  <tr key={stat.id ?? stat.label}>
                    <td>{stat.label}</td>
                    <td className="num">{stat.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <RichText data={doc.body} />
        <Sources sources={doc.sources} />
      </div>
    </>
  )
}

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { Badge, Confidence, PhaseBadge } from '@/components/Badges'
import { RichText } from '@/components/RichText'
import { Sources } from '@/components/Sources'
import { getAll, getBySlug, rel } from '@/lib/payload'
import type { Enemy, Region } from '@/payload-types'

type Props = { params: Promise<{ slug: string }> }

export async function generateStaticParams() {
  const docs = await getAll<Enemy>('enemies', { depth: 0 })
  return docs.map((doc) => ({ slug: doc.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const doc = await getBySlug<Enemy>('enemies', slug, 0)
  if (!doc) return {}
  return {
    title: doc.seo?.title || `${doc.title} — weaknesses and how to fight it`,
    description: doc.seo?.description || doc.summary,
    alternates: { canonical: `/enemies/${doc.slug}` },
  }
}

export default async function EnemyPage({ params }: Props) {
  const { slug } = await params
  const doc = await getBySlug<Enemy>('enemies', slug, 1)
  if (!doc) notFound()
  const region = rel<Region>(doc.region)

  return (
    <>
      <PageHeader
        eyebrow={doc.isBoss ? 'Boss' : 'Enemy'}
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Enemies', href: '/enemies' }, { label: doc.title }]}
        title={doc.title}
        lede={doc.summary}
        badges={
          <>
            {doc.isBoss ? <Badge>Boss</Badge> : null}
            <PhaseBadge phase={doc.phase} />
            <Confidence level={doc.confidence} />
          </>
        }
      />
      <div className="page body-main">
        {doc.weaknesses?.length ? (
          <div className="callout">
            <h3>Weak to</h3>
            <p>{doc.weaknesses.map((w) => w.value).join(', ')}</p>
          </div>
        ) : null}
        <RichText data={doc.body} />
        {region ? (
          <p className="note">
            Found in <Link href={`/regions/${region.slug}`}>{region.title}</Link>.
          </p>
        ) : null}
        <Sources sources={doc.sources} />
      </div>
    </>
  )
}

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { Confidence } from '@/components/Badges'
import { RichText } from '@/components/RichText'
import { Sources } from '@/components/Sources'
import { getAll, getBySlug } from '@/lib/payload'
import type { Quest, Region } from '@/payload-types'

type Props = { params: Promise<{ slug: string }> }

export async function generateStaticParams() {
  const docs = await getAll<Region>('regions', { depth: 0 })
  return docs.map((doc) => ({ slug: doc.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const doc = await getBySlug<Region>('regions', slug, 0)
  if (!doc) return {}
  return {
    title: doc.seo?.title || `${doc.title} — quests, locations and what is there`,
    description: doc.seo?.description || doc.summary,
    alternates: { canonical: `/regions/${doc.slug}` },
  }
}

export default async function RegionPage({ params }: Props) {
  const { slug } = await params
  const doc = await getBySlug<Region>('regions', slug, 1)
  if (!doc) notFound()

  const quests = (await getAll<Quest>('quests', { depth: 1 })).filter(
    (quest) => typeof quest.region === 'object' && quest.region?.slug === slug,
  )

  return (
    <>
      <PageHeader
        eyebrow="Region"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Regions', href: '/regions' }, { label: doc.title }]}
        title={doc.title}
        lede={doc.summary}
        badges={<Confidence level={doc.confidence} />}
      />
      <div className="page body-main">
        <RichText data={doc.body} />
        {quests.length > 0 ? (
          <section className="section">
            <div className="section-head">
              <h2>Quests here</h2>
              <span className="eyebrow">{quests.length}</span>
            </div>
            <ul className="chain">
              {quests.map((quest) => (
                <li key={quest.id}>
                  <span className="step">·</span>
                  <span>
                    <Link href={`/quests/${quest.slug}`}>{quest.title}</Link>
                    {quest.summary ? <span className="sub">{quest.summary}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <Sources sources={doc.sources} />
      </div>
    </>
  )
}

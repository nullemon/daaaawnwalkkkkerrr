import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { Confidence } from '@/components/Badges'
import { RichText } from '@/components/RichText'
import { Sources } from '@/components/Sources'
import { getAll, getBySlug } from '@/lib/payload'
import type { Guide } from '@/payload-types'

type Props = { params: Promise<{ slug: string }> }

export async function generateStaticParams() {
  const docs = await getAll<Guide>('guides', { depth: 0 })
  return docs.map((doc) => ({ slug: doc.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const doc = await getBySlug<Guide>('guides', slug, 0)
  if (!doc) return {}
  return {
    title: doc.seo?.title || doc.title,
    description: doc.seo?.description || doc.summary,
    alternates: { canonical: `/guides/${doc.slug}` },
  }
}

export default async function GuidePage({ params }: Props) {
  const { slug } = await params
  const doc = await getBySlug<Guide>('guides', slug, 1)
  if (!doc) notFound()

  return (
    <>
      <PageHeader
        eyebrow="Guide"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Guides', href: '/guides' }, { label: doc.title }]}
        title={doc.title}
        lede={doc.summary}
        badges={<Confidence level={doc.confidence} />}
      />
      <div className="page body-main">
        <RichText data={doc.body} />
        <Sources sources={doc.sources} />
      </div>
    </>
  )
}

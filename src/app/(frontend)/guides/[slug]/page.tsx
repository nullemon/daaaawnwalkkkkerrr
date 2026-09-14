import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { Confidence } from '@/components/Badges'
import { RichText } from '@/components/RichText'
import { Sources } from '@/components/Sources'
import { Byline } from '@/components/Byline'
import { getAll, getBySlug } from '@/lib/payload'
import { JsonLd } from '@/components/JsonLd'
import type { Author, Guide } from '@/payload-types'

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

  const person = doc.author && typeof doc.author === 'object' ? (doc.author as Author) : null

  /*
    Article markup, so the byline and the date are readable by something other
    than a person squinting at the page.

    A placeholder author is deliberately left out of it. Publishing an invented
    name as a structured `author` is a claim to a machine as much as to a
    reader, and the point of the provisional flag is that we do not make it
    until somebody real is behind the page.
  */
  const articleLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: doc.seo?.title || doc.title,
    description: doc.seo?.description || doc.summary,
    ...(doc.updated ? { dateModified: new Date(doc.updated).toISOString() } : {}),
    ...(person && !person.provisional
      ? { author: { '@type': 'Person', name: person.name, url: `/authors/${person.slug}` } }
      : {}),
  }

  return (
    <>
      <JsonLd data={articleLd} />
      <PageHeader
        eyebrow="Guide"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Guides', href: '/guides' }, { label: doc.title }]}
        title={doc.title}
        lede={doc.summary}
        badges={<Confidence level={doc.confidence} />}
      />
      <div className="page body-main">
        <Byline author={doc.author} updated={doc.updated} />
        <div className="prose">
          <RichText data={doc.body} />
        </div>
        <Sources sources={doc.sources} />
      </div>
    </>
  )
}

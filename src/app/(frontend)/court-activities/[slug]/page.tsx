import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { Confidence, PhaseBadge } from '@/components/Badges'
import { Facts } from '@/components/Facts'
import { RichText } from '@/components/RichText'
import { Sources } from '@/components/Sources'
import { getAll, getBySlug, rel } from '@/lib/payload'
import type { Court, CourtActivity, Region } from '@/payload-types'

type Props = { params: Promise<{ slug: string }> }

export async function generateStaticParams() {
  const docs = await getAll<CourtActivity>('court-activities', { depth: 0 })
  return docs.map((doc) => ({ slug: doc.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const doc = await getBySlug<CourtActivity>('court-activities', slug, 0)
  if (!doc) return {}
  return {
    title: doc.seo?.title || `${doc.title} — Court Activity walkthrough`,
    description: doc.seo?.description || doc.summary,
    alternates: { canonical: `/court-activities/${doc.slug}` },
  }
}

export default async function CourtActivityPage({ params }: Props) {
  const { slug } = await params
  const doc = await getBySlug<CourtActivity>('court-activities', slug, 2)
  if (!doc) notFound()
  const court = rel<Court>(doc.court)
  const region = rel<Region>(doc.region)
  // Read the flag, not the number: a confirmed zero-cost activity is a real
  // thing and must not read as unresearched.
  const known = Boolean(doc.time?.known)

  return (
    <>
      <PageHeader
        eyebrow="Court Activity"
        crumbs={[
          { label: 'Home', href: '/' },
          { label: 'Court', href: '/court' },
          ...(court ? [{ label: court.title, href: `/court/${court.slug}` }] : []),
          { label: doc.title },
        ]}
        title={doc.title}
        lede={doc.summary}
        badges={
          <>
            <PhaseBadge phase={doc.phase} />
            <Confidence level={doc.confidence} />
          </>
        }
      />
      <div className="page body-main">
        <Facts
          items={[
            { label: 'Court', value: court ? court.title : '—' },
            { label: 'Region', value: region ? region.title : '—' },
            { label: 'Time cost', value: known ? `${doc.time?.max} segments` : 'Not confirmed' },
            { label: 'Anger value', value: doc.angerValue ?? 'Not confirmed' },
          ]}
        />
        {doc.howToStart ? (
          <div className="callout">
            <h3>How to start it</h3>
            <p>{doc.howToStart}</p>
          </div>
        ) : null}
        <RichText data={doc.body} />
        {court ? (
          <p className="note">
            Part of <Link href={`/court/${court.slug}`}>{court.title}&rsquo;s court</Link>.
          </p>
        ) : null}
        <Sources sources={doc.sources} />
      </div>
    </>
  )
}

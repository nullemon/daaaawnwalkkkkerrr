import type { Metadata } from 'next'
import { SectionNeighbours } from '@/components/SectionNeighbours'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { Confidence, PhaseBadge } from '@/components/Badges'
import { Facts } from '@/components/Facts'
import { RichText } from '@/components/RichText'
import { Sources } from '@/components/Sources'
import { Attribution } from '@/components/Attribution'
import { CommentThread } from '@/components/CommentThread'
import { getBySlug, getGame, rel } from '@/lib/payload'
import { gameName } from '@/lib/section-copy'
import { gameSlugParams } from '@/lib/params'
import type { Court, Region } from '@/payload-types'
import { activityMeta } from '@/lib/seo'

type Props = { params: Promise<{ game: string; slug: string }> }

export const generateStaticParams = () => gameSlugParams('court-activities')

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { game, slug } = await params
  const doc = await getBySlug('court-activities', slug, { game, depth: 1 })
  if (!doc) return {}
  const meta = activityMeta(doc, gameName(await getGame(game)))
  return {
    // Composed from the record's own fields unless an editor has written one.
    title: doc.seo?.title || meta.title,
    description: doc.seo?.description || meta.description,
    alternates: { canonical: `/court-activities/${doc.slug}` },
  }
}

export default async function CourtActivityPage({ params }: Props) {
  const { game, slug } = await params
  const doc = await getBySlug('court-activities', slug, { game, depth: 2 })
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
            <h2>How to start it</h2>
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
        <Attribution sources={doc.sources} />
        <SectionNeighbours
          collection="court-activities"
          game={game}
          slug={slug}
          label="Court Activities"
        />
        <CommentThread game={game} path={`/court-activities/${slug}`} />
      </div>
    </>
  )
}

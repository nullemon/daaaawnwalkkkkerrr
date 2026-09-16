import type { Metadata } from 'next'
import { SectionNeighbours } from '@/components/SectionNeighbours'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { Confidence } from '@/components/Badges'
import { RichText } from '@/components/RichText'
import { Sources } from '@/components/Sources'
import { Attribution } from '@/components/Attribution'
import { CommentThread } from '@/components/CommentThread'
import { FactPanel } from '@/components/FactPanel'
import { RelatedList } from '@/components/RelatedList'
import { EntityImage } from '@/components/EntityImage'
import Link from 'next/link'
import { Callout } from '@/components/Callout'
import { getAll, getBySlug, getGame } from '@/lib/payload'
import { gameName } from '@/lib/section-copy'
import { gameSlugParams } from '@/lib/params'
import type { Court } from '@/payload-types'
import { clamp, courtMeta } from '@/lib/seo'

type Props = { params: Promise<{ game: string; slug: string }> }

export const generateStaticParams = () => gameSlugParams('courts')

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { game, slug } = await params
  const doc = await getBySlug('courts', slug, { game, depth: 1 })
  if (!doc) return {}
  const meta = courtMeta(doc, gameName(await getGame(game)))
  return {
    // Composed from the record's own fields unless an editor has written one.
    title: doc.seo?.title || meta.title,
    description: clamp(doc.seo?.description || meta.description || ''),
    alternates: { canonical: `/court/${doc.slug}` },
    /*
      The admin's own "Hide this page from search engines" box.
      `seoGroup()` puts it on every content collection and only the
      quest page read it, so ticking it anywhere else did nothing at
      all — a control that is present, reachable and inert.
    */
    robots: doc.seo?.noindex ? { index: false, follow: true } : undefined,
  }
}

export default async function CourtPage({ params }: Props) {
  const { game, slug } = await params
  const [wiki, doc] = await Promise.all([
    getGame(game),
    getBySlug('courts', slug, { game, depth: 1 }),
  ])
  if (!doc) notFound()
  const activities = (await getAll('court-activities', { game, depth: 1 })).filter(
    (activity) => typeof activity.court === 'object' && activity.court?.slug === slug,
  )
  const needed = doc.activityCount && doc.angerThresholdPct
    ? Math.ceil((doc.activityCount * doc.angerThresholdPct) / 100)
    : null

  return (
    <>
      <PageHeader
        eyebrow="Court"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Court', href: '/court' }, { label: doc.title }]}
        title={doc.title}
        lede={doc.summary}
        badges={<Confidence level={doc.confidence} />}
      />
      <div className="page body-main">
        <div className="split">
          <div className="stack">
            <EntityImage media={doc.image} shape="wide" />
            <div className="prose">
              <RichText data={doc.body} />
            </div>
          </div>
          <div className="stack">
            <FactPanel
              facts={[
                { label: 'Court Activities', value: doc.activityCount ?? undefined },
                {
                  label: 'Reported threshold',
                  value: doc.angerThresholdPct ? `~${doc.angerThresholdPct}%` : undefined,
                },
                {
                  label: 'Roughly enough',
                  value: needed ? `${needed} of ${doc.activityCount}` : undefined,
                },
                { label: 'Documented here', value: activities.length || undefined },
              ]}
            />
            <Callout
              game={wiki}
              where="courts-detail"
              heading="You do not need all of them"
              builtIn={(wiki?.features ?? []).includes('run-checker')}
            >
              <p>
                The duel unlocks at roughly three quarters of a vassal&rsquo;s activities, so the
                gap between that and clearing the lot is the largest saving available to a tight
                run. <Link href="/tools/run-checker">See what your run can still afford</Link>.
              </p>
            </Callout>
          </div>
        </div>

        {activities.length > 0 ? (
          <RelatedList
            heading="Court Activities"
            icon="crown"
            items={activities.map((activity) => ({
              id: activity.id,
              title: activity.title,
              href: `/court-activities/${activity.slug}`,
              sub: activity.summary,
            }))}
            href="/court-activities"
            note={`${activities.length} of ${doc.activityCount ?? '?'} documented.`}
          />
        ) : (
          <div className="callout">
            <h2>Activities not yet catalogued</h2>
            <p>
              We have not documented this court&rsquo;s {doc.activityCount ?? ''} activities
              individually yet. They are the next thing being added.
            </p>
          </div>
        )}
        <Sources sources={doc.sources} />
        <Attribution sources={doc.sources} />
        <SectionNeighbours
          collection="courts"
          game={game}
          slug={slug}
          label="courts"
        />
        <CommentThread game={game} path={`/court/${slug}`} />
      </div>
    </>
  )
}

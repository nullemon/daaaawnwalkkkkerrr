import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { Confidence } from '@/components/Badges'
import { Facts } from '@/components/Facts'
import { RichText } from '@/components/RichText'
import { Sources } from '@/components/Sources'
import Link from 'next/link'
import { getAll, getBySlug } from '@/lib/payload'
import type { Court, CourtActivity } from '@/payload-types'

type Props = { params: Promise<{ slug: string }> }

export async function generateStaticParams() {
  const docs = await getAll<Court>('courts', { depth: 0 })
  return docs.map((doc) => ({ slug: doc.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const doc = await getBySlug<Court>('courts', slug, 0)
  if (!doc) return {}
  return {
    title: doc.seo?.title || `${doc.title}'s court — activities, duel and how much you need`,
    description: doc.seo?.description || doc.summary,
    alternates: { canonical: `/court/${doc.slug}` },
  }
}

export default async function CourtPage({ params }: Props) {
  const { slug } = await params
  const doc = await getBySlug<Court>('courts', slug, 1)
  if (!doc) notFound()
  const activities = (await getAll<CourtActivity>('court-activities', { depth: 1 })).filter(
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
        <Facts
          items={[
            { label: 'Court Activities', value: doc.activityCount ?? '—' },
            { label: 'Reported threshold', value: doc.angerThresholdPct ? `~${doc.angerThresholdPct}%` : '—' },
            { label: 'Roughly enough', value: needed ? `${needed} of ${doc.activityCount}` : '—' },
          ]}
        />
        <RichText data={doc.body} />
        {activities.length > 0 ? (
          <section className="section">
            <div className="section-head">
              <h2>Court Activities</h2>
              <span className="eyebrow">
                {activities.length} of {doc.activityCount ?? '?'} documented
              </span>
            </div>
            <ul className="chain">
              {activities.map((activity) => (
                <li key={activity.id}>
                  <span className="step">·</span>
                  <span>
                    <Link href={`/court-activities/${activity.slug}`}>{activity.title}</Link>
                    {activity.summary ? <span className="sub">{activity.summary}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <div className="callout">
            <h3>Activities not yet catalogued</h3>
            <p>
              We have not documented this court&rsquo;s {doc.activityCount ?? ''} activities
              individually yet. They are the next thing being added.
            </p>
          </div>
        )}
        <Sources sources={doc.sources} />
      </div>
    </>
  )
}

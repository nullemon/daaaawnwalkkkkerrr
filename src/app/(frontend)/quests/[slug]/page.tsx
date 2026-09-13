import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { Confidence, PhaseBadge } from '@/components/Badges'
import { Facts } from '@/components/Facts'
import { RichText } from '@/components/RichText'
import { Sources } from '@/components/Sources'
import { AdSlot } from '@/components/AdSlot'
import { getAll, getBySlug, relMany, rel } from '@/lib/payload'
import type { Ending, Quest, Region } from '@/payload-types'

type Props = { params: Promise<{ slug: string }> }

export async function generateStaticParams() {
  const quests = await getAll<Quest>('quests', { depth: 0 })
  return quests.map((quest) => ({ slug: quest.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const quest = await getBySlug<Quest>('quests', slug, 0)
  if (!quest) return {}
  return {
    title: quest.seo?.title || `${quest.title} — walkthrough, time cost and prerequisites`,
    description: quest.seo?.description || quest.summary,
    alternates: { canonical: `/quests/${quest.slug}` },
    robots: quest.seo?.noindex ? { index: false, follow: true } : undefined,
  }
}

export default async function QuestPage({ params }: Props) {
  const { slug } = await params
  const quest = await getBySlug<Quest>('quests', slug, 2)
  if (!quest) notFound()

  const region = rel<Region>(quest.region)
  const prereqs = relMany<Quest>(quest.prereqs)
  const unlocks = relMany<Quest>(quest.unlocks)
  const excludes = relMany<Quest>(quest.excludes)
  const endings = relMany<Ending>(quest.affectsEndings)
  const known = quest.time?.known

  return (
    <>
      <PageHeader
        eyebrow="Quest"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Quests', href: '/quests' }, { label: quest.title }]}
        title={quest.title}
        lede={quest.summary}
        badges={
          <>
            <PhaseBadge phase={quest.phase} />
            <Confidence level={quest.confidence} />
          </>
        }
      />
      <div className="page body-main">
        <Facts
          items={[
            {
              label: 'Time cost',
              value: known
                ? `${quest.time?.min === quest.time?.max ? quest.time?.max : `${quest.time?.min}–${quest.time?.max}`} segments`
                : 'Not confirmed',
            },
            { label: 'Phase', value: quest.phase === 'either' ? 'Day or night' : `${quest.phase} only` },
            { label: 'Region', value: region ? region.title : 'Unrecorded' },
            { label: 'Prerequisites', value: prereqs.length },
          ]}
        />

        <RichText data={quest.body} />

        {prereqs.length > 0 ? (
          <section className="section">
            <div className="section-head">
              <h2>Before this opens</h2>
            </div>
            <ol className="chain">
              {prereqs.map((prereq, index) => (
                <li key={prereq.id}>
                  <span className="step">{String(index + 1).padStart(2, '0')}</span>
                  <span>
                    <Link href={`/quests/${prereq.slug}`}>{prereq.title}</Link>
                    {prereq.summary ? <span className="sub">{prereq.summary}</span> : null}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {unlocks.length > 0 ? (
          <section className="section">
            <div className="section-head">
              <h2>What this opens</h2>
            </div>
            <ul className="chain">
              {unlocks.map((next) => (
                <li key={next.id}>
                  <span className="step">→</span>
                  <Link href={`/quests/${next.slug}`}>{next.title}</Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {excludes.length > 0 ? (
          <div className="callout" data-tone="risk">
            <h3>Doing this closes other routes</h3>
            <p>
              Completing {quest.title} permanently locks out{' '}
              {excludes.map((locked, index) => (
                <span key={locked.id}>
                  {index > 0 ? ', ' : ''}
                  <Link href={`/quests/${locked.slug}`}>{locked.title}</Link>
                </span>
              ))}
              . No amount of remaining time reopens them.
            </p>
          </div>
        ) : null}

        {endings.length > 0 ? (
          <section className="section">
            <div className="section-head">
              <h2>Endings this affects</h2>
            </div>
            <ul className="chain">
              {endings.map((ending) => (
                <li key={ending.id}>
                  <span className="step">·</span>
                  <Link href={`/endings/${ending.slug}`}>{ending.title}</Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="callout">
          <h3>Where does this leave your run?</h3>
          <p>
            The <Link href="/tools/run-checker">run checker</Link> takes the quests you have actually
            finished and works out which endings are still reachable from where you are.
          </p>
        </div>

        <AdSlot />
        <Sources sources={quest.sources} />
      </div>
    </>
  )
}

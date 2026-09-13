import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { Badge, Confidence } from '@/components/Badges'
import { Facts } from '@/components/Facts'
import { RichText } from '@/components/RichText'
import { Sources } from '@/components/Sources'
import { AdSlot } from '@/components/AdSlot'
import { getAll, getBySlug, rel } from '@/lib/payload'
import { getRunGraph } from '@/lib/runData'
import { checkEnding, indexQuests } from '@/lib/reachability'
import { clockAt, formatSegments } from '@/lib/segments'
import type { Character, Ending } from '@/payload-types'

type Props = { params: Promise<{ slug: string }> }

export async function generateStaticParams() {
  const endings = await getAll<Ending>('endings', { depth: 0 })
  return endings.map((ending) => ({ slug: ending.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const ending = await getBySlug<Ending>('endings', slug, 0)
  if (!ending) return {}
  return {
    title: ending.seo?.title || `${ending.title} ending — requirements and how to get it`,
    description: ending.seo?.description || ending.summary,
    alternates: { canonical: `/endings/${ending.slug}` },
  }
}

export default async function EndingPage({ params }: Props) {
  const { slug } = await params
  const ending = await getBySlug<Ending>('endings', slug, 2)
  if (!ending) notFound()

  const ally = rel<Character>(ending.ally)
  const { quests, endings } = await getRunGraph()
  const node = endings.find((candidate) => candidate.slug === slug)
  const index = indexQuests(quests)

  // Cost of the whole chain from a standing start — the "if you began now"
  // figure, which is what a planning reader actually wants.
  const fromScratch = node
    ? checkEnding(node, { segmentsSpent: 0, completedQuestIds: [] }, index)
    : null
  const chain = fromScratch?.outstanding ?? []

  return (
    <>
      <PageHeader
        eyebrow="Ending"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Endings', href: '/endings' }, { label: ending.title }]}
        title={ending.title}
        lede={ending.summary}
        badges={
          <>
            <Badge>
              {ending.gate === 'ally' ? 'Ally-gated' : ending.gate === 'clock' ? 'Clock' : 'Choice'}
            </Badge>
            {ending.isEarlyExit ? <Badge>Early exit</Badge> : null}
            <Confidence level={ending.confidence} />
          </>
        }
      />
      <div className="page body-main">
        {ending.howToGet ? (
          <div className="callout">
            <h3>The short answer</h3>
            <p>{ending.howToGet}</p>
          </div>
        ) : null}

        <Facts
          items={[
            { label: 'Gated by', value: ending.gate === 'ally' ? 'Ally questline' : ending.gate === 'clock' ? 'The clock' : 'A choice' },
            { label: 'Quests in the chain', value: chain.length },
            {
              label: 'Chain cost',
              value:
                fromScratch && fromScratch.unknownCostCount > 0
                  ? 'Not yet known'
                  : fromScratch
                    ? formatSegments(fromScratch.maxCost)
                    : '—',
            },
            {
              label: 'Latest start',
              value:
                fromScratch?.latestStartDay && fromScratch.unknownCostCount === 0
                  ? `Day ${fromScratch.latestStartDay}`
                  : 'Not yet known',
            },
          ]}
        />

        {fromScratch && fromScratch.unknownCostCount > 0 ? (
          <div className="callout" data-tone="risk">
            <h3>We cannot give you a deadline yet</h3>
            <p>
              {fromScratch.unknownCostCount} of the {chain.length} quests in this chain have no
              published segment cost, so any total would be a floor rather than a figure. We have
              left it blank instead of guessing. If you have real numbers,{' '}
              <Link href="/corrections">send them in</Link>.
            </p>
          </div>
        ) : null}

        {ally ? (
          <p className="lede">
            Gated on <Link href={`/characters/${ally.slug}`}>{ally.title}</Link>&rsquo;s questline.
          </p>
        ) : null}

        {chain.length > 0 ? (
          <section className="section">
            <div className="section-head">
              <h2>The chain, in order</h2>
              <span className="eyebrow">{chain.length} quests</span>
            </div>
            <ol className="chain">
              {chain.map((quest, position) => (
                <li key={quest.id}>
                  <span className="step">{String(position + 1).padStart(2, '0')}</span>
                  <span>
                    <Link href={`/quests/${quest.slug}`}>{quest.title}</Link>
                    <span className="sub">
                      {quest.phase === 'either' ? 'Day or night' : `${quest.phase} only`} ·{' '}
                      {quest.costKnown ? `${quest.timeMax} segments` : 'cost not confirmed'}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        <RichText data={ending.body} />

        <div className="callout">
          <h3>Is it still reachable from where you are?</h3>
          <p>
            The <Link href="/tools/run-checker">run checker</Link> takes your current day and the
            quests you have finished, and tells you whether this one is still on the table.
          </p>
        </div>

        <AdSlot />
        <Sources sources={ending.sources} />
      </div>
    </>
  )
}

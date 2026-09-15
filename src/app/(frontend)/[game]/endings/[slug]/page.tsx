import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { Badge, Confidence } from '@/components/Badges'
import { Facts } from '@/components/Facts'
import { RichText } from '@/components/RichText'
import { Sources } from '@/components/Sources'
import { Attribution } from '@/components/Attribution'
import { CommentThread } from '@/components/CommentThread'
import { AdSlot } from '@/components/AdSlot'
import { Spoiler } from '@/components/Spoiler'
import { EntityImage } from '@/components/EntityImage'
import { getAll, getBySlug, rel } from '@/lib/payload'
import { gameSlugParams } from '@/lib/params'
import { getRunGraph } from '@/lib/runData'
import { UnlockPath } from '@/components/UnlockPath'
import { checkEnding, indexQuests } from '@/lib/reachability'
import { clockAt, formatSegments } from '@/lib/segments'
import type { Character, Ending } from '@/payload-types'
import { endingMeta } from '@/lib/seo'

type Props = { params: Promise<{ game: string; slug: string }> }

export const generateStaticParams = () => gameSlugParams('endings')

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { game, slug } = await params
  const ending = await getBySlug('endings', slug, { game, depth: 1 })
  if (!ending) return {}
  const meta = endingMeta(ending)
  return {
    // Composed from the record's own fields unless an editor has written one.
    title: ending.seo?.title || meta.title,
    description: ending.seo?.description || meta.description,
    alternates: { canonical: `/endings/${ending.slug}` },
  }
}

export default async function EndingPage({ params }: Props) {
  const { game, slug } = await params
  const ending = await getBySlug('endings', slug, { game, depth: 2 })
  if (!ending) notFound()

  const ally = rel<Character>(ending.ally)
  const { quests, endings } = await getRunGraph(game)
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
        <EntityImage media={ending.image} shape="wide" />

        {ending.howToGet ? (
          <div className="callout">
            <h3>What you have to do</h3>
            <p>{ending.howToGet}</p>
          </div>
        ) : null}

        {ending.outcome ? (
          <section className="section">
            <div className="section-head">
              <h2>What actually happens</h2>
              <span className="eyebrow">Story spoiler</span>
            </div>
            <Spoiler label={`Ending of ${ending.title}`}>
              <p className="lede">{ending.outcome}</p>
            </Spoiler>
          </section>
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

        {node && node.requiredQuests.length > 0 ? (
          <UnlockPath
            roots={node.requiredQuests}
            quests={quests}
            heading="How to reach this ending"
            emptyNote="No source records a required questline for this ending yet."
          />
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
        <Attribution sources={ending.sources} />
        <CommentThread game={game} path={`/endings/${slug}`} />
      </div>
    </>
  )
}

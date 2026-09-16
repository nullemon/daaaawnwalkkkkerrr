import type { Metadata } from 'next'
import { SectionNeighbours } from '@/components/SectionNeighbours'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { Confidence, PhaseBadge } from '@/components/Badges'
import { RichText } from '@/components/RichText'
import { Sources } from '@/components/Sources'
import { Attribution } from '@/components/Attribution'
import { CommentThread } from '@/components/CommentThread'
import { AdSlot } from '@/components/AdSlot'
import { QuestToggle } from '@/components/QuestToggle'
import { UnlockPath } from '@/components/UnlockPath'
import { getRunGraph } from '@/lib/runData'
import { EntityImage } from '@/components/EntityImage'
import { FactPanel } from '@/components/FactPanel'
import { getAll, getBySlug, getGame, rel, relMany } from '@/lib/payload'
import { gameName } from '@/lib/section-copy'
import { gameSlugParams } from '@/lib/params'
import type { Ending, Quest, Region } from '@/payload-types'
import { clamp, questMeta } from '@/lib/seo'

type Props = { params: Promise<{ game: string; slug: string }> }

export const generateStaticParams = () => gameSlugParams('quests')

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { game, slug } = await params
  // Depth 1: the composed description names the region, so it has to resolve.
  const quest = await getBySlug('quests', slug, { game, depth: 1 })
  if (!quest) return {}
  const meta = questMeta(quest, gameName(await getGame(game)))
  return {
    // Composed from the record's own fields unless an editor has written one.
    title: quest.seo?.title || meta.title,
    description: clamp(quest.seo?.description || meta.description || ''),
    alternates: { canonical: `/quests/${quest.slug}` },
    robots: quest.seo?.noindex ? { index: false, follow: true } : undefined,
  }
}

export default async function QuestPage({ params }: Props) {
  const { game, slug } = await params
  const quest = await getBySlug('quests', slug, { game, depth: 2 })
  if (!quest) notFound()

  const region = rel<Region>(quest.region)
  const graph = await getRunGraph(game)
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
        <QuestToggle questId={String(quest.id)} title={quest.title} />

        <div className="split">
          <div className="stack">
            <EntityImage media={quest.image} shape="wide" />
            <div className="prose">
              <RichText data={quest.body} />
            </div>
          </div>
          <div className="stack">
            <FactPanel
              facts={[
                {
                  label: 'Time cost',
                  value: known
                    ? `${quest.time?.min === quest.time?.max ? quest.time?.max : `${quest.time?.min}–${quest.time?.max}`} segments`
                    : undefined,
                  // "Not confirmed" rather than 0: an unpublished cost is not a
                  // free quest, and the run checker treats it as a floor too.
                  absent: 'nobody has published one',
                },
                {
                  label: 'Phase',
                  value: quest.phase === 'either' ? 'Day or night' : `${quest.phase} only`,
                },
                {
                  // Linked, not printed. The region page lists this quest back,
                  // so leaving it as plain text was a dead end in one direction.
                  label: 'Region',
                  value: region ? <Link href={`/regions/${region.slug}`}>{region.title}</Link> : undefined,
                  absent: 'unrecorded',
                },
                { label: 'Prerequisites', value: prereqs.length || undefined, absent: 'none' },
                { label: 'Opens', value: unlocks.length || undefined },
                { label: 'Closes off', value: excludes.length || undefined },
              ]}
            />
            <div className="callout">
              <h2>Where does this leave your run?</h2>
              <p>
                The <Link href="/tools/run-checker">run checker</Link> takes the quests you have
                actually finished and works out which endings are still reachable from where you
                are.
              </p>
            </div>
          </div>
        </div>

        <UnlockPath roots={[String(quest.id)]} questId={String(quest.id)} quests={graph.quests} />

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
            <h2>Doing this closes other routes</h2>
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

        <AdSlot />
        <Sources sources={quest.sources} />
        <Attribution sources={quest.sources} />
        <SectionNeighbours
          collection="quests"
          game={game}
          slug={slug}
          label="quests"
        />
        <CommentThread game={game} path={`/quests/${slug}`} />
      </div>
    </>
  )
}

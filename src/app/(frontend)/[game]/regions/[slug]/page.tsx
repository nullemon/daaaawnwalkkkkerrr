import type { Metadata } from 'next'
import { clamp } from '@/lib/seo'
import { SectionNeighbours } from '@/components/SectionNeighbours'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { Confidence, PhaseBadge } from '@/components/Badges'
import { RichText } from '@/components/RichText'
import { Sources } from '@/components/Sources'
import { Attribution } from '@/components/Attribution'
import { CommentThread } from '@/components/CommentThread'
import { EntityImage } from '@/components/EntityImage'
import { FactPanel } from '@/components/FactPanel'
import { RelatedList, type RelatedItem } from '@/components/RelatedList'
import { acquisitionLabel } from '@/lib/items'
import { Callout } from '@/components/Callout'
import { getUi } from '@/lib/ui'
import { getAll, getBySlug, getGame } from '@/lib/payload'
import { gameSlugParams } from '@/lib/params'
import type { Region } from '@/payload-types'

type Props = { params: Promise<{ game: string; slug: string }> }

export const generateStaticParams = () => gameSlugParams('regions')

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { game, slug } = await params
  const doc = await getBySlug('regions', slug, { game, depth: 0 })
  if (!doc) return {}
  return {
    title: doc.seo?.title || `${doc.title} — quests, locations and what is there`,
    description: clamp(doc.seo?.description || doc.summary || ''),
    alternates: { canonical: `/regions/${doc.slug}` },
    /*
      The admin's own "Hide this page from search engines" box.
      `seoGroup()` puts it on every content collection and only the
      quest page read it, so ticking it anywhere else did nothing at
      all — a control that is present, reachable and inert.
    */
    robots: doc.seo?.noindex ? { index: false, follow: true } : undefined,
  }
}

/** True when a relationship field, loaded at depth 1, points at this region. */
const inRegion = (value: unknown, slug: string): boolean =>
  Boolean(value && typeof value === 'object' && (value as Region).slug === slug)

export default async function RegionPage({ params }: Props) {
  const { game, slug } = await params
  const [wiki, doc, ui] = await Promise.all([
    getGame(game),
    getBySlug('regions', slug, { game, depth: 1 }),
    getUi(),
  ])
  if (!doc) notFound()

  // Every relationship pointing here is worth walking back. The page used to
  // list quests alone, so a region holding four legendaries and three court
  // activities said nothing about either and the reader had to go and filter
  // an index to find out.
  const [allQuests, allItems, allEnemies, allCourt] = await Promise.all([
    getAll('quests', { game, depth: 1, sort: 'title' }),
    getAll('items', { game, depth: 1, sort: 'title' }),
    getAll('enemies', { game, depth: 1, sort: 'title' }),
    getAll('court-activities', { game, depth: 1, sort: 'title' }),
  ])

  const quests = allQuests.filter((quest) => inRegion(quest.region, slug))
  const items = allItems.filter((item) => inRegion(item.region, slug))
  const enemies = allEnemies.filter((enemy) => inRegion(enemy.region, slug))
  const court = allCourt.filter((activity) => inRegion(activity.region, slug))

  const costed = quests.filter((quest) => quest.time?.known)
  const knownSegments = costed.reduce((total, quest) => total + (quest.time?.max ?? 0), 0)
  /** The 480-segment clock belongs to the game that has it switched on. */
  const hasClock = (wiki?.features ?? []).includes('run-checker')

  const questItems: RelatedItem[] = quests.map((quest) => ({
    id: quest.id,
    title: quest.title,
    href: `/quests/${quest.slug}`,
    sub: quest.summary,
    meta: <PhaseBadge phase={quest.phase} />,
  }))

  const itemItems: RelatedItem[] = items.map((item) => ({
    id: item.id,
    title: item.title,
    href: `/items/${item.slug}`,
    sub: item.howToGet,
    meta: item.rarity ? <span className={`badge rarity-${item.rarity}`}>{item.rarity}</span> : acquisitionLabel(item, ui),
  }))

  const courtItems: RelatedItem[] = court.map((activity) => ({
    id: activity.id,
    title: activity.title,
    href: `/court-activities/${activity.slug}`,
    sub: activity.summary,
  }))

  const enemyItems: RelatedItem[] = enemies.map((enemy) => ({
    id: enemy.id,
    title: enemy.title,
    href: `/enemies/${enemy.slug}`,
    sub: enemy.summary,
    meta: enemy.isBoss ? <span className="badge">Boss</span> : undefined,
  }))

  return (
    <>
      <PageHeader
        eyebrow="Region"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Regions', href: '/regions' }, { label: doc.title }]}
        icon="map"
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
                {
                  /*
                    This map was keyed 'late-run'. The records store 'late' —
                    the collection's own option, the generated type and both
                    seed files agree — so the lookup missed and the fallback
                    printed a bare lower-case "late" in the fact panel while
                    the index page next to it said "Late run". Two enums that
                    should have been one, disagreeing quietly for as long as
                    both existed. There is one now, in the label registry.
                  */
                  label: 'Danger',
                  value: doc.dangerRating ? ui.label('danger', doc.dangerRating) : undefined,
                },
                { label: 'Quests', value: quests.length || undefined, absent: 'none filed' },
                {
                  /*
                    A floor, never a total: only the costed quests contribute,
                    so the label has to say how many of them there were or the
                    number reads as the price of clearing the whole region.
                  */
                  /*
                    And only on a wiki that has the clock. The Callout twenty
                    lines down was gated for exactly this reason and this row
                    was not, so every region page on the other seven wikis
                    printed "Segment cost — none of the 4 are costed" — an
                    apology for a missing figure in a mechanic those games do
                    not have. Quest→region edges are written for all seven, so
                    it was live, not hypothetical.
                  */
                  label: 'Segment cost',
                  value:
                    hasClock && costed.length > 0
                      ? `${knownSegments}+ (${costed.length} of ${quests.length} costed)`
                      : undefined,
                  absent:
                    hasClock && quests.length > 0
                      ? `none of the ${quests.length} are costed`
                      : undefined,
                },
                { label: 'Court activities', value: court.length || undefined },
                { label: 'Legendaries', value: items.filter((i) => i.rarity === 'legendary').length || undefined },
              ]}
            />
            {/*
              The segment clock is Dawnwalker's. This box told a Gears of War
              reader that travel between regions costs nothing "because it is
              the quests inside them that cost you", on every one of fifty-one
              region pages — the same leak as the heading that used to say
              "Vale Sangora", arriving through a different door. It now shows
              only on a wiki that has the clock, and any wiki can write its
              own.
            */}
            <Callout
              game={wiki}
              where="regions-detail"
              heading="Travel is free"
              builtIn={(wiki?.features ?? []).includes('run-checker')}
            >
              <p>
                Walking and fast travel cost no segments at all, so a region is only ever as
                expensive as the quests you commit to inside it.{' '}
                <Link href="/tools/run-checker">Check what you can still reach</Link>.
              </p>
            </Callout>
          </div>
        </div>

        {/*
          Full width, below the split. Sixteen quests squeezed into the prose
          column is a long thin scroll with the sidebar's dead space beside it;
          the lists are the densest thing on the page and should have the room.
        */}
        <RelatedList
          heading="Quests here"
          icon="scroll"
          items={questItems}
          href="/quests"
          emptyNote="No quest in the database is filed under this region yet."
        />
        <RelatedList
          heading="Court activities here"
          icon="crown"
          items={courtItems}
          href="/court-activities"
        />
        <RelatedList
          heading="Items found here"
          icon="sword"
          items={itemItems}
          href="/items"
          note={
            items.length > 0
              ? 'Only the items a source actually pins to this region. Guides usually describe a location by landmark instead, so the region holds more than this.'
              : undefined
          }
        />
        <RelatedList heading="Enemies here" icon="skull" items={enemyItems} href="/enemies" />

        <Sources sources={doc.sources} />

        <Attribution sources={doc.sources} />

        <SectionNeighbours
          collection="regions"
          game={game}
          slug={slug}
          label="regions"
        />
        <CommentThread game={game} path={`/regions/${slug}`} />
      </div>
    </>
  )
}

import type { Metadata } from 'next'
import { SectionNeighbours } from '@/components/SectionNeighbours'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { Badge, Confidence, PhaseBadge } from '@/components/Badges'
import { RichText } from '@/components/RichText'
import { Sources } from '@/components/Sources'
import { Attribution } from '@/components/Attribution'
import { CommentThread } from '@/components/CommentThread'
import { FactPanel } from '@/components/FactPanel'
import { EntityImage } from '@/components/EntityImage'
import { getUi } from '@/lib/ui'
import { getBySlug, getGame, rel } from '@/lib/payload'
import { gameName } from '@/lib/section-copy'
import { gameSlugParams } from '@/lib/params'
import type { Enemy, Region } from '@/payload-types'
import { clamp, enemyMeta } from '@/lib/seo'

type Props = { params: Promise<{ game: string; slug: string }> }

export const generateStaticParams = () => gameSlugParams('enemies')

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { game, slug } = await params
  const doc = await getBySlug('enemies', slug, { game, depth: 1 })
  if (!doc) return {}
  const meta = enemyMeta(doc, gameName(await getGame(game)))
  return {
    // Composed from the record's own fields unless an editor has written one.
    title: doc.seo?.title || meta.title,
    description: clamp(doc.seo?.description || meta.description || ''),
    alternates: { canonical: `/enemies/${doc.slug}` },
    /*
      The admin's own "Hide this page from search engines" box.
      `seoGroup()` puts it on every content collection and only the
      quest page read it, so ticking it anywhere else did nothing at
      all — a control that is present, reachable and inert.
    */
    robots: doc.seo?.noindex ? { index: false, follow: true } : undefined,
  }
}

export default async function EnemyPage({ params }: Props) {
  const { game, slug } = await params
  const [doc, ui] = await Promise.all([
    getBySlug('enemies', slug, { game, depth: 1 }),
    getUi(),
  ])
  if (!doc) notFound()
  const region = rel<Region>(doc.region)

  return (
    <>
      <PageHeader
        eyebrow={doc.isBoss ? 'Boss' : 'Enemy'}
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Enemies', href: '/enemies' }, { label: doc.title }]}
        title={doc.title}
        lede={doc.summary}
        badges={
          <>
            {doc.isBoss ? <Badge>Boss</Badge> : null}
            <PhaseBadge phase={doc.phase} />
            <Confidence level={doc.confidence} />
          </>
        }
      />
      <div className="page body-main">
        <div className="split">
          <div className="stack">
            <EntityImage media={doc.image} shape="wide" />
            {doc.weaknesses?.length ? (
              <div className="callout">
                <h2>Weak to</h2>
                <p>{doc.weaknesses.map((weakness) => weakness.value).join(', ')}</p>
              </div>
            ) : null}
            <div className="prose">
              <RichText data={doc.body} />
            </div>
          </div>
          <div className="stack">
            <FactPanel
              facts={[
                { label: 'Rank', value: doc.isBoss ? 'Boss' : 'Regular enemy' },
                {
                  label: 'Met during',
                  value: doc.phase === 'either' ? 'Day or night' : doc.phase ? `${doc.phase} only` : undefined,
                },
                {
                  label: 'Weak to',
                  value: doc.weaknesses?.length
                    ? doc.weaknesses.map((weakness) => weakness.value).join(', ')
                    : undefined,
                  absent: 'nothing published',
                },
                {
                  /*
                    Most of the bestiary is creature *types* that roam the whole
                    vale, so an empty region here is usually the fact rather
                    than a gap — say which, instead of printing a dash.
                  */
                  label: 'Region',
                  value: region ? <Link href={`/regions/${region.slug}`}>{region.title}</Link> : undefined,
                  /*
                    "the vale" is Vale Sangora, and this line was printing it
                    on the enemy pages of every wiki in the network — a Gears
                    of War drone "found across the vale". The general claim is
                    true everywhere; the place name is true in one game.
                  */
                  absent: ui.t(
                    doc.isBoss ? 'facts.region-unrecorded' : 'facts.region-everywhere',
                  ),
                },
              ]}
            />
          </div>
        </div>
        <Sources sources={doc.sources} />
        <Attribution sources={doc.sources} />
        <SectionNeighbours
          collection="enemies"
          game={game}
          slug={slug}
          label="enemies"
        />
        <CommentThread game={game} path={`/enemies/${slug}`} />
      </div>
    </>
  )
}

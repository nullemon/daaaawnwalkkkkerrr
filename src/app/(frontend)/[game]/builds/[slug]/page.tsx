import type { Metadata } from 'next'
import { SectionNeighbours } from '@/components/SectionNeighbours'
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
import { EntityImage } from '@/components/EntityImage'
import { getBySlug, getGame, rel, relMany } from '@/lib/payload'
import { gameName } from '@/lib/section-copy'
import { gameSlugParams } from '@/lib/params'
import type { Build, Item, Perk, SkillTree } from '@/payload-types'
import { buildMeta, clamp } from '@/lib/seo'

type Props = { params: Promise<{ game: string; slug: string }> }

export const generateStaticParams = () => gameSlugParams('builds')

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { game, slug } = await params
  const doc = await getBySlug('builds', slug, { game, depth: 1 })
  if (!doc) return {}
  const meta = buildMeta(doc, gameName(await getGame(game)))
  return {
    // Composed from the record's own fields unless an editor has written one.
    title: doc.seo?.title || meta.title,
    description: clamp(doc.seo?.description || meta.description || ''),
    alternates: { canonical: `/builds/${doc.slug}` },
    /*
      The admin's own "Hide this page from search engines" box.
      `seoGroup()` puts it on every content collection and only the
      quest page read it, so ticking it anywhere else did nothing at
      all — a control that is present, reachable and inert.
    */
    robots: doc.seo?.noindex ? { index: false, follow: true } : undefined,
  }
}

export default async function BuildPage({ params }: Props) {
  const { game, slug } = await params
  const doc = await getBySlug('builds', slug, { game, depth: 2 })
  if (!doc) notFound()

  const tree = rel<SkillTree>(doc.primaryTree)
  const perks = relMany<Perk>(doc.perks)
  const items = relMany<Item>(doc.items)
  const planner = perks.length
    ? `/tools/build-planner?perks=${perks.map((perk) => perk.slug).join(',')}`
    : '/tools/build-planner'

  return (
    <>
      <PageHeader
        eyebrow="Build"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Builds', href: '/builds' }, { label: doc.title }]}
        title={doc.title}
        lede={doc.summary}
        badges={
          <>
            <Badge>{doc.playstyle}</Badge>
            {doc.difficulty ? <Badge>{doc.difficulty}</Badge> : null}
            <Confidence level={doc.confidence} />
          </>
        }
      />
      <div className="page body-main">
        {/*
                  Square, because what hangs here is a generated emblem rather than key
                  art. `wide` is 640px, so a square image rendered in it becomes the
                  largest thing on the page — and the one image on this site that
                  depicts nothing is the last one that should dominate. A record that
                  ever gets real wide art wants this changed back with it.
                */}
        <EntityImage media={doc.image} shape="square" />

        <Facts
          items={[
            { label: 'Plays in', value: doc.playstyle },
            {
              label: 'Primary tree',
              value: tree ? <Link href={`/skills/${tree.slug}`}>{tree.title}</Link> : '—',
            },
            { label: 'Perks', value: perks.length || '—' },
            { label: 'Segment cost', value: doc.segmentCost ?? 'Not confirmed' },
          ]}
        />

        <RichText data={doc.body} />

        {perks.length > 0 ? (
          <section className="section">
            <div className="section-head">
              <h2>Perks</h2>
              <Link href={planner} className="eyebrow">
                Open in the planner
              </Link>
            </div>
            <ul className="chain">
              {perks.map((perk) => (
                <li key={perk.id}>
                  <span className="step">{perk.isUltimate ? '★' : '·'}</span>
                  <span>
                    {/*
                      A link, not bold text. Every one of these is a perk with
                      its own page and an edge an editor stored deliberately —
                      sixty-two of them across nine builds, and not one was
                      clickable. The slugs were already in hand two lines up,
                      where the planner URL is built from them.
                    */}
                    <Link href={`/perks/${perk.slug}`}>{perk.title}</Link>
                    {perk.effect ? <span className="sub">{perk.effect}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {items.length > 0 ? (
          <section className="section">
            <div className="section-head">
              <h2>Gear</h2>
            </div>
            <ul className="chain">
              {items.map((item) => (
                <li key={item.id}>
                  <span className="step">·</span>
                  <span>
                    <Link href={`/items/${item.slug}`}>{item.title}</Link>
                    {item.howToGet ? <span className="sub">{item.howToGet}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <AdSlot />
        <Sources sources={doc.sources} />
        <Attribution sources={doc.sources} />
        <SectionNeighbours
          collection="builds"
          game={game}
          slug={slug}
          label="builds"
        />
        <CommentThread game={game} path={`/builds/${slug}`} />
      </div>
    </>
  )
}

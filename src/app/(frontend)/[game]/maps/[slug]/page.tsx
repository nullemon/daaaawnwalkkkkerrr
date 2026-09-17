import type { Metadata } from 'next'
import { SectionNeighbours } from '@/components/SectionNeighbours'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { Linked } from '@/components/Linked'
import type { LinkScope } from '@/lib/link-index'
import { Confidence } from '@/components/Badges'
import { GameMap, type MapCategory, type MapMarker } from '@/components/GameMap'
import { Sources } from '@/components/Sources'
import { Attribution } from '@/components/Attribution'
import { CommentThread } from '@/components/CommentThread'
import { getBySlug } from '@/lib/payload'
import { gameSlugParams } from '@/lib/params'
import { SECTION_PATH, type GameScopedCollection } from '@/lib/tenancy'

type Props = { params: Promise<{ game: string; slug: string }> }

export const generateStaticParams = () => gameSlugParams('maps')

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { game, slug } = await params
  const doc = await getBySlug('maps', slug, { game, depth: 0 })
  if (!doc) return {}
  return {
    title: doc.seo?.title || doc.title,
    description:
      doc.seo?.description ||
      doc.summary ||
      `An interactive map of ${doc.title}, with each marked location linking to what is recorded about it.`,
    alternates: { canonical: `/maps/${doc.slug}` },
    // The admin's "Hide this page from search engines" box, honoured.
    robots: doc.seo?.noindex ? { index: false, follow: true } : undefined,
  }
}

/**
 * One map.
 *
 * The marker data is flattened here rather than in the client component, so
 * the component stays a viewer and knows nothing about Payload's shapes. A
 * marker's `record` is a polymorphic relationship, which arrives as
 * `{ relationTo, value }` — turning that into an href needs SECTION_PATH, and
 * SECTION_PATH is server-side knowledge.
 */
export default async function MapPage({ params }: Props) {
  const { game, slug } = await params
  const doc = await getBySlug('maps', slug, { game, depth: 1 })
  if (!doc) notFound()

  /*
    Where this page is, for the inline linker.

    `self` is the whole reason it is passed: composed prose names the record it
    is about in its own first sentence, and a link from a page to itself reads
    as a bug. See `src/components/Linked.tsx`.
  */
  const scope: LinkScope = { host: 'wiki', game, self: `maps:${doc.id}` }

  const image = typeof doc.image === 'object' ? doc.image : null
  if (!image?.url) notFound()

  const categories: MapCategory[] = (doc.categories ?? []).map((category) => ({
    key: category.key,
    label: category.label,
    colour: category.colour,
  }))

  const markers: MapMarker[] = (doc.markers ?? []).map((marker, index) => {
    const record = marker.record as { relationTo?: string; value?: unknown } | null | undefined
    const target = record?.value as { slug?: string } | undefined
    const section = record?.relationTo
      ? SECTION_PATH[record.relationTo as GameScopedCollection]
      : undefined

    return {
      id: marker.id ?? `marker-${index}`,
      label: marker.label,
      category: marker.category,
      x: marker.x,
      y: marker.y,
      note: marker.note,
      href: section && target?.slug ? `${section}/${target.slug}` : null,
      source: marker.markerSource,
    }
  })

  return (
    <>
      <PageHeader
        eyebrow="Map"
        crumbs={[
          { label: 'Home', href: '/' },
          { label: 'Maps', href: '/maps' },
          { label: doc.title },
        ]}
        icon="map"
        title={doc.title}
        lede={doc.summary ? <Linked text={doc.summary} scope={scope} /> : undefined}
        badges={<Confidence level={doc.confidence} />}
      />

      <div className="page body-main">
        <GameMap
          slug={String(doc.slug)}
          image={image.url}
          alt={image.alt || doc.title}
          markers={markers}
          categories={categories}
        />

        {markers.length === 0 ? (
          <div className="callout">
            <h2>Nothing is marked on this map yet</h2>
            <p>
              The base map is real; the pins are not there because nobody has published where
              anything is. A pin is a claim a reader will walk to, so every one of them needs a
              source — a video with a timestamp, a guide, or somebody who found it — before it goes
              on. They arrive as the game does.
            </p>
          </div>
        ) : null}

        <Sources sources={doc.sources} />
        <Attribution sources={doc.sources} />
        <SectionNeighbours
          collection="maps"
          game={game}
          slug={slug}
          label="maps"
        />
        <CommentThread game={game} path={`/maps/${doc.slug}`} />
      </div>
    </>
  )
}

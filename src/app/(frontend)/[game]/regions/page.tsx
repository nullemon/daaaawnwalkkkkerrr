import type { Metadata, ResolvingMetadata } from 'next'
import { PageHeader } from '@/components/PageHeader'
import { Linked } from '@/components/Linked'
import type { LinkScope } from '@/lib/link-index'
import { sectionArt } from '@/lib/art'
import { EntityCard } from '@/components/EntityCard'
import { Badge } from '@/components/Badges'
import { getAll, getGame } from '@/lib/payload'
import { sectionCopy } from '@/lib/section-copy'
import { getUi } from '@/lib/ui'
import { socialMeta } from '@/lib/social'

type Props = { params: Promise<{ game: string }> }

export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { game: slug } = await params
  const [game, regions] = await Promise.all([
    getGame(slug),
    getAll('regions', { game: slug, depth: 0 }),
  ])
  const copy = sectionCopy('regions', game, { total: regions.length })
  return {
    title: copy.title,
    description: copy.description,
    alternates: { canonical: '/regions' },
    ...(await socialMeta(parent, { path: '/regions' })),
  }
}

export default async function RegionsIndex({ params }: Props) {
  const { game: slug } = await params
  const [game, regions, ui] = await Promise.all([
    getGame(slug),
    getAll('regions', { game: slug, depth: 0 }),
    getUi(),
  ])
  const copy = sectionCopy('regions', game, { total: regions.length })
  /*
    Where this page is, for the inline linker.

    No `self`: an index is about a section rather than about one record, so
    there is nothing on it to link to itself. The wiki's own game is still
    treated as self by `matchText`, which is what keeps a lede naming the game
    from linking to the home page the reader is already inside.
  */
  const scope: LinkScope = { host: 'wiki', game: slug }

  return (
    <>
      <PageHeader
        art={sectionArt(slug, 'regions')}
        eyebrow="Database"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Regions' }]}
        icon="map"
        title={copy.heading}
        lede={copy.lede ? <Linked text={copy.lede} scope={scope} /> : undefined}
      />
      <div className="page body-main">
        <div className="grid">
          {regions.map((region) => (
            <EntityCard
              headingLevel={2}
              key={region.id}
              href={`/regions/${region.slug}`}
              title={region.title}
              summary={region.summary}
              badges={
                region.dangerRating ? <Badge>{ui.label('danger', region.dangerRating)}</Badge> : null
              }
            />
          ))}
        </div>
      </div>
    </>
  )
}

import type { Metadata } from 'next'
import { PageHeader } from '@/components/PageHeader'
import { sectionArt } from '@/lib/art'
import { EntityCard } from '@/components/EntityCard'
import { Badge } from '@/components/Badges'
import { getAll, getGame } from '@/lib/payload'
import { sectionCopy } from '@/lib/section-copy'

type Props = { params: Promise<{ game: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
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
  }
}

const DANGER: Record<string, string> = {
  starting: 'Starting area',
  moderate: 'Moderate',
  dangerous: 'Dangerous',
  late: 'Late run',
}

export default async function RegionsIndex({ params }: Props) {
  const { game: slug } = await params
  const [game, regions] = await Promise.all([
    getGame(slug),
    getAll('regions', { game: slug, depth: 0 }),
  ])
  const copy = sectionCopy('regions', game, { total: regions.length })
  return (
    <>
      <PageHeader
        art={sectionArt(slug, 'regions')}
        eyebrow="Database"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Regions' }]}
        icon="map"
        title={copy.heading}
        lede={copy.lede}
      />
      <div className="page body-main">
        <div className="grid">
          {regions.map((region) => (
            <EntityCard
              key={region.id}
              href={`/regions/${region.slug}`}
              title={region.title}
              summary={region.summary}
              badges={region.dangerRating ? <Badge>{DANGER[region.dangerRating]}</Badge> : null}
            />
          ))}
        </div>
      </div>
    </>
  )
}

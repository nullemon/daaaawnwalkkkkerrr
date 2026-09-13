import type { Metadata } from 'next'
import { PageHeader } from '@/components/PageHeader'
import { EntityCard } from '@/components/EntityCard'
import { Badge } from '@/components/Badges'
import { getAll } from '@/lib/payload'
import type { Region } from '@/payload-types'

export const metadata: Metadata = {
  title: 'All ten regions of Vale Sangora',
  description:
    'Every region in The Blood of Dawnwalker, what is in it, and which vassal holds it.',
  alternates: { canonical: '/regions' },
}

const DANGER: Record<string, string> = {
  starting: 'Starting area',
  moderate: 'Moderate',
  dangerous: 'Dangerous',
  late: 'Late run',
}

export default async function RegionsIndex() {
  const regions = await getAll<Region>('regions', { depth: 0 })
  return (
    <>
      <PageHeader
        eyebrow="Database"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Regions' }]}
        icon="map"
        title="Vale Sangora"
        lede="Ten regions across roughly ten square kilometres. Travel between them is free — it is the quests inside them that cost you."
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

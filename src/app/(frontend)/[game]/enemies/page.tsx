import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'
import { sectionArt } from '@/lib/art'
import { DataTable, type Row } from '@/components/DataTable'
import { getAll } from '@/lib/payload'
import type { Enemy, Region } from '@/payload-types'

type Props = { params: Promise<{ game: string }> }

export const metadata: Metadata = {
  title: 'Enemies and bosses',
  description:
    'Every enemy and boss in The Blood of Dawnwalker, what they are weak to, and where you meet them.',
  alternates: { canonical: '/enemies' },
}

export default async function EnemiesIndex({ params }: Props) {
  const { game } = await params
  const enemies = await getAll('enemies', { game, depth: 1 })
  const rows: Row[] = enemies.map((enemy) => {
    const region = typeof enemy.region === 'object' ? (enemy.region as Region) : null
    return {
      id: enemy.id,
      icon: 'skull',
      title: enemy.title,
      titleHref: `/enemies/${enemy.slug}`,
      rank: enemy.isBoss ? 'Boss' : 'Standard',
      region: region?.title ?? '',
      regionHref: region ? `/regions/${region.slug}` : '',
      phase: enemy.phase ?? '',
      phaseLabel: enemy.phase === 'day' ? 'Day' : enemy.phase === 'night' ? 'Night' : 'Day or night',
      weaknesses: enemy.weaknesses?.map((w) => w.value).join(', ') ?? '',
    }
  })

  return (
    <>
      <PageHeader
        art={sectionArt('enemies')}
        eyebrow="Database"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Enemies' }]}
        icon="skull"
        title="Enemies and bosses"
        lede="Half of what you fight, you fight as a different character. What you meet by day and what you meet by night are not the same list."
      />
      <div className="page body-main">
        {enemies.length === 0 ? (
          <p className="note">Nothing catalogued yet.</p>
        ) : (
          <DataTable
            rows={rows}
            noun="enemies"
            searchPlaceholder="Search enemies by name, region or weakness…"
            facets={[
              { key: 'rank', label: 'Rank' },
              { key: 'region', label: 'Region' },
              { key: 'phaseLabel', label: 'Met' },
            ]}
            columns={[
              { key: 'title', label: 'Enemy', type: 'name' },
              { key: 'rank', label: 'Rank' },
              { key: 'region', label: 'Region', type: 'link' },
              { key: 'phase', label: 'Met during', type: 'phase', sortable: false },
              { key: 'weaknesses', label: 'Weak to', sortable: false },
            ]}
          />
        )}
      </div>
    </>
  )
}

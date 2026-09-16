import type { Metadata } from 'next'
import { PageHeader } from '@/components/PageHeader'
import { sectionArt } from '@/lib/art'
import { DataTable, type Row } from '@/components/DataTable'
import { getAll, getGame } from '@/lib/payload'
import { sectionCopy } from '@/lib/section-copy'
import type { Region } from '@/payload-types'

type Props = { params: Promise<{ game: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { game: slug } = await params
  const [game, enemies] = await Promise.all([
    getGame(slug),
    getAll('enemies', { game: slug, depth: 0 }),
  ])
  const copy = sectionCopy('enemies', game, { total: enemies.length })
  return {
    title: copy.title,
    description: copy.description,
    alternates: { canonical: '/enemies' },
  }
}

export default async function EnemiesIndex({ params }: Props) {
  const { game: slug } = await params
  const [game, enemies] = await Promise.all([
    getGame(slug),
    getAll('enemies', { game: slug, depth: 1 }),
  ])
  const copy = sectionCopy('enemies', game, { total: enemies.length })
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
        art={sectionArt(slug, 'enemies')}
        eyebrow="Database"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Enemies' }]}
        icon="skull"
        title={copy.heading}
        lede={copy.lede}
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

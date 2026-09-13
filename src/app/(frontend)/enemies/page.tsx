import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'
import { sectionArt } from '@/lib/art'
import { getAll } from '@/lib/payload'
import type { Enemy, Region } from '@/payload-types'

export const metadata: Metadata = {
  title: 'Enemies and bosses',
  description:
    'Every enemy and boss in The Blood of Dawnwalker, what they are weak to, and where you meet them.',
  alternates: { canonical: '/enemies' },
}

export default async function EnemiesIndex() {
  const enemies = await getAll<Enemy>('enemies', { depth: 1 })
  const bosses = enemies.filter((enemy) => enemy.isBoss)
  const rest = enemies.filter((enemy) => !enemy.isBoss)

  const table = (rows: Enemy[]) => (
    <div className="tablewrap">
      <table>
        <thead>
          <tr>
            <th>Enemy</th>
            <th>Region</th>
            <th>Met during</th>
            <th>Weak to</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((enemy) => {
            const region = typeof enemy.region === 'object' ? (enemy.region as Region) : null
            return (
              <tr key={enemy.id}>
                <td>
                  <Link href={`/enemies/${enemy.slug}`}>{enemy.title}</Link>
                </td>
                <td>{region ? <Link href={`/regions/${region.slug}`}>{region.title}</Link> : '—'}</td>
                <td>{enemy.phase === 'either' ? 'Day or night' : enemy.phase}</td>
                <td>{enemy.weaknesses?.map((w) => w.value).join(', ') || '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

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
        {enemies.length === 0 ? <p className="note">Nothing catalogued yet.</p> : null}
        {bosses.length > 0 ? (
          <section className="section">
            <div className="section-head">
              <h2>Bosses</h2>
              <span className="eyebrow">{bosses.length}</span>
            </div>
            {table(bosses)}
          </section>
        ) : null}
        {rest.length > 0 ? (
          <section className="section">
            <div className="section-head">
              <h2>Everything else</h2>
              <span className="eyebrow">{rest.length}</span>
            </div>
            {table(rest)}
          </section>
        ) : null}
      </div>
    </>
  )
}

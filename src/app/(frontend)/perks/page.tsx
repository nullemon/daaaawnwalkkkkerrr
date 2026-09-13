import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/Badges'
import { getAll } from '@/lib/payload'
import type { Perk, SkillTree } from '@/payload-types'

export const metadata: Metadata = {
  title: 'Every perk, across all three trees',
  description:
    'All known perks in The Blood of Dawnwalker — Swordmastery, Witchcraft and Vampirism — with what each one does and which are the nine ultimates.',
  alternates: { canonical: '/perks' },
}

export default async function PerksIndex() {
  const perks = await getAll<Perk>('perks', { depth: 1, sort: 'title' })
  const ultimates = perks.filter((perk) => perk.isUltimate)

  return (
    <>
      <PageHeader
        eyebrow="Database"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Perks' }]}
        title="Perks"
        lede={`${perks.length} perks catalogued, ${ultimates.length} of them ultimates. You may take one ultimate per tree, so picking any of the nine closes two others.`}
      />
      <div className="page body-main">
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Perk</th>
                <th>Tree</th>
                <th>Effect</th>
                <th className="num">Segments</th>
              </tr>
            </thead>
            <tbody>
              {perks.map((perk) => {
                const tree = typeof perk.tree === 'object' ? (perk.tree as SkillTree) : null
                return (
                  <tr key={perk.id}>
                    <td>
                      {perk.isUltimate ? <span title="Ultimate">★ </span> : null}
                      <Link href={`/perks/${perk.slug}`}>{perk.title}</Link>
                    </td>
                    <td>{tree ? <Link href={`/skills/${tree.slug}`}>{tree.title}</Link> : '—'}</td>
                    <td>{perk.effect ?? '—'}</td>
                    <td className="num">
                      {typeof perk.timeCostSegments === 'number' ? perk.timeCostSegments : 'unknown'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="callout">
          <h3>Plan a full build</h3>
          <p>
            The <Link href="/tools/build-planner">build planner</Link> enforces one ultimate per
            tree, totals what a spec costs in segments, and gives you a link to share.
          </p>
        </div>
      </div>
    </>
  )
}

import type { Metadata } from 'next'
import { PageHeader } from '@/components/PageHeader'
import { EntityCard } from '@/components/EntityCard'
import { Badge, PhaseBadge } from '@/components/Badges'
import { getAll } from '@/lib/payload'
import type { Perk, SkillTree } from '@/payload-types'

export const metadata: Metadata = {
  title: 'Skill trees and perks',
  description:
    'Swordmastery, Witchcraft and Vampirism — the three skill trees of The Blood of Dawnwalker, their ultimate perks, and what each costs in segments.',
  alternates: { canonical: '/skills' },
}

export default async function SkillsIndex() {
  const [trees, perks] = await Promise.all([
    getAll<SkillTree>('skill-trees', { depth: 0 }),
    getAll<Perk>('perks', { depth: 1 }),
  ])

  return (
    <>
      <PageHeader
        eyebrow="Database"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Skills' }]}
        icon="spark"
        title="Skill trees"
        lede="Three trees split by phase. Each has three ultimate perks and you may take only one per tree, so nine exist and three are reachable in a run."
      />
      <div className="page body-main">
        <div className="grid">
          {trees.map((tree) => (
            <EntityCard
              key={tree.id}
              href={`/skills/${tree.slug}`}
              title={tree.title}
              summary={tree.summary}
              badges={
                <>
                  <PhaseBadge phase={tree.phase} />
                  {tree.gatedByCorruption ? <Badge>Corruption-gated</Badge> : null}
                </>
              }
            />
          ))}
        </div>
        <section className="section">
          <div className="section-head">
            <h2>Ultimate perks</h2>
            <span className="eyebrow">One per tree</span>
          </div>
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
                {perks.map((perk) => (
                  <tr key={perk.id}>
                    <td>{perk.title}</td>
                    <td>{typeof perk.tree === 'object' ? perk.tree?.title : '—'}</td>
                    <td>{perk.effect}</td>
                    <td className="num">{perk.timeCostSegments ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  )
}

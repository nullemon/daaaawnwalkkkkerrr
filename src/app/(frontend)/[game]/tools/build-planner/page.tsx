import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { BuildPlanner, type PlannerPerk, type PlannerTree } from '@/components/BuildPlanner'
import { getAll } from '@/lib/payload'
import type { SkillTree } from '@/payload-types'

type Props = { params: Promise<{ game: string }> }

export const metadata: Metadata = {
  title: 'Build planner — pick perks across all three trees',
  description:
    'Plan a Blood of Dawnwalker build across Swordmastery, Witchcraft and Vampirism. Enforces one ultimate per tree, totals the segment cost, and gives you a shareable link.',
  alternates: { canonical: '/tools/build-planner' },
}

export default async function BuildPlannerPage({ params }: Props) {
  const { game } = await params
  const [perkDocs, treeDocs] = await Promise.all([
    getAll('perks', { game, depth: 1, sort: 'title' }),
    getAll('skill-trees', { game, depth: 0 }),
  ])

  const trees: PlannerTree[] = treeDocs.map((tree) => ({
    slug: tree.slug,
    title: tree.title,
    phase: tree.phase ?? 'either',
  }))

  const perks: PlannerPerk[] = perkDocs
    .filter((perk) => typeof perk.tree === 'object' && perk.tree)
    .map((perk) => {
      const tree = perk.tree as SkillTree
      return {
        id: String(perk.id),
        slug: perk.slug,
        title: perk.title,
        treeSlug: tree.slug,
        treeTitle: tree.title,
        isUltimate: Boolean(perk.isUltimate),
        cost: perk.timeCostSegments ?? 1,
        costKnown: typeof perk.timeCostSegments === 'number',
        effect: perk.effect,
        foundInWorld: Boolean(perk.foundInWorld),
      }
    })

  return (
    <>
      <PageHeader
        eyebrow="Tool"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Build planner' }]}
        title="Build planner"
        lede="Three trees, nine ultimates, one ultimate per tree. Pick your way through and share the result as a link."
      />
      <div className="page body-main">
        {/* useSearchParams renders this subtree on the client; the boundary is
            what lets the route around it stay static HTML. */}
        <Suspense fallback={<p className="note">Loading the trees…</p>}>
          <BuildPlanner perks={perks} trees={trees} />
        </Suspense>
        <div className="callout">
          <h3>Perks cost time, not just points</h3>
          <p>
            Learning a perk spends segments off the same 480 the{' '}
            <Link href="/tools/run-checker">run checker</Link> is watching. A heavy spec is a real
            line item against the quests you wanted to do, which is why the total here is worth
            looking at before you commit.
          </p>
        </div>
      </div>
    </>
  )
}

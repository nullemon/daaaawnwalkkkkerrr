import type { Metadata, ResolvingMetadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { BuildPlanner, type PlannerPerk, type PlannerTree } from '@/components/BuildPlanner'
import { getAll, getGame } from '@/lib/payload'
import type { SkillTree } from '@/payload-types'
import { requireFeature } from '@/lib/features'
import { toolCopy } from '@/lib/game-copy'
import { copy } from '@/lib/copy'
import { gameName } from '@/lib/section-copy'
import { socialMeta } from '@/lib/social'

type Props = { params: Promise<{ game: string }> }

/*
  The description shipped reading "…totals the segment cost, and gives you a."
  A sentence cut off mid-clause, in the one place a reader sees before they
  decide whether to click: the search result. Nothing errors on a truncated
  string and no test covers meta text, so it sat there. The clause it was
  missing is the shareable link, which the planner has always produced.
*/
export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { game: slug } = await params
  const doc = await getGame(slug)
  const words = toolCopy(doc)
  const tokens = { game: gameName(doc) }

  return {
    title: copy(words.buildPlannerTitle, 'Build planner — pick perks across all three trees', tokens),
    description: copy(
      words.buildPlannerDescription,
      'Plan a {game} build across Swordmastery, Witchcraft and Vampirism. Enforces one ultimate per tree, totals the segment cost, and gives you a link you can share.',
      tokens,
    ),
    alternates: { canonical: '/tools/build-planner' },
    ...(await socialMeta(parent, { path: '/tools/build-planner' })),
  }
}

export default async function BuildPlannerPage({ params }: Props) {
  const { game } = await params
  const doc = await requireFeature(game, 'build-planner')
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

  const words = toolCopy(doc)
  const tokens = { game: gameName(doc), trees: trees.length, perks: perks.length }

  return (
    <>
      <PageHeader
        eyebrow="Tool"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Build planner' }]}
        title={copy(words.buildPlannerHeading, 'Build planner', tokens)}
        lede={copy(
          words.buildPlannerLede,
          'Three trees, nine ultimates, one ultimate per tree. Pick your way through and share the result as a link.',
          tokens,
        )}
      />
      <div className="page body-main">
        {/* useSearchParams renders this subtree on the client; the boundary is
            what lets the route around it stay static HTML. */}
        <Suspense fallback={<p className="note">Loading the trees…</p>}>
          <BuildPlanner perks={perks} trees={trees} />
        </Suspense>
        <div className="callout">
          <h2>Perks cost time, not just points</h2>
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

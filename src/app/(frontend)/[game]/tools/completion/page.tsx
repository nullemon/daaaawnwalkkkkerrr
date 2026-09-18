import type { Metadata, ResolvingMetadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'
import { CompletionTracker, type TrackedAchievement } from '@/components/CompletionTracker'
import { getAll, getGame } from '@/lib/payload'
import { requireFeature } from '@/lib/features'
import { toolCopy } from '@/lib/game-copy'
import { copy } from '@/lib/copy'
import { socialMeta } from '@/lib/social'

type Props = { params: Promise<{ game: string }> }

export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { game: slug } = await params
  const [doc, achievements] = await Promise.all([
    getGame(slug),
    getAll('achievements', { game: slug, depth: 0 }),
  ])
  const name = doc?.shortTitle || doc?.title || 'this game'
  const words = toolCopy(doc)
  /* The count stays a token, so a new achievement corrects the sentence. */
  const tokens = { game: name, count: achievements.length }

  return {
    title: copy(words.completionTitle, '{game} completion tracker', tokens),
    description: copy(
      words.completionDescription,
      'Tick off the {count} achievements in {game} and see what is left, weighted by how few players have each one.',
      tokens,
    ),
    alternates: { canonical: '/tools/completion' },
    ...(await socialMeta(parent, { path: '/tools/completion' })),
  }
}

/**
 * The completion tracker.
 *
 * Gated on the `completion-tracker` feature, so a wiki whose game has no
 * published achievement list does not offer an empty tool — the same rule the
 * run checker and build planner follow.
 */
export default async function CompletionPage({ params }: Props) {
  const { game: slug } = await params
  const game = await requireFeature(slug, 'completion-tracker')

  const achievements = await getAll('achievements', { game: slug, depth: 0, limit: 1000 })
  const name = game.shortTitle || game.title

  // Primitives only: this crosses into a client component.
  const rows: TrackedAchievement[] = achievements.map((entry) => ({
    id: entry.id,
    title: entry.title,
    slug: entry.slug,
    description: entry.description ?? null,
    rarity: entry.rarity ?? null,
    globalPercent: entry.globalPercent ?? null,
    hidden: entry.hidden ?? null,
  }))

  const ultraRare = rows.filter((entry) => entry.rarity === 'ultra-rare').length

  const words = toolCopy(game)
  const tokens = { game: name, count: rows.length, ultraRare }

  return (
    <>
      <PageHeader
        eyebrow="Tool"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Completion tracker' }]}
        icon="check"
        title={copy(words.completionHeading, 'What is left?', tokens)}
        lede={copy(
          words.completionLede,
          'Tick off what you have earned in {game}. The tracker weights what remains by how few players have each one, so it tells you how much work is actually left rather than how many boxes are unticked.',
          tokens,
        )}
      />

      <div className="page body-main">
        <CompletionTracker game={slug} achievements={rows} />

        <section className="section">
          <div className="section-head">
            <h2>Why two percentages</h2>
          </div>
          <div className="prose">
            <p>
              A plain count says you are ninety-six per cent finished while you are staring at the
              five achievements that will take longer than the other hundred and thirty-six
              combined. The weighted figure fixes that: each one counts in proportion to how few
              players have it, so the last ultra-rare is worth a hundred commons.
              {ultraRare > 0
                ? ` ${name} has ${ultraRare} achievements held by fewer than one player in twenty.`
                : ''}
            </p>
            <p>
              The percentages come from the platform and move — an achievement gets commoner as
              more people finish the game. Each one&rsquo;s page records the date its figure was
              taken. <Link href="/achievements">The full list is here</Link>.
            </p>
            <p>
              How to actually earn each one is written on its own page, and only once somebody has
              done it. An empty method is an honest gap, not an oversight.
            </p>
          </div>
        </section>
      </div>
    </>
  )
}

import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'
import { RunChecker } from '@/components/RunChecker'
import { getRunGraph } from '@/lib/runData'
import { requireFeature } from '@/lib/features'

type Props = { params: Promise<{ game: string }> }

export const metadata: Metadata = {
  title: 'Run checker — which endings can you still reach?',
  description:
    'Enter your current day and the quests you have finished. Find out which of the seven endings are still reachable, which are out of time, and which you have.',
  alternates: { canonical: '/tools/run-checker' },
}

export default async function RunCheckerPage({ params }: Props) {
  const { game } = await params
  await requireFeature(game, 'run-checker')
  const { quests, endings } = await getRunGraph(game)

  return (
    <>
      <PageHeader
        eyebrow="Tool"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Run checker' }]}
        title="Can you still make it?"
        lede="Every other Dawnwalker planner builds a route from day one. This one starts from where you actually are: tell it your day and what you have finished, and it works out which endings are still on the table."
      />
      <div className="page body-main">
        <RunChecker quests={quests} endings={endings} />
        <div className="callout">
          <h2>How this works</h2>
          <p>
            A run is 480 segments — thirty days of eight daylight and eight night segments. The
            checker walks each ending&rsquo;s prerequisite chain, subtracts what you have already
            done, and compares what is left against your remaining budget. It also treats a
            completed quest that permanently excludes part of a chain as a hard lock rather than a
            time problem, because no amount of remaining time fixes that.{' '}
            <Link href="/mechanics/the-clock">More on the clock</Link>.
          </p>
        </div>
      </div>
    </>
  )
}

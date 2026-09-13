import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'
import { sectionArt } from '@/lib/art'
import { Badge, Confidence } from '@/components/Badges'
import { EntityCard } from '@/components/EntityCard'
import { RunOutlook } from '@/components/RunOutlook'
import { getAll } from '@/lib/payload'
import { getRunGraph } from '@/lib/runData'
import type { Ending } from '@/payload-types'

export const metadata: Metadata = {
  title: 'All seven endings and how each one is gated',
  description:
    'The seven endings of The Blood of Dawnwalker, sorted by what decides them: an ally questline, a choice at the finale, or the thirty-day clock.',
}

const GATE_LABEL: Record<string, string> = {
  ally: 'Gated by an ally questline',
  choice: 'Decided at the finale',
  clock: 'Decided by the clock',
}

export default async function EndingsIndex() {
  const endings = await getAll<Ending>('endings', { sort: 'title', depth: 0 })
  const byGate = (gate: string) => endings.filter((ending) => ending.gate === gate)
  // The same graph the checker and the unlock paths walk, so the readout
  // above the list cannot drift from either of them.
  const graph = await getRunGraph()

  return (
    <>
      <PageHeader
        art={sectionArt('endings')}
        eyebrow="Database"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Endings' }]}
        icon="crown"
        title="The seven endings"
        lede="Five of these are decided at the finale and cannot be lost early. Two are gated on questlines you have to finish long before you get there — those are the ones people lose without noticing."
      />
      <div className="page body-main">
        <RunOutlook quests={graph.quests} endings={graph.endings} />
        {['ally', 'choice', 'clock'].map((gate) => {
          const group = byGate(gate)
          if (!group.length) return null
          return (
            <section className="section" key={gate}>
              <div className="section-head">
                <h2>{GATE_LABEL[gate]}</h2>
                <span className="eyebrow">
                  {group.length} ending{group.length === 1 ? '' : 's'}
                </span>
              </div>
              {gate === 'ally' ? (
                <p className="note">
                  Reach the finale without the chain finished and the ending is simply not offered.
                  There is no catching up at the end.
                </p>
              ) : null}
              <div className="grid">
                {group.map((ending) => (
                  <EntityCard
                    key={ending.id}
                    href={`/endings/${ending.slug}`}
                    title={ending.title}
                    summary={ending.summary}
                    badges={
                      <>
                        {ending.isEarlyExit ? <Badge>Early exit</Badge> : null}
                        {ending.isFailure ? <Badge>Failure state</Badge> : null}
                        <Confidence level={ending.confidence} />
                      </>
                    }
                  />
                ))}
              </div>
            </section>
          )
        })}
        <div className="callout">
          <h3>Can you still reach the one you want?</h3>
          <p>
            The <Link href="/tools/run-checker">run checker</Link> compares the chain each ending
            needs against the segments you have left.
          </p>
        </div>
      </div>
    </>
  )
}

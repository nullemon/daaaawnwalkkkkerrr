import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'
import { sectionArt } from '@/lib/art'
import { Badge, Confidence } from '@/components/Badges'
import { EntityCard } from '@/components/EntityCard'
import { RunOutlook } from '@/components/RunOutlook'
import { Callout } from '@/components/Callout'
import { getAll, getGame } from '@/lib/payload'
import { sectionCopy } from '@/lib/section-copy'
import { getRunGraph } from '@/lib/runData'

type Props = { params: Promise<{ game: string }> }

/*
  A function, not a `metadata` object.

  This page exported a module-level `metadata` naming The Blood of Dawnwalker,
  so all eight wikis' ending indexes shipped the same <title> and the same
  description — eight pages competing for one search result, seven of them
  describing a game they are not about. A static export cannot read the game
  it is rendering for; that is the whole bug.
*/
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { game: slug } = await params
  const [game, endings] = await Promise.all([
    getGame(slug),
    getAll('endings', { game: slug, depth: 0 }),
  ])
  const copy = sectionCopy('endings', game, { total: endings.length })
  return {
    title: copy.title,
    description: copy.description,
    alternates: { canonical: '/endings' },
  }
}

const GATE_LABEL: Record<string, string> = {
  ally: 'Gated by an ally questline',
  choice: 'Decided at the finale',
  clock: 'Decided by the clock',
}

export default async function EndingsIndex({ params }: Props) {
  const { game } = await params
  const [doc, endings] = await Promise.all([
    getGame(game),
    getAll('endings', { game, sort: 'title', depth: 0 }),
  ])
  const copy = sectionCopy('endings', doc, { total: endings.length })

  /*
   * A section with no records is not this game's section. The rail and the
   * sitemap already derive from what a game has, so an empty index here was
   * reachable only by typing the URL - and what it served was the copy for
   * the one game that does have the section. A 404 is the honest answer.
   */
  if (endings.length === 0) notFound()
  const byGate = (gate: string) => endings.filter((ending) => ending.gate === gate)
  // The same graph the checker and the unlock paths walk, so the readout
  // above the list cannot drift from either of them.
  const graph = await getRunGraph(game)

  return (
    <>
      <PageHeader
        art={sectionArt(game, 'endings')}
        eyebrow="Database"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Endings' }]}
        icon="crown"
        title={copy.heading}
        lede={copy.lede}
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
        <Callout
          game={doc}
          where="endings-index"
          heading="Can you still reach the one you want?"
          builtIn={(doc?.features ?? []).includes('run-checker')}
        >
          <p>
            The <Link href="/tools/run-checker">run checker</Link> compares the chain each ending
            needs against the segments you have left.
          </p>
        </Callout>
      </div>
    </>
  )
}

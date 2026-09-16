import type { Metadata } from 'next'
import { PageHeader } from '@/components/PageHeader'
import { sectionArt } from '@/lib/art'
import { RunDashboard } from '@/components/RunDashboard'
import { AccountPanel } from '@/components/AccountPanel'
import { getRunGraph } from '@/lib/runData'
import { getGame } from '@/lib/payload'
import { requireFeature } from '@/lib/features'
import { toolCopy } from '@/lib/game-copy'
import { copy } from '@/lib/copy'
import { gameName } from '@/lib/section-copy'

type Props = { params: Promise<{ game: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { game: slug } = await params
  const doc = await getGame(slug)
  const words = toolCopy(doc)
  const tokens = { game: gameName(doc) }

  return {
    title: copy(words.runTitle, 'Your run', tokens),
    description: copy(
      words.runDescription,
      'Where you are in the thirty days, which endings you can still reach from here, and what to do next.',
      tokens,
    ),
    alternates: { canonical: '/run' },
  }
}

export default async function RunPage({ params }: Props) {
  const { game } = await params
  const doc = await requireFeature(game, 'run-checker')
  const graph = await getRunGraph(game)

  const words = toolCopy(doc)
  /*
    "the seven endings" was typed into this lede. Seven is a count, and a count
    in a sentence is wrong the day somebody adds an eighth - so it arrives as a
    token and the sentence corrects itself.
  */
  const tokens = { game: gameName(doc), endings: graph.endings.length }

  return (
    <>
      <PageHeader
        art={sectionArt(game, 'skills')}
        eyebrow="Your run"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Your run' }]}
        icon="hourglass"
        title={copy(words.runHeading, 'Your run', tokens)}
        lede={copy(
          words.runLede,
          'Everything you have ticked, what it costs you, and which of the {endings} endings are still open from where you actually are. Kept in this browser unless you sign in.',
          tokens,
        )}
      />
      <div className="page body-main">
        <RunDashboard quests={graph.quests} endings={graph.endings} />

        <section className="panel">
          <div className="panel-head">
            <h2>Keep this run across devices</h2>
            <span className="meta">optional</span>
          </div>
          <AccountPanel />
        </section>
      </div>
    </>
  )
}

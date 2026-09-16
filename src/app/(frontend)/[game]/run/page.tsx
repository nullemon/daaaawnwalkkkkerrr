import type { Metadata } from 'next'
import { PageHeader } from '@/components/PageHeader'
import { sectionArt } from '@/lib/art'
import { RunDashboard } from '@/components/RunDashboard'
import { AccountPanel } from '@/components/AccountPanel'
import { getRunGraph } from '@/lib/runData'
import { requireFeature } from '@/lib/features'

type Props = { params: Promise<{ game: string }> }

export const metadata: Metadata = {
  title: 'Your run',
  description:
    'Where you are in the thirty days, which endings you can still reach from here, and what to do next.',
  alternates: { canonical: '/run' },
}

export default async function RunPage({ params }: Props) {
  const { game } = await params
  await requireFeature(game, 'run-checker')
  const graph = await getRunGraph(game)

  return (
    <>
      <PageHeader
        art={sectionArt(game, 'skills')}
        eyebrow="Your run"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Your run' }]}
        icon="hourglass"
        title="Your run"
        lede="Everything you have ticked, what it costs you, and which of the seven endings are still open from where you actually are. Kept in this browser unless you sign in."
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

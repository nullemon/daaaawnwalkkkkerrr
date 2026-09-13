import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'
import { PhaseBadge } from '@/components/Badges'
import { Icon, ICON_FOR_QUEST_KIND } from '@/components/Icon'
import { getAll } from '@/lib/payload'
import type { Quest, Region } from '@/payload-types'

export const metadata: Metadata = {
  title: 'Every quest, with time cost and phase',
  description:
    'All known quests in The Blood of Dawnwalker, with day/night phase, prerequisites and segment cost where it has been confirmed.',
}

const KIND_LABELS: Record<string, string> = {
  prologue: 'Prologue',
  main: 'Main',
  ally: 'Ally questline',
  court: 'Court activity',
  side: 'Side',
  contract: 'Contract',
}

export default async function QuestIndex() {
  const quests = await getAll<Quest>('quests', { sort: 'title', depth: 1 })
  const confirmed = quests.filter((quest) => quest.time?.known).length

  return (
    <>
      <PageHeader
        eyebrow="Database"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Quests' }]}
        icon="scroll"
        title="Quests"
        lede={`${quests.length} quests catalogued. Time costs are shown only where a source actually publishes one — ${confirmed} so far. An unknown cost is not a zero cost, and we would rather leave a gap than fill it with a guess.`}
      />
      <div className="page body-main">
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Quest</th>
                <th>Kind</th>
                <th>Region</th>
                <th>Phase</th>
                <th className="num">Segments</th>
              </tr>
            </thead>
            <tbody>
              {quests.map((quest) => {
                const region = typeof quest.region === 'object' ? (quest.region as Region) : null
                const known = quest.time?.known
                return (
                  <tr key={quest.id}>
                    <td>
                      <span className="cell-name">
                        <Icon name={ICON_FOR_QUEST_KIND[quest.kind] ?? 'scroll'} size={16} className="ic" />
                        <Link href={`/quests/${quest.slug}`}>{quest.title}</Link>
                      </span>
                    </td>
                    <td>{KIND_LABELS[quest.kind] ?? quest.kind}</td>
                    <td>{region ? <Link href={`/regions/${region.slug}`}>{region.title}</Link> : '—'}</td>
                    <td>
                      <PhaseBadge phase={quest.phase} />
                    </td>
                    <td className="num">
                      {known
                        ? quest.time?.min === quest.time?.max
                          ? quest.time?.max
                          : `${quest.time?.min}–${quest.time?.max}`
                        : <span title="No source publishes this cost">unknown</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="callout">
          <h3>Why so many costs are unknown</h3>
          <p>
            Published segment costs for individual quests disagree between sites, and we have no way
            to verify them against the game. Rather than copy a number we cannot stand behind, we
            leave it blank and say so. If you know a real figure,{' '}
            <Link href="/corrections">send it in</Link> — it goes straight to our review queue.
          </p>
        </div>
      </div>
    </>
  )
}

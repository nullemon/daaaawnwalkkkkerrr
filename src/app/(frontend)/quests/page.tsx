import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'
import { sectionArt } from '@/lib/art'
import { DataTable, type Row } from '@/components/DataTable'
import { ICON_FOR_QUEST_KIND } from '@/components/Icon'
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

  // Flattened for the table, which runs in the browser and so can only be
  // handed primitives. `phase` drives the badge, `phaseLabel` the filter.
  const rows: Row[] = quests.map((quest) => {
    const region = typeof quest.region === 'object' ? (quest.region as Region) : null
    const known = quest.time?.known
    return {
      id: quest.id,
      icon: ICON_FOR_QUEST_KIND[quest.kind] ?? 'scroll',
      title: quest.title,
      titleHref: `/quests/${quest.slug}`,
      kind: KIND_LABELS[quest.kind] ?? quest.kind,
      region: region?.title ?? '',
      regionHref: region ? `/regions/${region.slug}` : '',
      phase: quest.phase ?? '',
      phaseLabel: quest.phase === 'day' ? 'Day' : quest.phase === 'night' ? 'Night' : 'Any time',
      segments: known
        ? quest.time?.min === quest.time?.max
          ? String(quest.time?.max ?? '')
          : `${quest.time?.min}–${quest.time?.max}`
        : '',
    }
  })

  return (
    <>
      <PageHeader
        art={sectionArt('quests')}
        eyebrow="Database"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Quests' }]}
        icon="scroll"
        title="Quests"
        lede={`${quests.length} quests catalogued. Time costs are shown only where a source actually publishes one — ${confirmed} so far. An unknown cost is not a zero cost, and we would rather leave a gap than fill it with a guess.`}
      />
      <div className="page body-main">
        <DataTable
          rows={rows}
          noun="quests"
          searchPlaceholder="Search 93 quests by name, kind or region…"
          facets={[
            { key: 'kind', label: 'Kind' },
            { key: 'region', label: 'Region' },
            { key: 'phaseLabel', label: 'Phase' },
          ]}
          columns={[
            { key: 'title', label: 'Quest', type: 'name' },
            { key: 'kind', label: 'Kind' },
            { key: 'region', label: 'Region', type: 'link' },
            { key: 'phase', label: 'Phase', type: 'phase', sortable: false },
            { key: 'segments', label: 'Segments', type: 'num' },
          ]}
        />
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

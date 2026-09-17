import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'
import { Callout } from '@/components/Callout'
import { sectionArt } from '@/lib/art'
import { DataTable, type Row } from '@/components/DataTable'
import { ICON_FOR_QUEST_KIND } from '@/components/Icon'
import { getAll, getGame } from '@/lib/payload'
import { sectionCopy } from '@/lib/section-copy'
import type { Region } from '@/payload-types'

type Props = { params: Promise<{ game: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { game: slug } = await params
  const [game, quests] = await Promise.all([
    getGame(slug),
    getAll('quests', { game: slug, depth: 0 }),
  ])
  const copy = sectionCopy('quests', game, { total: quests.length })
  return {
    title: copy.title,
    description: copy.description,
    alternates: { canonical: '/quests' },
  }
}

const KIND_LABELS: Record<string, string> = {
  prologue: 'Prologue',
  main: 'Main',
  ally: 'Ally questline',
  court: 'Court activity',
  side: 'Side',
  contract: 'Contract',
}

export default async function QuestIndex({ params }: Props) {
  const { game: slug } = await params
  const [game, quests] = await Promise.all([
    getGame(slug),
    getAll('quests', { game: slug, sort: 'title', depth: 1 }),
  ])
  const confirmed = quests.filter((quest) => quest.time?.known).length
  const copy = sectionCopy('quests', game, { total: quests.length, detail: confirmed })
  /** The 480-segment clock belongs to the game that has it switched on. */
  const hasClock = (game?.features ?? []).includes('run-checker')

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
        art={sectionArt(slug, 'quests')}
        eyebrow="Database"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Quests' }]}
        icon="scroll"
        title={copy.heading}
        lede={copy.lede}
      />
      <div className="page body-main">
        <DataTable
          rows={rows}
          noun="quests"
          searchPlaceholder={`Search ${quests.length} quests by name, kind or region…`}
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
            /*
              The comment below gated the Callout and left the column it is
              explaining. So the other seven wikis got a column headed with
              Dawnwalker's clock unit, empty down every row, and no explanation
              beside it — the apology was hidden and the claim was not.
            */
            ...(hasClock ? [{ key: 'segments', label: 'Segments', type: 'num' as const }] : []),
          ]}
        />
        {/*
          The Segments column, and so this explanation of why most of it is
          blank, is the 480-segment clock — which is Dawnwalker's. A wiki for a
          game with no such cost has nothing to apologise for here.
        */}
        <Callout
          game={game}
          where="quests-index"
          heading="Why so many costs are unknown"
          builtIn={hasClock}
        >
          <p>
            Published segment costs for individual quests disagree between sites, and we have no
            way to verify them against the game. Rather than copy a number we cannot stand
            behind, we leave it blank and say so. If you know a real figure,{' '}
            <Link href="/corrections">send it in</Link> — it goes straight to our review queue.
          </p>
        </Callout>
      </div>
    </>
  )
}

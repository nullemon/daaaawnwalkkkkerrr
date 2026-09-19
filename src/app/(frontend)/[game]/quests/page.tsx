import type { Metadata, ResolvingMetadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'
import { Linked } from '@/components/Linked'
import type { LinkScope } from '@/lib/link-index'
import { Callout } from '@/components/Callout'
import { sectionArt } from '@/lib/art'
import { DataTable, type Row } from '@/components/DataTable'
import { ICON_FOR_QUEST_KIND } from '@/components/Icon'
import { getAll, getGame } from '@/lib/payload'
import { getUi } from '@/lib/ui'
import { sectionCopy } from '@/lib/section-copy'
import type { Region } from '@/payload-types'
import { socialMeta } from '@/lib/social'

type Props = { params: Promise<{ game: string }> }

export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata,
): Promise<Metadata> {
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
    ...(await socialMeta(parent, { path: '/quests' })),
  }
}

export default async function QuestIndex({ params }: Props) {
  const { game: slug } = await params
  /*
    The kind labels come from the registry, not from a map in this file.

    `quest-kind.*` was declared in `lib/ui-registry.ts` with the same six words
    and nothing read it, so Site settings → Interface text offered "Ally
    questline" as editable, an editor could change it, save it, and this table
    went on saying what the local map said — the inert control the registry
    exists to stop. The words are unchanged; only where they come from is.
  */
  const [game, quests, ui] = await Promise.all([
    getGame(slug),
    getAll('quests', { game: slug, sort: 'title', depth: 1 }),
    getUi(),
  ])
  /*
    A section with no records is not this game's section.

    The rail, the footer and the sitemap all derive from `sectionsFor`, which
    returns only the sections a wiki has at least one record in — so an empty
    index here is reachable only by typing the URL or arriving from a search
    result, and what it serves is a heading over nothing. A 404 is the honest
    answer, and it lifts by itself the moment the first record arrives.

    `GUARDS_EMPTY_INDEX` in `lib/audit.ts` is pinned against this line by
    `audit.test.ts`, so the two cannot drift.
  */
  if (quests.length === 0) notFound()
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
      kind: ui.label('quest-kind', quest.kind),
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

  /*
    Where this page is, for the inline linker.

    No `self`: an index is about a section rather than about one record, so
    there is nothing on it to link to itself. The wiki's own game is still
    treated as self by `matchText`, which is what keeps a lede naming the game
    from linking to the home page the reader is already inside.
  */
  const scope: LinkScope = { host: 'wiki', game: slug }

  return (
    <>
      <PageHeader
        art={sectionArt(slug, 'quests')}
        eyebrow="Database"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Quests' }]}
        icon="scroll"
        title={copy.heading}
        lede={copy.lede ? <Linked text={copy.lede} scope={scope} /> : undefined}
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

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'
import { sectionArt } from '@/lib/art'
import { DataTable, type Row } from '@/components/DataTable'
import { Callout } from '@/components/Callout'
import { getAll, getGame } from '@/lib/payload'
import { sectionCopy } from '@/lib/section-copy'
import type { Court, Region } from '@/payload-types'

type Props = { params: Promise<{ game: string }> }

/** A function rather than a static object — see the note in `endings/page.tsx`. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { game: slug } = await params
  const [game, activities] = await Promise.all([
    getGame(slug),
    getAll('court-activities', { game: slug, depth: 0 }),
  ])
  const copy = sectionCopy('court-activities', game, { total: activities.length })
  return {
    title: copy.title,
    description: copy.description,
    alternates: { canonical: '/court-activities' },
  }
}

export default async function CourtActivitiesIndex({ params }: Props) {
  const { game } = await params
  const [doc, activities, courts] = await Promise.all([
    getGame(game),
    getAll('court-activities', { game, depth: 1, sort: 'title' }),
    getAll('courts', { game, depth: 0 }),
  ])

  /*
   * A section with no records is not this game's section. The rail and the
   * sitemap already derive from what a game has, so an empty index here was
   * reachable only by typing the URL - and what it served was the copy for
   * the one game that does have the section. A 404 is the honest answer.
   */
  if (activities.length === 0) notFound()

  const needed = courts.reduce(
    (sum, court) =>
      sum + Math.ceil(((court.activityCount ?? 0) * (court.angerThresholdPct ?? 75)) / 100),
    0,
  )
  const total = courts.reduce((sum, court) => sum + (court.activityCount ?? 0), 0)
  const copy = sectionCopy('court-activities', doc, { total: activities.length, detail: needed })

  /*
    One filterable table rather than three static ones grouped by vassal.

    Grouping read well at a glance and answered nothing: "which activities are
    in Tantari Woods" meant scanning all three tables, and "which can I do
    tonight" was not answerable at all. The court is a facet now, so the old
    grouping is still one click away and everything else is reachable too.
  */
  const rows: Row[] = activities.map((activity) => {
    const court = typeof activity.court === 'object' ? (activity.court as Court) : null
    const region = typeof activity.region === 'object' ? (activity.region as Region) : null
    return {
      id: activity.id,
      icon: 'crown',
      title: activity.title,
      titleHref: `/court-activities/${activity.slug}`,
      court: court?.title ?? '',
      courtHref: court ? `/court/${court.slug}` : '',
      region: region?.title ?? '',
      regionHref: region ? `/regions/${region.slug}` : '',
      phase: activity.phase ?? '',
      phaseLabel:
        activity.phase === 'day' ? 'Day' : activity.phase === 'night' ? 'Night' : 'Any time',
      howToStart: activity.howToStart ?? '',
    }
  })

  return (
    <>
      <PageHeader
        art={sectionArt(game, 'court-activities')}
        eyebrow="Database"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Court', href: '/court' }, { label: 'Activities' }]}
        icon="crown"
        title={copy.heading}
        lede={copy.lede}
      />
      <div className="page body-main">
        <DataTable
          rows={rows}
          noun="activities"
          searchPlaceholder={`Search ${activities.length} activities by name, court or region…`}
          facets={[
            { key: 'court', label: 'Court' },
            { key: 'region', label: 'Region' },
            { key: 'phaseLabel', label: 'Phase' },
          ]}
          columns={[
            { key: 'title', label: 'Activity', type: 'name' },
            { key: 'court', label: 'Court', type: 'link' },
            { key: 'region', label: 'Region', type: 'link' },
            { key: 'phase', label: 'Phase', type: 'phase', sortable: false },
            { key: 'howToStart', label: 'How it starts', sortable: false },
          ]}
        />

        {/*
          The other ungated Callout. Its body is the same duel threshold, and
          it ends in a hardcoded link to `/guides/are-court-activities-worth-it`
          - a Dawnwalker guide slug that 404s on any wiki that does not hold
          that guide. Gated like every other one in this tree.
        */}
        <Callout
          game={doc}
          where="court-activities-index"
          heading={`You need about ${needed} of ${total}`}
          tokens={{ needed, total, optional: total - needed }}
          builtIn={(doc?.features ?? []).includes('run-checker')}
        >
          <p>
            The duel unlocks at roughly three quarters of a vassal&rsquo;s activities, so around{' '}
            {total - needed} of these are optional. That gap is the largest single saving available
            to a run that is behind — and most walkthroughs will route you through every one
            without mentioning it.{' '}
            <Link href="/guides/are-court-activities-worth-it">Which ones to skip</Link>.
          </p>
        </Callout>
      </div>
    </>
  )
}

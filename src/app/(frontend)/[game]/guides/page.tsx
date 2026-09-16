import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'
import { sectionArt } from '@/lib/art'
import { getAll, getGame } from '@/lib/payload'
import { sectionCopy } from '@/lib/section-copy'
import type { Guide, Media } from '@/payload-types'

type Props = { params: Promise<{ game: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { game: slug } = await params
  const [game, guides] = await Promise.all([
    getGame(slug),
    getAll('guides', { game: slug, depth: 0 }),
  ])
  const copy = sectionCopy('guides', game, { total: guides.length })
  return {
    title: copy.title,
    description: copy.description,
    alternates: { canonical: '/guides' },
  }
}

/*
  Sixty-odd articles is past the point where one grid is usable, so they are
  grouped by what the reader came for. The order is the order of a run: work
  out the game, plan the route, find the place, look something up.

  Matched on slug rather than stored on the record, so adding a guide files
  itself. A slug that matches nothing lands in "Everything else", which is
  visible rather than silent — a guide nobody can find is worse than an untidy
  heading.
*/
/** The ten region slugs, so a "<region>-guide" lands in the valley group. */
const REGION_SLUGS = new Set([
  'laslea-glen',
  'briar-sloughs',
  'maragir-wealds',
  'boars-back',
  'svartrau-outskirts',
  'svartrau-city',
  'rockfalls',
  'st-tynas-grove',
  'the-slits',
  'tantari-woods',
])

const GROUPS: { heading: string; note: string; match: (slug: string) => boolean }[] = [
  {
    heading: 'Start here',
    note: 'What the game is doing, before you spend anything on it.',
    match: (slug) =>
      [
        'beginners-guide',
        'what-to-do-first',
        'how-time-works',
        'how-long-is-the-blood-of-dawnwalker',
        'is-it-worth-playing',
        'which-difficulty-to-choose',
        'prologue-guide',
        'how-many-quests',
      ].includes(slug),
  },
  {
    heading: 'Endings',
    note: 'Five are decided at the finale. Two are decided in your first fortnight.',
    match: (slug) => slug.includes('ending') || slug === 'can-you-still-reach-every-ending',
  },
  {
    heading: 'Planning your run',
    note: 'Where the 480 segments actually go, and how to stop losing them.',
    match: (slug) =>
      [
        'how-to-save-time',
        'mistakes-to-avoid',
        'missable-content-guide',
        'which-court-first',
        'are-court-activities-worth-it',
        'how-to-level-up',
        'trophy-guide',
        'new-game-plus',
        'how-to-unlock-fast-travel',
        'shrines-guide',
        'scouting-towers-guide',
      ].includes(slug),
  },
  {
    heading: 'Builds and combat',
    note: 'Three trees, nine ultimates, and one of each you may take.',
    match: (slug) =>
      slug.endsWith('-tree-guide') ||
      [
        'best-ultimate-perks',
        'how-to-perfect-block',
        'how-corruption-works',
        'corruption-explained',
        'day-or-night',
        'best-early-gear',
      ].includes(slug),
  },
  {
    heading: 'The valley',
    note: 'Ten regions, and what is filed to each of them.',
    match: (slug) => slug.endsWith('-guide') && !slug.endsWith('-tree-guide') && slug.includes('-') && REGION_SLUGS.has(slug.replace(/-guide$/, '')),
  },
  {
    heading: 'People and courts',
    note: 'The allies whose chains gate endings, and the three vassals in your way.',
    match: (slug) =>
      slug.endsWith('-court-guide') ||
      ['lacra-guide', 'crake-guide', 'anca-guide', 'brencis-guide', 'romance-guide', 'can-you-romance-everyone'].includes(slug),
  },
  {
    heading: 'Items and the world',
    note: 'Where things are, and what is worth the trip.',
    match: (slug) =>
      [
        'legendary-weapon-locations',
        'how-to-get-durandal',
        'how-to-get-hand-of-fate',
        'map-and-regions-guide',
        'infamy-explained',
      ].includes(slug),
  },
]


function GuideTile({ guide }: { guide: Guide }) {
  const image = guide.image && typeof guide.image === 'object' ? (guide.image as Media) : null
  return (
    <Link href={`/guides/${guide.slug}`} className="guidetile">
      {image?.url ? (
        <img className="guidetile-image" src={image.sizes?.card?.url ?? image.url} alt="" loading="lazy" />
      ) : null}
      <span className="guidetile-body">
        {guide.targetQuery ? <span className="eyebrow">{guide.targetQuery}</span> : null}
        <h3>{guide.title}</h3>
        {guide.summary ? <p className="note">{guide.summary}</p> : null}
      </span>
    </Link>
  )
}

export default async function GuidesIndex({ params }: Props) {
  const { game } = await params
  // depth 1 so each tile can show its own lead image rather than a wall of text.
  const guides = await getAll('guides', { game, depth: 1, sort: 'title' })

  const claimed = new Set<string>()
  const sections = GROUPS.map((group) => {
    const inGroup = guides.filter((guide) => !claimed.has(guide.slug) && group.match(guide.slug))
    inGroup.forEach((guide) => claimed.add(guide.slug))
    return { ...group, guides: inGroup }
  })
  const leftovers = guides.filter((guide) => !claimed.has(guide.slug))

  return (
    <>
      <PageHeader
        art={sectionArt(game, 'guides')}
        eyebrow="Editorial"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Guides' }]}
        icon="book"
        title="Guides"
        lede={`${guides.length} guides. One page, one question, answered properly.`}
      />
      <div className="page body-main">
        {sections.map((section) =>
          section.guides.length === 0 ? null : (
            <section className="section" key={section.heading}>
              <div className="section-head">
                <h2>{section.heading}</h2>
                <span className="eyebrow">{section.guides.length}</span>
              </div>
              <p className="note">{section.note}</p>
              <div className="guidegrid">
                {section.guides.map((guide) => (
                  <GuideTile key={guide.id} guide={guide} />
                ))}
              </div>
            </section>
          ),
        )}

        {leftovers.length > 0 ? (
          <section className="section">
            <div className="section-head">
              <h2>Everything else</h2>
              <span className="eyebrow">{leftovers.length}</span>
            </div>
            <div className="guidegrid">
              {leftovers.map((guide) => (
                <GuideTile key={guide.id} guide={guide} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </>
  )
}

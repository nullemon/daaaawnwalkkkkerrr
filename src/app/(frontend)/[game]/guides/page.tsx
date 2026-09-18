import type { Metadata, ResolvingMetadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'
import { Linked } from '@/components/Linked'
import type { LinkScope } from '@/lib/link-index'
import { sectionArt } from '@/lib/art'
import { getAll, getGame } from '@/lib/payload'
import { sectionCopy } from '@/lib/section-copy'
import { guideGroups, guideMatches } from '@/lib/game-copy'
import type { Guide, Media } from '@/payload-types'
import { socialMeta } from '@/lib/social'

type Props = { params: Promise<{ game: string }> }

export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata,
): Promise<Metadata> {
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
    ...(await socialMeta(parent, { path: '/guides' })),
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
  const [doc, guides, regions] = await Promise.all([
    getGame(game),
    getAll('guides', { game, depth: 1, sort: 'title' }),
    getAll('regions', { game, depth: 0 }),
  ])
  const copy = sectionCopy('guides', doc, { total: guides.length })

  /*
    The grouping an editor wrote, or the built-in one.

    The built-in one is Dawnwalker's: seven headings written about its run, and
    ten of its region slugs typed into a Set, applied to every wiki in the
    network. The stored form replaces that list with a question the records can
    answer — `matchRegions` asks whether a `<something>-guide` names one of
    *this* wiki's regions — so a new region files its guide without anybody
    remembering to come back here.
  */
  const regionSlugs = new Set(regions.map((region) => region.slug))
  const stored = guideGroups(doc)
  const active: { heading: string; note?: string | null; match: (slug: string) => boolean }[] =
    stored.length > 0
      ? stored.map((group) => ({
          heading: group.heading,
          note: group.note,
          match: (slug: string) => guideMatches(group, slug, regionSlugs),
        }))
      : /*
          And nothing at all for a wiki that has written none.

          `GROUPS` is Dawnwalker's: its headings say what its endings turn on
          and how its 480 segments are spent. They were being applied to every
          wiki, where `slug.includes('ending')` and the `-guide` suffix match
          enough guides to file a Silent Hill page under "Five are decided at
          the finale. Two are decided in your first fortnight." One flat list
          is the honest shape for a wiki nobody has grouped yet.
        */
        doc?.slug === 'dawnwalker'
        ? GROUPS
        : []

  const claimed = new Set<string>()
  const sections = active.map((group) => {
    const inGroup = guides.filter((guide) => !claimed.has(guide.slug) && group.match(guide.slug))
    inGroup.forEach((guide) => claimed.add(guide.slug))
    return { ...group, guides: inGroup }
  })
  const leftovers = guides.filter((guide) => !claimed.has(guide.slug))
  // "Everything else" only means something when there is something else.
  const grouped = sections.some((section) => section.guides.length > 0)

  /*
    Where this page is, for the inline linker.

    No `self`: an index is about a section rather than about one record, so
    there is nothing on it to link to itself. The wiki's own game is still
    treated as self by `matchText`, which is what keeps a lede naming the game
    from linking to the home page the reader is already inside.
  */
  const scope: LinkScope = { host: 'wiki', game }

  return (
    <>
      <PageHeader
        art={sectionArt(game, 'guides')}
        eyebrow="Editorial"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Guides' }]}
        icon="book"
        title={copy.heading}
        lede={copy.lede ? <Linked text={copy.lede} scope={scope} /> : undefined}
      />
      <div className="page body-main">
        {sections.map((section) =>
          section.guides.length === 0 ? null : (
            <section className="section" key={section.heading}>
              <div className="section-head">
                <h2>{section.heading}</h2>
                <span className="eyebrow">{section.guides.length}</span>
              </div>
              {section.note ? <p className="note">{section.note}</p> : null}
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
            {grouped ? (
              <div className="section-head">
                <h2>Everything else</h2>
                <span className="eyebrow">{leftovers.length}</span>
              </div>
            ) : null}
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

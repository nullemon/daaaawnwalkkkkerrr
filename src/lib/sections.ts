import type { IconName } from '@/components/Icon'
import type { Game } from '@/payload-types'
import { SECTION_PATH, type GameScopedCollection } from './tenancy'
import { countRecords } from './payload'
import { getUi } from './ui'

/**
 * The sections a game's wiki can have, and which of them it actually does.
 *
 * The rail and the footer both used to carry their own hardcoded list of
 * Dawnwalker's sections. That worked exactly once. With seven games it would
 * mean a Gears of War wiki whose navigation offers Court Activities and Skill
 * Trees, every link landing on an empty index — which is worse than the link
 * not being there, because an empty page reads as a broken site rather than as
 * a section that does not apply.
 *
 * So the navigation is derived from what the game has. A section appears when
 * the game has at least one record in it. Nothing to configure, nothing to
 * remember when a game's first Region is written, and no way to link to an
 * empty index.
 */

export type Section = {
  label: string
  href: string
  icon: IconName
  collection: GameScopedCollection
  /** Singular noun for one record, used as the type label in search results. */
  kind: string
  /** Sitemap priority. Higher for the pages a reader actually arrives on. */
  priority: number
}

/**
 * Fixed order, chosen to read top to bottom as a reader's journey rather than
 * alphabetically: what to do, then where, then who, then what to build.
 */
export const SECTIONS: Section[] = [
  { label: 'Quests', href: SECTION_PATH['quests'], icon: 'scroll', collection: 'quests', kind: 'Quest', priority: 0.8 },
  { label: 'Court Activities', href: SECTION_PATH['court-activities'], icon: 'crown', collection: 'court-activities', kind: 'Court activity', priority: 0.7 },
  { label: 'Endings', href: SECTION_PATH['endings'], icon: 'book', collection: 'endings', kind: 'Ending', priority: 0.9 },
  { label: 'Achievements', href: SECTION_PATH['achievements'], icon: 'star', collection: 'achievements', kind: 'Achievement', priority: 0.7 },
  { label: 'Regions', href: SECTION_PATH['regions'], icon: 'map', collection: 'regions', kind: 'Region', priority: 0.6 },
  { label: 'The Court', href: SECTION_PATH['courts'], icon: 'crown', collection: 'courts', kind: 'Court', priority: 0.7 },
  { label: 'Characters', href: SECTION_PATH['characters'], icon: 'person', collection: 'characters', kind: 'Character', priority: 0.6 },
  { label: 'Enemies', href: SECTION_PATH['enemies'], icon: 'skull', collection: 'enemies', kind: 'Enemy', priority: 0.6 },
  { label: 'Skill trees', href: SECTION_PATH['skill-trees'], icon: 'spark', collection: 'skill-trees', kind: 'Skill tree', priority: 0.6 },
  { label: 'Perks', href: SECTION_PATH['perks'], icon: 'star', collection: 'perks', kind: 'Perk', priority: 0.7 },
  { label: 'Items', href: SECTION_PATH['items'], icon: 'sword', collection: 'items', kind: 'Item', priority: 0.6 },
  { label: 'Builds', href: SECTION_PATH['builds'], icon: 'shield', collection: 'builds', kind: 'Build', priority: 0.8 },
  { label: 'Mechanics', href: SECTION_PATH['mechanics'], icon: 'spark', collection: 'mechanics', kind: 'Mechanic', priority: 0.8 },
  { label: 'Guides', href: SECTION_PATH['guides'], icon: 'book', collection: 'guides', kind: 'Guide', priority: 0.7 },
  { label: 'Maps', href: SECTION_PATH['maps'], icon: 'map', collection: 'maps', kind: 'Map', priority: 0.8 },
]

/** Tools are switched on per game rather than derived, since they are code. */
const TOOLS: Record<string, { label: string; href: string; icon: IconName }[]> = {
  'run-checker': [
    { label: 'Your run', href: '/run', icon: 'hourglass' },
    { label: 'Run checker', href: '/tools/run-checker', icon: 'hourglass' },
  ],
  'build-planner': [{ label: 'Build planner', href: '/tools/build-planner', icon: 'shield' }],
  'completion-tracker': [
    { label: 'Completion tracker', href: '/tools/completion', icon: 'check' },
  ],
}

export type SectionWithCount = Section & { count: number }

/**
 * Which sections this game has, with how many records in each.
 *
 * Thirteen `count` queries per game, cached per render. It matters that these
 * are counts and not reads: this runs in the layout, so it runs for every page
 * on the wiki, and the first version fetched every row of every collection to
 * take its length. See `countRecords`.
 */
export const sectionsFor = async (game: string): Promise<SectionWithCount[]> => {
  /*
    The labels resolve here rather than at each consumer, because there are
    four of them - the rail, the home page tiles, the directory card's chips
    and the search index's type labels - and a section named one thing in the
    rail and another in search results is the kind of small wrongness nobody
    reports and everybody notices. `SECTIONS` keeps its literals as the
    fallback, so this reads identically with an empty override table.
  */
  const ui = await getUi()
  const counted = await Promise.all(
    SECTIONS.map(async (section) => ({
      ...section,
      label: ui.label('section', section.collection, section.label),
      kind: ui.label('kind', section.collection, section.kind),
      count: await countRecords(section.collection, { game }),
    })),
  )
  return counted.filter((section) => section.count > 0)
}

/** The tool links a game has switched on. */
export const toolsFor = (game: Pick<Game, 'features'>) =>
  (game.features ?? []).flatMap((feature) => TOOLS[feature] ?? [])

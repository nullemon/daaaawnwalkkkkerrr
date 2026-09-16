import type { Game } from '@/payload-types'

/**
 * The words at the top of a section index, per game.
 *
 * Every one of these pages shipped with Dawnwalker's copy hardcoded, because
 * for a while Dawnwalker was the only wiki that had any records. It stopped
 * being true quietly: the Regions index on the Gears of War wiki listed
 * fifty-one Gears regions under the heading "Vale Sangora", titled itself
 * "All ten regions of Vale Sangora", and told the reader that travel between
 * them is free because it is the quests inside them that cost you — which is
 * Dawnwalker's segment clock, a mechanic Gears does not have. Seven wikis
 * carried it, in the <title> and the meta description as well as on the page,
 * so it was what search results said too.
 *
 * Nothing errored and no test failed, and the navigation was right the whole
 * time, because the navigation is derived and the copy was not. That is the
 * failure mode: a hardcoded sentence about one game is invisible until a
 * second game exists.
 *
 * So the specific copy is keyed to the game it was written about, and every
 * other game gets a sentence built from its own records. The generic form is
 * deliberately plain. A thin true sentence is worth more here than a rich one
 * describing somebody else's game — the same rule as leaving a field empty
 * rather than inventing a figure for it.
 *
 * This belongs in the CMS eventually, as fields on the Game, so an editor can
 * write real copy for a wiki without a deploy. It is here for now because that
 * is a schema change and this is a live bug.
 */

export type SectionCopy = {
  /** The <title>, before the layout appends "· <Game> Wiki". */
  title: string
  description: string
  /** The <h1> on the page. */
  heading: string
  lede: string
}

/** How a game refers to itself. Matches the layout's title template. */
export const gameName = (
  game: Pick<Game, 'shortTitle' | 'title'> | null | undefined,
): string => game?.shortTitle || game?.title || 'this game'

/** "1 region" / "51 regions", so a lede does not have to guess the plural. */
const plural = (n: number, one: string, many = `${one}s`): string =>
  `${n} ${n === 1 ? one : many}`

type Counts = {
  total: number
  /** Characters with a portrait; quests with a sourced segment cost. */
  detail?: number
}

type Builder = (name: string, counts: Counts) => SectionCopy

/**
 * Dawnwalker's copy, written from Dawnwalker's sources, kept verbatim. It is
 * the only game any of these sentences is true about.
 */
const DAWNWALKER: Record<string, (counts: Counts) => SectionCopy> = {
  regions: () => ({
    title: 'All ten regions of Vale Sangora',
    description:
      'Every region in The Blood of Dawnwalker, what is in it, and which vassal holds it.',
    heading: 'Vale Sangora',
    lede: 'Ten regions across roughly ten square kilometres. Travel between them is free — it is the quests inside them that cost you.',
  }),
  characters: ({ total, detail = 0 }) => ({
    title: 'Characters of Vale Sangora',
    description:
      'Allies, vassals and antagonists in The Blood of Dawnwalker, and whose questline gates which ending.',
    heading: 'Characters',
    lede: `${total} catalogued. Two of these gate endings — finish their questlines late and the ending is simply not offered. ${detail} have official portraits; the rest are waiting on art a source actually names.`,
  }),
  enemies: () => ({
    title: 'Enemies and bosses',
    description:
      'Every enemy and boss in The Blood of Dawnwalker, what they are weak to, and where you meet them.',
    heading: 'Enemies and bosses',
    lede: 'Half of what you fight, you fight as a different character. What you meet by day and what you meet by night are not the same list.',
  }),
  items: () => ({
    title: 'Legendary weapons, armour and key items',
    description:
      'The gear worth going out of your way for in The Blood of Dawnwalker, and where to find it.',
    heading: 'Items',
    lede: 'We cover the legendaries, manuals, recipes and key items rather than all 1,700-odd pickups. The rest are not worth a page and we would only be guessing at their stats.',
  }),
  quests: ({ total, detail = 0 }) => ({
    title: 'Every quest, with time cost and phase',
    description:
      'All known quests in The Blood of Dawnwalker, with day/night phase, prerequisites and segment cost where it has been confirmed.',
    heading: 'Quests',
    lede: `${total} quests catalogued. Time costs are shown only where a source actually publishes one — ${detail} so far. An unknown cost is not a zero cost, and we would rather leave a gap than fill it with a guess.`,
  }),
  mechanics: () => ({
    title: 'Game mechanics explained',
    description:
      'The systems that decide a run in The Blood of Dawnwalker: the thirty-day clock, Corruption, Infamy and the Edicts, quickslots and levelling.',
    heading: 'Mechanics',
    lede: 'The four systems that actually decide a run: the clock, Corruption, Infamy, and what you can reach in a given phase.',
  }),
  guides: ({ total }) => ({
    title: 'Guides',
    description:
      'Guides to The Blood of Dawnwalker — planning a run, reaching an ending, every region, and the decisions that cannot be undone.',
    heading: 'Guides',
    lede: `${total} guides. One page, one question, answered properly.`,
  }),
}

/**
 * What every other wiki gets: the section, the game's name, and the count of
 * what is actually in it. No claim that is not readable off the records.
 */
const GENERIC: Record<string, Builder> = {
  regions: (name, { total }) => ({
    title: `All ${plural(total, 'region')}`,
    description: `Every region catalogued for ${name}, and what is recorded in each one.`,
    heading: 'Regions',
    lede: `${plural(total, 'region')} catalogued for ${name}, with what is recorded in each one.`,
  }),
  characters: (name, { total, detail = 0 }) => ({
    title: 'Characters',
    description: `Every character catalogued for ${name}, with their role and what is known about them.`,
    heading: 'Characters',
    lede: `${total} catalogued. ${detail} have official portraits; the rest are waiting on art a source actually names.`,
  }),
  enemies: (name, { total }) => ({
    title: 'Enemies and bosses',
    description: `Every enemy and boss catalogued for ${name}, and where each one is met.`,
    heading: 'Enemies and bosses',
    lede: `${total} catalogued for ${name}, bosses and standard enemies together. Weaknesses are listed only where a source gives them.`,
  }),
  items: (name, { total }) => ({
    title: 'Items and equipment',
    description: `The items and equipment catalogued for ${name}, and where each one comes from.`,
    heading: 'Items',
    lede: `${plural(total, 'item')} catalogued for ${name}. Stats appear where a source publishes them and are left blank where none does.`,
  }),
  quests: (name, { total }) => ({
    title: 'Every quest',
    description: `All known quests in ${name}, with prerequisites and what each one leads to.`,
    heading: 'Quests',
    lede: `${plural(total, 'quest')} catalogued for ${name}, with prerequisites where a source gives them.`,
  }),
  mechanics: (name, { total }) => ({
    title: 'Game mechanics explained',
    description: `The systems that decide how ${name} plays, explained one at a time.`,
    heading: 'Mechanics',
    lede: `${plural(total, 'system')} explained, each one from what its own sources actually say about it.`,
  }),
  guides: (name, { total }) => ({
    title: 'Guides',
    description: `${plural(total, 'guide')} to ${name} — one page, one question, and a source for every answer.`,
    heading: 'Guides',
    lede: `${total} guides. One page, one question, answered properly.`,
  }),
}

/**
 * The copy for one section of one game.
 *
 * Falls back to the generic form for any game with no specific copy, which is
 * every game but Dawnwalker — and for Dawnwalker too if a section is ever
 * added here without an entry, since a plain true sentence is the safe
 * default in both directions.
 */
export const sectionCopy = (
  section: string,
  game: Pick<Game, 'slug' | 'shortTitle' | 'title'> | null | undefined,
  counts: Counts,
): SectionCopy => {
  const specific = game?.slug === 'dawnwalker' ? DAWNWALKER[section] : undefined
  if (specific) return specific(counts)

  const name = gameName(game)
  const generic = GENERIC[section]
  if (!generic) {
    return {
      title: section,
      description: `What is catalogued for ${name}.`,
      heading: section,
      lede: `${counts.total} catalogued for ${name}.`,
    }
  }
  return generic(name, counts)
}

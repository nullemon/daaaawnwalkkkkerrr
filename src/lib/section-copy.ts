import type { Game } from '@/payload-types'
import { copy } from './copy'
import { sectionRow } from './game-copy'

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
 * So there are three layers, in this order:
 *
 *   1. **What an editor wrote** — the `sectionCopy` rows on the Game record.
 *      This is the layer that was missing, and the reason the note at the
 *      bottom of this file used to say "this belongs in the CMS eventually".
 *   2. **Dawnwalker's copy**, written from Dawnwalker's sources, kept verbatim
 *      and keyed to the one game any of these sentences is true about.
 *   3. **A sentence built from the game's own records** for everybody else.
 *      Deliberately plain: a thin true sentence is worth more here than a rich
 *      one describing somebody else's game.
 *
 * Counts are never part of layers 1 or 2 as literals. An editable string
 * carries `{count}` and `{detail}` and the numbers arrive at render time,
 * because a sentence claiming a figure the database has outgrown is the exact
 * failure this project refuses everywhere else. See `src/lib/copy.ts`.
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
  /**
   * The section's second number, where it has one: characters with a portrait,
   * quests with a sourced segment cost, perks that are ultimates, activities
   * a court actually holds. Rendered as `{detail}`.
   */
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

  /*
    The eight below were not here, and the pages they belong to were worse off
    than the seven above: they exported a module-level `metadata` object rather
    than a `generateMetadata` function, so their <title> and description were
    byte-identical on all eight wikis. Eight pages competing for one result
    with the same words, seven of them describing a game they are not about —
    an active cannibalisation bug rather than only an editability gap.
  */
  endings: () => ({
    title: 'All seven endings and how each one is gated',
    description:
      'The seven endings of The Blood of Dawnwalker, sorted by what decides them: an ally questline, a choice at the finale, or the thirty-day clock.',
    heading: 'The seven endings',
    lede: 'Five of these are decided at the finale and cannot be lost early. Two are gated on questlines you have to finish long before you get there — those are the ones people lose without noticing.',
  }),
  courts: ({ detail = 0 }) => ({
    title: 'The three courts and their Court Activities',
    description:
      'Ambrus, Bakir and Xanthe — the three vassal courts of The Blood of Dawnwalker, their 41 Court Activities, and how much of each court you actually need to clear.',
    heading: 'The Court',
    lede: `After the prologue there is no linear main quest. Progression is ${detail} Court Activities across three vassals — anger each of them enough and they will meet you in a duel.`,
  }),
  'court-activities': ({ total }) => ({
    title: 'All Court Activities',
    description:
      'Every Court Activity in The Blood of Dawnwalker — filter by vassal, region and phase, and see how many of each court you actually need.',
    heading: 'Court Activities',
    lede: `${total} catalogued. These are the real main quest after the prologue — anger a vassal enough and they meet you in a duel. You do not need to clear them all.`,
  }),
  perks: ({ total, detail = 0 }) => ({
    title: 'Every perk, across all three trees',
    description:
      'All known perks in The Blood of Dawnwalker — Swordmastery, Witchcraft and Vampirism — with what each one does and which are the nine ultimates.',
    heading: 'Perks',
    lede: `${total} perks catalogued, ${detail} of them ultimates. You may take one ultimate per tree, so picking any of the nine closes two others.`,
  }),
  'skill-trees': () => ({
    title: 'Skill trees and perks',
    description:
      'Swordmastery, Witchcraft and Vampirism — the three skill trees of The Blood of Dawnwalker, their ultimate perks, and what each costs in segments.',
    heading: 'Skill trees',
    lede: 'Three trees split by phase. Each has three ultimate perks and you may take only one per tree, so nine exist and three are reachable in a run.',
  }),
  builds: () => ({
    title: 'Builds — day, night and hybrid',
    description:
      'Character builds for The Blood of Dawnwalker across Swordmastery, Witchcraft and Vampirism, with the perks and gear each one needs.',
    heading: 'Builds',
    lede: 'Coen is two characters sharing a body, so a build is really a decision about which half of the clock you intend to fight in. Each of these says which, and what it costs you in the other.',
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
    /*
      "the rest are waiting on art a source actually names" was unconditional,
      so Silent Hill: Townfall - 5 characters, 5 portraits - promised a rest
      that does not exist. A sentence about records the wiki does not hold is
      the same class of false claim as a figure nobody published, and it is
      the state nobody looks at: a section small enough to be complete.

      `${detail} have` also had no singular, which lands the first time a wiki
      has exactly one portrait.
    */
    lede:
      detail < total
        ? `${total} catalogued. ${
            detail === 1 ? '1 has an official portrait' : `${detail} have official portraits`
          }; the rest are waiting on art a source actually names.`
        : `${total} catalogued, every one with an official portrait.`,
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

  // The eight that had no generic form at all, because they had no per-game
  // form either — see the note in DAWNWALKER above.
  endings: (name, { total }) => ({
    title: `All ${plural(total, 'ending')}`,
    description: `Every ending catalogued for ${name}, and what each one turns on.`,
    heading: 'Endings',
    lede: `${plural(total, 'ending')} catalogued for ${name}, with what decides each one where a source says.`,
  }),
  courts: (name, { total }) => ({
    title: 'Courts',
    description: `The courts catalogued for ${name}, and what each one holds.`,
    heading: 'Courts',
    lede: `${plural(total, 'court')} catalogued for ${name}.`,
  }),
  'court-activities': (name, { total }) => ({
    title: 'Court activities',
    description: `Every court activity catalogued for ${name}, filterable by court, region and phase.`,
    heading: 'Court activities',
    lede: `${total} catalogued for ${name}.`,
  }),
  perks: (name, { total, detail = 0 }) => ({
    title: 'Perks',
    description: `Every perk catalogued for ${name}, with what each one does.`,
    heading: 'Perks',
    lede: detail
      ? `${plural(total, 'perk')} catalogued for ${name}, ${detail} of them ultimates.`
      : `${plural(total, 'perk')} catalogued for ${name}.`,
  }),
  'skill-trees': (name, { total }) => ({
    title: 'Skill trees',
    description: `The skill trees catalogued for ${name}, and the perks on each.`,
    heading: 'Skill trees',
    lede: `${plural(total, 'skill tree')} catalogued for ${name}.`,
  }),
  builds: (name, { total }) => ({
    title: 'Builds',
    description: `Character builds for ${name}, with the perks and gear each one needs.`,
    heading: 'Builds',
    lede: `${plural(total, 'build')} published for ${name}.`,
  }),
  achievements: (name, { total, detail = 0 }) => ({
    /*
      The one section whose copy has to change shape rather than wording.
      Four of the eight games are not out yet, and an achievement list is the
      one thing that genuinely does not exist before release — "All 0
      achievements" would be a broken-looking page rather than an honest one.
    */
    title: total > 0 ? `All ${total} achievements` : 'Achievements',
    description:
      total === 0
        ? `No achievement list has been published for ${name} yet. This page fills itself in when the developer publishes one.`
        : [
            `Every achievement in ${name}, with the share of players who have unlocked each one.`,
            // Only worth a sentence when there is a number in it. "0 are held
            // by fewer than one player in twenty" is worse than silence.
            detail > 0 ? `${detail} are held by fewer than one player in twenty.` : '',
          ]
            .filter(Boolean)
            .join(' '),
    heading: 'Achievements',
    lede:
      total === 0
        ? `No achievement list has been published for ${name} yet. Developers usually add one at launch; this page fills itself in when they do.`
        : [
            `All ${total} of them, rarest first, with the share of owners who have each one.`,
            detail > 0 ? `${detail} are held by fewer than one player in twenty.` : '',
          ]
            .filter(Boolean)
            .join(' '),
  }),
  factions: (name, { total, detail = 0 }) => ({
    title: 'Factions and organisations',
    description: `The armies, governments and organisations catalogued for ${name}, and who belongs to each.`,
    heading: 'Factions',
    lede: detail
      ? `${plural(total, 'organisation')} catalogued for ${name}, ${detail} of them with their own sourced article. The rest are compiled from the infoboxes that name them.`
      : `${plural(total, 'organisation')} catalogued for ${name}, compiled from the infoboxes that name them.`,
  }),
  maps: (name, { total }) => ({
    title: `${name} maps`,
    description: `Interactive maps for ${name}, with every marked location linking to what is recorded about it.`,
    heading: 'Maps',
    lede:
      total === 0
        ? `No map has been published for ${name} yet.`
        : `Every map published for ${name}, with what is marked on it linking to the record for that thing.`,
  }),
}

/** The wording before an editor has touched it: Dawnwalker's, or derived. */
const builtIn = (
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

export type CopyGame = Pick<Game, 'slug' | 'shortTitle' | 'title'> & Partial<Pick<Game, 'sectionCopy'>>

/**
 * The copy for one section of one game.
 *
 * What an editor wrote, then Dawnwalker's, then a sentence derived from the
 * records — and a blank field falls through rather than blanking the page, so
 * a half-filled row cannot delete a heading. `pnpm seed:copy` writes the
 * derived wording into the fields, which is what turns an empty admin box into
 * a live sentence somebody can improve.
 */
export const sectionCopy = (
  section: string,
  game: CopyGame | null | undefined,
  counts: Counts,
): SectionCopy => {
  const built = builtIn(section, game, counts)
  const row = sectionRow(game, section)
  if (!row) return built

  const tokens = { game: gameName(game), count: counts.total, detail: counts.detail ?? 0 }
  return {
    title: copy(row.title, built.title, tokens),
    description: copy(row.description, built.description, tokens),
    heading: copy(row.heading, built.heading, tokens),
    lede: copy(row.lede, built.lede, tokens),
  }
}

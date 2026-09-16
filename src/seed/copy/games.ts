import type { Payload } from 'payload'
import type { Game } from '../../payload-types'
import { GAME_SCOPED } from '../../lib/tenancy'
import { sectionCopy } from '../../lib/section-copy'

/**
 * Write each wiki's section-index copy into the fields that can change it.
 *
 * Run from `pnpm seed:copy`; see the header there for the rules this follows.
 *
 * ## Why the counts come back as tokens
 *
 * Several of these sentences contain a number — "93 quests catalogued", "41
 * Court Activities across three vassals". Seeding the rendered sentence would
 * freeze that number into an editable string, and the next import would make
 * the page a liar with nothing anywhere to notice it. So the built-in copy is
 * generated with sentinel counts and the sentinels are swapped for `{count}`
 * and `{detail}` on the way in. Crude, and it is the only way to get the
 * tokenised form of a sentence that is assembled by a function rather than
 * written down: the alternative is a second copy of all fifteen sections'
 * wording kept in step by hand, which is the thing this whole pass exists to
 * stop.
 *
 * ## What is deliberately not seeded
 *
 * **Callouts.** Their built-in bodies carry inline links — "the <run checker>
 * compares the chain each ending needs" — and a stored body is plain text with
 * one optional link after it, because an admin string that reaches the DOM as
 * markup is a stored-XSS hole. Seeding them would quietly demote every one of
 * those sentences. Worse, a seeded row *shows*, which would put Dawnwalker's
 * "travel is free" back on all eight wikis — the exact bug the `hide`
 * three-way exists to fix. An empty array renders the built-in note, so
 * leaving them alone is both safer and identical on screen.
 *
 * **Guide groups, except Dawnwalker's.** The built-in grouping is Dawnwalker's
 * and only Dawnwalker's; the other seven now show one flat list rather than
 * its headings, and inventing groups for a wiki nobody has read would be
 * writing content rather than seeding it.
 */

/*
  Numbers no wiki will ever have, so finding them in the output is proof they
  came from here rather than from a record.
*/
const COUNT = 424242
const DETAIL = 434343

const tokenise = (text: string): string =>
  text.split(String(COUNT)).join('{count}').split(String(DETAIL)).join('{detail}')

/** Dawnwalker's built-in guide grouping, in the shape the field stores. */
const DAWNWALKER_GROUPS: NonNullable<Game['guideGroups']> = [
  {
    heading: 'Start here',
    note: 'What the game is doing, before you spend anything on it.',
    slugs: [
      'beginners-guide',
      'what-to-do-first',
      'how-time-works',
      'how-long-is-the-blood-of-dawnwalker',
      'is-it-worth-playing',
      'which-difficulty-to-choose',
      'prologue-guide',
      'how-many-quests',
    ].join('\n'),
  },
  {
    heading: 'Endings',
    note: 'Five are decided at the finale. Two are decided in your first fortnight.',
    contains: 'ending',
    slugs: 'can-you-still-reach-every-ending',
  },
  {
    heading: 'Planning your run',
    note: 'Where the 480 segments actually go, and how to stop losing them.',
    slugs: [
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
    ].join('\n'),
  },
  {
    heading: 'Builds and combat',
    note: 'Three trees, nine ultimates, and one of each you may take.',
    endsWith: '-tree-guide',
    slugs: [
      'best-ultimate-perks',
      'how-to-perfect-block',
      'how-corruption-works',
      'corruption-explained',
      'day-or-night',
      'best-early-gear',
    ].join('\n'),
  },
  {
    heading: 'The valley',
    note: 'Ten regions, and what is filed to each of them.',
    /*
      A question the records answer, rather than the ten region slugs that were
      typed into the page. A new region files its guide without anybody
      remembering to come back here, and the rule reads correctly on a wiki
      with fifty-one regions as well as on one with ten.
    */
    matchRegions: true,
  },
  {
    heading: 'People and courts',
    note: 'The allies whose chains gate endings, and the three vassals in your way.',
    endsWith: '-court-guide',
    slugs: [
      'lacra-guide',
      'crake-guide',
      'anca-guide',
      'brencis-guide',
      'romance-guide',
      'can-you-romance-everyone',
    ].join('\n'),
  },
  {
    heading: 'Items and the world',
    note: 'Where things are, and what is worth the trip.',
    slugs: [
      'legendary-weapon-locations',
      'how-to-get-durandal',
      'how-to-get-hand-of-fate',
      'map-and-regions-guide',
      'infamy-explained',
    ].join('\n'),
  },
]

const seed = async (payload: Payload): Promise<number> => {
  const games = await payload.find({ collection: 'games', limit: 100, depth: 0, sort: 'slug' })
  let filled = 0

  for (const game of games.docs as unknown as Game[]) {
    const existing = game.sectionCopy ?? []
    const rows = [...existing]
    let touched = false

    for (const section of GAME_SCOPED) {
      /*
        Only sections this wiki actually has. A row for a section with no
        records is a row nobody will ever see the effect of, and fifteen of
        them on a wiki with six sections buries the six that matter.
      */
      const count = await payload.count({
        collection: section,
        where: { game: { equals: game.id } },
      })
      if (count.totalDocs === 0) continue
      if (rows.some((row) => row.section === section)) continue

      const built = sectionCopy(section, { ...game, sectionCopy: [] }, {
        total: COUNT,
        detail: DETAIL,
      })
      rows.push({
        section,
        title: tokenise(built.title),
        description: tokenise(built.description),
        heading: tokenise(built.heading),
        lede: tokenise(built.lede),
      })
      filled += 4
      touched = true
    }

    const needsGroups = game.slug === 'dawnwalker' && (game.guideGroups ?? []).length === 0
    if (needsGroups) filled += DAWNWALKER_GROUPS.length

    if (!touched && !needsGroups) continue

    await payload.update({
      collection: 'games',
      id: game.id,
      data: {
        ...(touched ? { sectionCopy: rows } : {}),
        ...(needsGroups ? { guideGroups: DAWNWALKER_GROUPS } : {}),
      } as never,
    })
  }

  return filled
}

export default seed

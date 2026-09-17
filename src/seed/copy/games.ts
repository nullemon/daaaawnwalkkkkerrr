import { createHash } from 'crypto'
import type { Payload } from 'payload'
import type { Game } from '../../payload-types'
import { GAME_SCOPED } from '../../lib/tenancy'
import { sectionCopy } from '../../lib/section-copy'
import { fill } from '../../lib/copy'

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
 * ## And why some sentences come back as nothing
 *
 * A sentinel can stand in for a number. It cannot stand in for a sentence that
 * changes *shape* with its number, and several of these do: `plural()` drops an
 * "s" at one, the characters lede swaps clause when every record has a
 * portrait, the achievements description drops its rarity sentence when nothing
 * is rare. Whichever branch the sentinels happened to take was frozen into the
 * database and served for ever after — "All 1 regions" on Silent Hill, "2
 * catalogued, every one with an official portrait" on a wiki with one portrait,
 * "0 are held by fewer than one player in twenty" on A Plague Tale, in the
 * `<title>` and the meta description as well as on the page. Same class of lie
 * as a frozen count, one level up, and no emptiness check finds it because the
 * sentence is complete.
 *
 * So `faithful` fills each tokenised field back in at a spread of counts and
 * compares it against what the code would have written for those counts. A
 * field that fails any of them is not seeded at all, and a blank field renders
 * the built-in — which is the only thing that can get "1 region" and "227
 * regions" both right.
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

  `DETAIL` is below `COUNT` because detail is always a subset of total — it is
  the portraits among the characters, the ultimates among the perks. It used to
  be above, which is a state no wiki can ever be in, and every sentence in
  `section-copy.ts` that asks `detail < total` answered the impossible way and
  had that answer frozen into the database. That is how seven wikis came to
  say "every one with an official portrait" over a set where most have none.
*/
const COUNT = 424242
const DETAIL = 131313

/*
  The counts a seeded template has to survive before it is written. See the
  second section of the header for what this is defending against.

  They cover every branch `section-copy.ts` takes: nothing at all, one record,
  one record that is also the whole of `detail`, a `detail` of none and a
  `detail` of most. Three digits at most, because `fill` formats through
  `toLocaleString` and a probe over 999 would compare "1,000" against the
  template's raw "1000" and refuse every field for the wrong reason.
*/
export const PROBES: { total: number; detail: number }[] = [
  { total: 0, detail: 0 },
  { total: 1, detail: 0 },
  { total: 1, detail: 1 },
  { total: 2, detail: 1 },
  { total: 9, detail: 0 },
  { total: 51, detail: 9 },
  { total: 227, detail: 137 },
]

/**
 * What this pass last wrote into a row, so it can tell its own work from an
 * editor's.
 *
 * Without it the pass has two indistinguishable states — "seeded and
 * untouched" and "an editor typed exactly this" — and has to assume the second
 * to be safe, which means a correction to `src/lib/section-copy.ts` never
 * reaches a page again once a database has been seeded. That module is the one
 * CLAUDE.md names as the fix for cross-wiki copy leakage; leaving it dead on
 * every seeded install is the worst outcome available.
 *
 * The separator is printable on purpose. It was a NUL byte for about ten
 * minutes, which `tools/no-control-characters.test.mjs` caught on its first run
 * against this file — the guard written this morning for the four regexes that
 * shipped with a backspace in them, doing its job on its author.
 */
const fingerprint = (row: { title?: string | null; description?: string | null; heading?: string | null; lede?: string | null }): string =>
  createHash('sha1')
    .update([row.title, row.description, row.heading, row.lede].map((v) => v ?? '').join(' || '))
    .digest('hex')
    .slice(0, 16)

const tokenise = (text: string): string =>
  text.split(String(COUNT)).join('{count}').split(String(DETAIL)).join('{detail}')

/**
 * The tokenised sentence, or null where freezing it would make the page lie.
 *
 * Null rather than the best available string on purpose. A blank field falls
 * through to `src/lib/section-copy.ts`, which recomputes the sentence from the
 * counts on every render and is the only thing that can get a shape right at
 * one record and at two hundred.
 */
export const faithful = (
  template: string,
  built: (counts: { total: number; detail: number }) => string,
): string | null =>
  PROBES.every((counts) => fill(template, { count: counts.total, detail: counts.detail }) === built(counts))
    ? template
    : null

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

/*
  A row written before the fingerprint existed carries no stamp, so the rule
  above leaves it alone for ever — which would freeze every section on every
  database seeded up to now, the exact problem the fingerprint was added to
  solve.

  `pnpm seed:copy --adopt` stamps those rows as this pass's own. It is opt-in
  and it is a claim: "nobody has hand-edited these". True on a database that
  has only ever been seeded, false the moment somebody has been in the admin,
  and there is no way for the code to tell — which is why it is a flag a person
  types rather than something that happens quietly on an ordinary run.
*/
const ADOPT = process.argv.includes('--adopt')

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
      /* The same game with its own overrides ignored, so this reads the code's
         wording rather than whatever a previous run of this pass wrote in. */
      const bare = { ...game, sectionCopy: [] }
      const built = sectionCopy(section, bare, { total: COUNT, detail: DETAIL })
      const fresh = {
        section,
        title: faithful(tokenise(built.title), (c) => sectionCopy(section, bare, c).title),
        description: faithful(
          tokenise(built.description),
          (c) => sectionCopy(section, bare, c).description,
        ),
        heading: faithful(tokenise(built.heading), (c) => sectionCopy(section, bare, c).heading),
        lede: faithful(tokenise(built.lede), (c) => sectionCopy(section, bare, c).lede),
      }
      const stamp = fingerprint(fresh)

      const existing = rows.findIndex((row) => row.section === section)
      if (existing >= 0) {
        const row = rows[existing]
        /*
          Refreshed only where the row is still exactly what this pass wrote.
          An editor who has changed a word owns the row from then on, and a
          row seeded before the fingerprint existed has no stamp and is left
          alone — the conservative reading of "we cannot tell".
        */
        /*
          `--adopt` re-stamps whatever it finds, not only an unstamped row.
          A stamp from an older fingerprint algorithm looks exactly like an
          editor's work — which is how this pass locked itself out of all
          sixty-four rows the first time the separator changed.
        */
        if (ADOPT && row.seeded !== fingerprint(row)) {
          rows[existing] = { ...row, seeded: fingerprint(row) }
          touched = true
          filled += 1
          continue
        }
        if (!row.seeded || row.seeded !== fingerprint(row)) continue
        if (row.seeded === stamp) continue
        rows[existing] = { ...row, ...fresh, seeded: stamp }
        filled += 4
        touched = true
        continue
      }

      rows.push({ ...fresh, seeded: stamp })
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

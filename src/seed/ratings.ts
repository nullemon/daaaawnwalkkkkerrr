import 'dotenv/config'
import { getPayload } from 'payload'
import config from '../payload.config'
import { isReleased } from '../lib/released'
import { clearWithdrawnVerdicts } from './rating-basis'

/**
 * This network's own score for each game.
 *
 *   pnpm seed:ratings
 *
 * The first opinion published anywhere on this site, and it needs saying out
 * loud: **everything else here is a sourced fact and this is not one.** A
 * rating is a judgement, it is signed, and the page prints the reasoning beside
 * the number so a reader can disagree with the argument rather than only with
 * the score.
 *
 * ## Four games, not eight
 *
 * Four of these eight are out — Dawnwalker, Onimusha, Resonance and Zero
 * Company — and four are not: Silent Hill: Townfall on 23 September 2026,
 * Control Resonant on the 24th, Gears of War: E-Day in October, Phantom Blade
 * Zero at the end of it. Only the four that have shipped are in the table.
 *
 * They were all eight. The four unreleased ones carried `basis: 'outlook'` and
 * a paragraph saying plainly that nobody had played the game, and the page
 * printed the word "outlook" under the figure. The label was honest and it was
 * not enough: the hub served Control Resonant at **8.9/10** three weeks before
 * launch, and a reader scanning eight tiles reads the figure, while a
 * screenshot of one carries the figure without the six-point word beneath it.
 * The owner's call, and the right one — **if it is not out, no score** — so the
 * option is gone from `src/fields/rating.ts` and the four outlooks are gone
 * from here. Their prose is in the history of this file if it is ever wanted
 * for something that is not a number.
 *
 * `releaseDateConfirmed` is not the test for any of this, and it is worth
 * knowing why: that flag means "the date is a date rather than a window", and
 * it is true for all eight. A confirmed date in October is still October. The
 * test is `isReleased`, below, which is the same function the site itself
 * asks — not a second copy of the rule that can drift from it.
 *
 * ## Re-runnable, and it does not overwrite
 *
 * An editor who changes a score or rewrites a rationale keeps it. This only
 * fills a game that has no rating at all, so it can sit in `db:reset` without
 * quietly reverting somebody's judgement — the same rule every other copy pass
 * follows.
 */

type Verdict = {
  score: number
  basis: 'played' | 'published'
  summary: string
  rationale: string
}

/*
  Written per game from what this network actually holds about it — its
  genre, its studio's record, its store listing, and in Dawnwalker's case our
  own database of its quests and endings. Where the reasoning rests on
  something we cannot check, the sentence says so.
*/
const VERDICTS: Record<string, Verdict> = {
  dawnwalker: {
    score: 9.2,
    basis: 'published',
    summary: 'The clock is the whole game, and almost nothing else is brave enough to do that.',
    rationale:
      'Thirty days, sixteen segments each, and when the budget is gone the story ends whether or not you were ready — two of the seven endings are lost by players who never knew they were on one. That single constraint turns every side quest into a decision instead of a chore, which is the problem open-world design has been failing to solve for fifteen years. It costs something real: a first run will miss content, and the game is not always clear about what it is charging you. Our own database is the argument for the score and against it at once, since only 15 of 93 quests have a published segment cost, and a game built on a budget it does not fully show you is asking for a trust it has not quite earned. A patch that surfaced the cost of a quest before you commit to it would move this to a 9.5.',
  },
  'onimusha-way-of-the-sword': {
    score: 8.7,
    basis: 'published',
    summary: 'Capcom remembering what it was good at, with the RE Engine doing the heavy lifting.',
    rationale:
      'A revival that understands the original was about timing rather than volume — the counter is still the whole combat system and it still feels like a held breath. The RE Engine gives it a weight the 2001 game could only imply. What keeps it off a nine is structural: it is a linear action game in a year of games that are not, and the fifty-two achievements tell the story of a fairly narrow completion path. If you never played the originals this is the best entry point that has existed; if you did, it is a careful restoration rather than a reinvention.',
  },
  'resonance-a-plague-tale-legacy': {
    score: 8.4,
    basis: 'published',
    summary: 'Asobo doing what Asobo does: a small story told with more craft than its budget suggests.',
    rationale:
      'The Plague Tale games have always been better written than their mechanics deserve, and this one leans further into that — the set pieces are quieter and the character work carries more of the load. The stealth is the weak half and always has been; it is a puzzle with one solution, and the game is at its worst when it pretends otherwise. What lifts it is that it is a deliberate seven-hour idea rather than a padded twenty-hour one, which is worth more than the score gap between this and the games above it suggests.',
  },
  'star-wars-zero-company': {
    score: 7.5,
    basis: 'published',
    summary: 'Competent XCOM in a licence that suits it — and not much that XCOM did not do first.',
    rationale:
      'Turn-based tactics built by people who clearly know the genre, and the Clone Wars setting is a better fit for squad attrition than the films ever made it look. The trouble is that it is recognisably a template: cover, overwatch, a percentage that lies to you, a squad you name and lose. It does the template well. It does not argue with it anywhere, and in a genre this well served that is the difference between a game worth playing and a game worth recommending. The licence is doing more work here than the design is.',
  },
}

async function run(): Promise<void> {
  const payload = await getPayload({ config })

  /*
    Before anything else, because a row carrying the withdrawn option refuses
    every write to its document — including the ones below. `pnpm seed` calls
    this too, and earlier, for the same reason.
  */
  const cleared = await clearWithdrawnVerdicts(payload)
  for (const entry of cleared) {
    console.log(`  removed a pre-release verdict: ${entry}`)
  }
  if (cleared.length > 0) console.log('')

  const games = await payload.find({ collection: 'games', limit: 100, depth: 0, sort: 'slug' })

  const today = new Date().toISOString().slice(0, 10)
  let written = 0

  type Row = {
    id: string | number
    slug: string
    rating?: { score?: number | null }
    releaseDate?: string | null
    releaseDateConfirmed?: boolean | null
  }

  for (const game of games.docs as unknown as Row[]) {
    /*
      The same gate the site reads, imported rather than restated. A score
      written here for a game that is not out would be stored, would survive
      `db:reset`, and would render nowhere — a row in the database that no page
      can ever show, which is the quietest kind of wrong thing to have.
    */
    if (!isReleased(game)) {
      console.log(`  ${game.slug.padEnd(32)} not out yet — no score until somebody has played it`)
      continue
    }

    const verdict = VERDICTS[game.slug]
    if (!verdict) {
      console.log(`  ${game.slug.padEnd(32)} no verdict written for this game`)
      continue
    }
    if (typeof game.rating?.score === 'number') {
      console.log(`  ${game.slug.padEnd(32)} already rated ${game.rating.score}`)
      continue
    }

    await payload.update({
      collection: 'games',
      id: game.id,
      data: {
        rating: {
          score: verdict.score,
          basis: verdict.basis,
          summary: verdict.summary,
          rationale: verdict.rationale,
          ratedOn: `${today}T12:00:00.000Z`,
        },
      } as never,
    })
    written += 1
    console.log(
      `  ${game.slug.padEnd(32)} ${verdict.score.toFixed(1)}/10  (${verdict.basis === 'played' ? 'from playing it' : 'from published material'})`,
    )
  }

  console.log(`\n${written} rated. Nothing already scored was changed.`)
  console.log('Every one of these is an opinion with its reasoning printed beside it.')
  process.exit(0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})

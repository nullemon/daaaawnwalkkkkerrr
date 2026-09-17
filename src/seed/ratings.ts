import 'dotenv/config'
import { getPayload } from 'payload'
import config from '../payload.config'

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
 * ## Why `basis` is not decoration
 *
 * Today is 17 September 2026. Four of these eight games are out — Dawnwalker,
 * Onimusha, Resonance and Zero Company — and four are not: Silent Hill:
 * Townfall on the 23rd, Control Resonant on the 24th, Gears of War: E-Day in
 * October, Phantom Blade Zero at the end of it.
 *
 * Nobody here has played any of them. So no rating carries `basis: 'played'`,
 * because that would be a lie about where the opinion came from. The four that
 * have shipped are rated from published material; the four that have not get an
 * **outlook**, which the page labels as an outlook. A score on a game nobody
 * has played is the exact thing this project refuses everywhere else, and the
 * only honest way to publish one is to say plainly what it is.
 *
 * `releaseDateConfirmed` is not the test for this, and it is worth knowing why:
 * that flag means "the date is a date rather than a window", and it is true for
 * all eight. A confirmed date in October is still October.
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
  basis: 'played' | 'published' | 'outlook'
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
  'control-resonant': {
    score: 8.9,
    basis: 'outlook',
    summary: 'Remedy has not missed in a decade, and this looks like more of what it is best at.',
    rationale:
      'An outlook, not a verdict: this is out on 24 September 2026 and nobody has played it. What is confirmed is a direct sequel in the Oldest House, the Northlight engine, and Remedy writing its own strangeness rather than somebody else’s — the studio’s record over Control and Alan Wake 2 is the strongest argument available. The risk is the one every Remedy sequel carries: the first Control was carried by a place, and a second visit to a place is a harder trick than a first. We will rate it properly when it is out and this outlook is replaced, not quietly adjusted.',
  },
  'gears-of-war-e-day': {
    score: 8.1,
    basis: 'outlook',
    summary: 'A prequel with the one story this series has always had in reserve.',
    rationale:
      'An outlook — it is out on 6 October 2026. Emergence Day is the event the whole series has been referring back to for twenty years, and telling it means a Gears game that is about losing rather than clearing rooms, which is the most interesting thing the franchise could do. Against that: The Coalition has now made three Gears games that were each technically excellent and structurally identical, and a prequel is the easiest place in the world to be reverent instead of good. The declared feature list reads like the last one. We will rate it properly at release.',
  },
  'phantom-blade-zero': {
    score: 7.9,
    basis: 'outlook',
    summary: 'The combat looks extraordinary. Everything around the combat is still unproven.',
    rationale:
      'An outlook — it is out on 28 October 2026. S-GAME has shown a kung-fu action game with a speed and a readability that very few studios manage, and if the fighting is as good in the hands as it looks, the ceiling here is high. What is unknown is everything else, and that is most of a game: the structure, the pacing, whether there is a reason to keep fighting. A studio’s first game at this scale is the least predictable thing on this list, which is what holds the number where it is rather than any doubt about the swordplay.',
  },
  'silent-hill-townfall': {
    score: 7.2,
    basis: 'outlook',
    summary: 'A new team, a short format, and a series with a worse hit rate than its reputation.',
    rationale:
      'An outlook — it is out on 23 September 2026. Screen Burn is an unproven name on this series, and Silent Hill’s record outside Team Silent is genuinely poor: for every Shattered Memories there are three the fanbase has agreed to forget. Townfall being smaller and stranger than a mainline entry is the most encouraging thing about it, because the failures have mostly come from trying to be Silent Hill 2 again. The lowest outlook on this list is a statement about the odds rather than about the work, and it is the one we most expect to be wrong.',
  },
}

async function run(): Promise<void> {
  const payload = await getPayload({ config })
  const games = await payload.find({ collection: 'games', limit: 100, depth: 0, sort: 'slug' })

  const today = new Date().toISOString().slice(0, 10)
  let written = 0

  for (const game of games.docs as unknown as { id: string | number; slug: string; rating?: { score?: number | null } }[]) {
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
      `  ${game.slug.padEnd(32)} ${verdict.score.toFixed(1)}/10  ${verdict.basis === 'outlook' ? '(outlook — not out yet)' : '(from published material)'}`,
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

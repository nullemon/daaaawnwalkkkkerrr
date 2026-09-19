import type { Payload } from 'payload'

/**
 * The verdicts written for games nobody had played, removed from the rows that
 * still hold them.
 *
 * ## What was left behind
 *
 * A score could once be published for an unreleased game as long as it carried
 * `basis: 'outlook'`, printed under the figure as the word "outlook". The hub
 * served Control Resonant at **8.9/10** three weeks before launch on the
 * strength of "Remedy has not missed in a decade", and the owner's call was
 * that the label was honest and not enough: **if it is not out, no score.**
 *
 * That decision reached the code. `src/fields/rating.ts` stopped offering the
 * option, `src/lib/verdict.ts` refuses a score for a game that is not out, and
 * `src/seed/ratings.ts` dropped the four outlooks from its table. It did not
 * reach the *database*, because a pass that upserts and never deletes leaves
 * its old output exactly where it was — the relationship `seed:prune` exists
 * to fix for guides, arriving here through a schema change instead.
 *
 * ## Why it mattered, given nothing rendered
 *
 * Nothing did render, and that is what kept it invisible. What a withdrawn
 * select value actually breaks is **writing**: Payload validates the whole
 * document, so a stored value the select no longer offers refuses every write
 * to it.
 *
 *  - `pnpm seed` died on "The following field is invalid: Our rating > Based
 *    on" at the first of the four, taking the remaining twenty-odd steps of
 *    `pnpm db:reset` with it. Only on an existing database — a fresh one
 *    creates these rows from `seed/games.ts`, which carries no rating at all,
 *    which is precisely why this survived.
 *  - an editor opening Phantom Blade Zero in the admin and changing anything
 *    at all got the same refusal, about a field they had not touched.
 *
 * ## Why the whole verdict, and not just the dead field
 *
 * Clearing `basis` alone fixes the write and breaks the decision. `outlook` is
 * load-bearing twice: it is the value the select refuses, and it is the marker
 * `verdict.ts` reads to keep a pre-release score from being *promoted* into a
 * review on the day the game ships. Blank it and the score is no longer marked
 * as anticipation — so a 7.9 written about a game nobody had played would
 * start printing at launch as this network's verdict on it. That is the
 * failure the option was removed to prevent, rebuilt out of the repair.
 *
 * Translating it to `published` is worse still: it would have this site assert
 * it rated four unplayed games on published material.
 *
 * So the verdict goes, whole. These four were written by `seed:ratings` in one
 * pass and its own docstring says their prose is kept in this repository's
 * history; `verdict.ts` keeps its `outlook` guard as the backstop for any row
 * that escapes this. Each removal is printed with its score, so a run that
 * takes something unexpected says so on the spot.
 *
 * Guarded and idempotent: it matches only the exact withdrawn value, so it is
 * a no-op on a clean database and can never touch a basis somebody chose.
 *
 * Its own module rather than a function in `seed/ratings.ts`, which is a
 * script: that file calls `run()` at the top level, so importing it from
 * `seed/run.ts` to reach one exported function would run the whole ratings
 * pass as a side effect of the import. Both scripts import this instead.
 */
export const clearWithdrawnVerdicts = async (payload: Payload): Promise<string[]> => {
  const stale = await payload.find({
    collection: 'games',
    where: { 'rating.basis': { equals: 'outlook' } },
    limit: 0,
    pagination: false,
    depth: 0,
  })

  const removed: string[] = []

  for (const game of stale.docs as unknown as {
    id: string | number
    slug: string
    rating?: { score?: number | null }
  }[]) {
    await payload.update({
      collection: 'games',
      id: game.id,
      /*
        Every field of the group, named rather than `rating: null`. Payload
        merges a partial group into the stored one, so nulling the parent is
        not reliably the same thing as emptying its children — and a half-empty
        verdict is the one outcome here that would be worse than either state.
      */
      data: {
        rating: {
          score: null,
          basis: null,
          ratedOn: null,
          summary: null,
          rationale: null,
        },
      } as never,
      depth: 0,
    })
    removed.push(`${game.slug} (${game.rating?.score ?? 'no score'})`)
  }

  return removed
}

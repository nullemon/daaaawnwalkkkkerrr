import type { Game } from '@/payload-types'
import { isReleased } from './released'

/**
 * This site's own verdict, and the gate that decides whether it may be printed.
 *
 * Split out of `ratings.ts` so it stays free of Payload's client and can be
 * unit-tested without a database — the same division `appearance.ts` has from
 * `appearance-settings.ts` and `email.ts` from `email-adapter.ts`. The reader
 * average needs a query; this does not, and the gate it holds is the one thing
 * on this network most worth a test.
 */

export type EditorialScore = {
  score: number
  /*
    No `outlook`. It is still a value the database can hold — three records
    were written while `fields/rating.ts` offered it — but it is not a value
    this type can carry, so every component that used to branch on it is now a
    compile error rather than a branch nobody notices has gone dead.
  */
  basis: 'played' | 'published' | null
  ratedOn: string | null
  summary: string | null
  rationale: string
}

/**
 * This site's own verdict, or null when it is not fit to print.
 *
 * The gate is `fields/rating.ts`'s rule, enforced here so it cannot be
 * forgotten by one of the places that renders a score: **a number with no
 * rationale does not render.** Returning null rather than a partial object
 * means a caller cannot accidentally print the score and drop the argument —
 * there is no score to print.
 *
 * ## No score before launch, at all
 *
 * The second gate, and it replaces a subtler one that did not hold. A score
 * could be published for a game nobody had played as long as it carried
 * `basis: 'outlook'`, printed beside the number as the word "outlook" — and
 * the hub was serving Control Resonant as **8.9/10** three weeks before it
 * came out, on the strength of "Remedy has not missed in a decade".
 *
 * The label was honest and it was not enough. A reader scanning eight tiles
 * reads the figure; a screenshot of that tile carries the figure and not the
 * six-point word under it; and a site whose entire argument is that it does
 * not guess had its only opinion sitting on four games it could not have an
 * opinion about. The owner's call, and the right one: **if it is not out, no
 * score.**
 *
 * So the release date decides rather than the editor. An outlook cannot be
 * published by ticking the wrong option, because there is no option — and a
 * score that was written before launch stops rendering at launch rather than
 * silently becoming a review of a game it was never based on. Somebody has to
 * play it and say so.
 *
 * The game is a required argument rather than an optional extra for the reason
 * `sectionArt` takes its game first: three components call this, and a gate one
 * of them can forget is a gate on two thirds of a site.
 */
export const editorialScore = (
  game: Pick<Game, 'rating' | 'releaseDate' | 'releaseDateConfirmed'>,
  now?: Date,
): EditorialScore | null => {
  const rating = game.rating
  if (!rating) return null

  if (!isReleased(game, now)) return null

  const score = rating.score
  const rationale = rating.rationale?.trim()
  if (typeof score !== 'number' || !Number.isFinite(score)) return null
  if (!rationale) return null

  /*
    A stored `outlook` is a rating of a game that was not out when it was
    written. The game being out now does not retroactively make it one — the
    sentence behind it is still about anticipation — so it expires rather than
    being promoted. `fields/rating.ts` no longer offers the option; this is for
    the records written while it did.

    Compared as a string on purpose. `pnpm generate:types` will drop `outlook`
    from the union the moment the select loses it, and a `===` against a value
    the type no longer admits is a compile error — which would delete the guard
    that exists precisely for the rows the type has stopped describing.
  */
  const basis: string | null = rating.basis ?? null
  if (basis === 'outlook') return null

  return {
    score,
    basis: basis as EditorialScore['basis'],
    ratedOn: rating.ratedOn ?? null,
    summary: rating.summary?.trim() || null,
    rationale,
  }
}

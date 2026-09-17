import { cache } from 'react'
import { client } from './payload'
import type { Game } from '@/payload-types'

/**
 * Two scores for a game, kept apart on purpose.
 *
 * ## Why these are not averaged into one number
 *
 * The brief for this file asked whether the editorial score and the reader
 * average should combine into a single "aggregate". They should not, and the
 * reason is not taste — a blend cannot be labelled.
 *
 * Everything `fields/rating.ts` does exists to stop the number being mistaken
 * for a fact: it is signed, it carries a `basis` (played / published material /
 * outlook), and it is dated. A reader average carries none of those. It is the
 * mean of N anonymous integers from people this site cannot identify, and its
 * own docstring in `collections/Ratings.ts` concedes that anybody with a VPN
 * can push it. Mix them and the result has no basis to print beside it, no
 * date, and no rationale — which is precisely the naked number the editorial
 * field was built to be impossible to ship.
 *
 * The weighting is worse. A fixed 50/50 blend hands three strangers half the
 * weight of a signed review on the week of launch and the entire readership
 * the same half a year later: the meaning of the number drifts with traffic
 * and nothing on the page says so. A vote-weighted blend fixes that by making
 * the editorial score fade out as votes arrive, which is a strange thing for
 * the only opinion this network publishes to do.
 *
 * So "aggregate" here means **the reader average with its vote count beside
 * it**, and the editorial score sits next to it as a separate claim. A reader
 * can do the arithmetic themselves if they want a blend; they cannot undo one.
 *
 * ## Zero votes is not zero out of ten
 *
 * `average` is `null` when nobody has voted, never `0`. This is the one bug
 * this file exists to make impossible: a game with no votes rendering as
 * "0/10" reads as a verdict, and it would appear on the four wikis for games
 * that are not out — the exact places nobody has anything to vote on yet. The
 * type is `number | null` rather than `number` so a caller that forgets has a
 * compile error rather than a libel.
 */

export type ReaderScore = {
  /** 1–10 to one decimal, or null when nobody has voted. Never 0. */
  average: number | null
  /** How many readers voted. Printed beside the average, always. */
  votes: number
}

export type EditorialScore = {
  score: number
  basis: 'played' | 'published' | 'outlook' | null
  ratedOn: string | null
  summary: string | null
  rationale: string
}

export type GameRating = {
  readers: ReaderScore
  editorial: EditorialScore | null
}

export const NO_VOTES: ReaderScore = { average: null, votes: 0 }

/**
 * The reader average, straight from the rows.
 *
 * Uncached, because `/api/rate` calls it immediately after writing a vote and
 * a memoised read would hand the voter back the total from before their own
 * click. Page rendering goes through `cachedReaderScore` below.
 *
 * One query rather than ten bucketed counts: the rows are three small columns
 * and this network will not see a game with enough votes for that to matter.
 * If one ever does, the fix is a SQL `AVG` through the adapter, not a bigger
 * limit here — `votes` would silently become "votes we happened to read".
 */
export const readerScore = async (gameId: number | string): Promise<ReaderScore> => {
  const payload = await client()
  const result = await payload.find({
    collection: 'ratings',
    where: { game: { equals: gameId } },
    depth: 0,
    pagination: false,
    limit: 0,
    /*
      `voter` is a salted hash and harmless, but there is no reason to carry
      it out of the database to compute a mean. Reading only what is used
      keeps the promise in the collection docstring literally true.
    */
    select: { score: true },
    overrideAccess: false,
  })

  const scores = result.docs
    .map((doc) => doc.score)
    .filter((score): score is number => typeof score === 'number' && Number.isFinite(score))

  if (scores.length === 0) return NO_VOTES

  const total = scores.reduce((sum, score) => sum + score, 0)
  return {
    average: Math.round((total / scores.length) * 10) / 10,
    votes: scores.length,
  }
}

/**
 * The same read, deduplicated per render.
 *
 * Keyed on the numeric id rather than the game document: React's `cache` keys
 * on argument identity, so passing an object would miss every time and a page
 * that shows the score in a header and again in a footer would query twice.
 */
export const cachedReaderScore = cache(readerScore)

/**
 * This site's own verdict, or null when it is not fit to print.
 *
 * The gate is `fields/rating.ts`'s rule, enforced here so it cannot be
 * forgotten by one of the places that renders a score: **a number with no
 * rationale does not render.** Returning null rather than a partial object
 * means a caller cannot accidentally print the score and drop the argument —
 * there is no score to print.
 */
export const editorialScore = (game: Pick<Game, 'rating'>): EditorialScore | null => {
  const rating = game.rating
  if (!rating) return null

  const score = rating.score
  const rationale = rating.rationale?.trim()
  if (typeof score !== 'number' || !Number.isFinite(score)) return null
  if (!rationale) return null

  return {
    score,
    basis: rating.basis ?? null,
    ratedOn: rating.ratedOn ?? null,
    summary: rating.summary?.trim() || null,
    rationale,
  }
}

/**
 * Both scores for one game.
 *
 * Read at build time like everything else on this site, which means the vote
 * count baked into a static page is the count as of the last deploy. That is
 * the floor, not a lie — the widget replaces it with the live figure from the
 * POST response the moment somebody votes, and `StarRating` can ask
 * `/api/rate` for a fresh one on mount where a page wants it.
 */
export const gameRating = async (game: Pick<Game, 'id' | 'rating'>): Promise<GameRating> => ({
  readers: await cachedReaderScore(game.id),
  editorial: editorialScore(game),
})

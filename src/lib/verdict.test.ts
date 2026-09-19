import { describe, expect, it } from 'vitest'
import { editorialScore } from './verdict'
import type { Game } from '@/payload-types'

/*
  The gate on the only opinion this network publishes.

  Four of these eight games are not out, and the hub was serving Control
  Resonant at 8.9/10 three weeks before launch with the word "outlook" under
  it. The label was honest and it was not enough. Both directions are pinned:
  every reason to withhold a score, and the one case where a score is fit to
  print — because a gate that never opens would take the three games that *are*
  out down with it, and nothing on the page would say why.
*/

const NOW = new Date('2026-09-18T12:00:00Z')

/** A complete, publishable rating. Each test spoils exactly one thing. */
const RATING = {
  score: 8.9,
  basis: 'played',
  ratedOn: '2026-09-05T00:00:00Z',
  summary: 'The best thing Remedy has made.',
  rationale: 'The shooting is finally as good as the writing, and the last act earns its ending.',
} as Game['rating']

const game = (over: Partial<Pick<Game, 'rating' | 'releaseDate' | 'releaseDateConfirmed'>> = {}) => ({
  rating: RATING,
  releaseDate: '2026-09-03T00:00:00Z',
  releaseDateConfirmed: true,
  ...over,
})

describe('editorialScore', () => {
  it('prints a complete rating for a game that is out', () => {
    const verdict = editorialScore(game(), NOW)
    expect(verdict?.score).toBe(8.9)
    expect(verdict?.basis).toBe('played')
    expect(verdict?.rationale).toContain('last act')
  })

  it('withholds it before launch, however good the rating is', () => {
    // Nothing is wrong with this rating except the calendar.
    expect(editorialScore(game({ releaseDate: '2026-09-24T00:00:00Z' }), NOW)).toBeNull()
  })

  it('withholds it for a game with no release date', () => {
    expect(editorialScore(game({ releaseDate: null }), NOW)).toBeNull()
  })

  it('withholds it while the date is unconfirmed', () => {
    expect(editorialScore(game({ releaseDateConfirmed: false }), NOW)).toBeNull()
  })

  it('withholds a number with no argument behind it', () => {
    // The original rule, and it still holds: a score with no rationale is the
    // thing every other site publishes and the thing a reader cannot argue
    // with.
    expect(editorialScore(game({ rating: { ...RATING, rationale: null } }), NOW)).toBeNull()
    expect(editorialScore(game({ rating: { ...RATING, rationale: '   ' } }), NOW)).toBeNull()
  })

  it('withholds an argument with no number', () => {
    expect(editorialScore(game({ rating: { ...RATING, score: null } }), NOW)).toBeNull()
  })

  it('expires a stored outlook rather than promoting it at launch', () => {
    /*
      `fields/rating.ts` no longer offers the option, so this can only arrive
      from a row written while it did. The game being out now does not make an
      outlook a review — the sentence behind it is still about anticipation —
      and the cast is the point: the union in payload-types has dropped the
      value, and the guard has to outlive the type that described it.
    */
    const stored = { ...RATING, basis: 'outlook' } as unknown as Game['rating']
    expect(editorialScore(game({ rating: stored }), NOW)).toBeNull()
  })

  it('has no rating at all when the group is empty', () => {
    expect(editorialScore(game({ rating: undefined }), NOW)).toBeNull()
  })

  it('never returns an outlook basis to a caller', () => {
    // The type says so, which is what makes the dead branches in `WikiCard`
    // compile errors rather than branches nobody notices have gone.
    const verdict = editorialScore(game(), NOW)
    expect(verdict?.basis === 'played' || verdict?.basis === 'published').toBe(true)
  })
})

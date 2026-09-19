import { describe, expect, it } from 'vitest'
import { daysSinceRelease, isReleased } from './released'

/*
  The date decides, not the editor.

  Every case here is a way of not being out, and each one used to be answered
  slightly differently by whichever component happened to ask. Both directions
  are pinned on purpose: a gate that only ever says no is as broken as one that
  only ever says yes, and this one holds back the single opinion the network
  publishes.
*/

const NOW = new Date('2026-09-18T12:00:00Z')

describe('isReleased', () => {
  it('is no without a date at all', () => {
    // Dawnwalker. Nothing sources a date, and an empty field is the absence of
    // a source rather than a claim that the game is out.
    expect(isReleased({ releaseDate: null, releaseDateConfirmed: true }, NOW)).toBe(false)
  })

  it('is no for an unconfirmed date, even one in the past', () => {
    // An expectation overtaken by the calendar is still an expectation, and
    // `directory.ts` is already printing "Expected <month>" beside it.
    expect(
      isReleased({ releaseDate: '2026-01-01T00:00:00Z', releaseDateConfirmed: false }, NOW),
    ).toBe(false)
  })

  it('is no for a confirmed date in the future', () => {
    // Control Resonant, six days out. The case this was written for.
    expect(
      isReleased({ releaseDate: '2026-09-24T00:00:00Z', releaseDateConfirmed: true }, NOW),
    ).toBe(false)
  })

  it('is yes for a confirmed date in the past', () => {
    // Onimusha, out on the third.
    expect(
      isReleased({ releaseDate: '2026-09-03T00:00:00Z', releaseDateConfirmed: true }, NOW),
    ).toBe(true)
  })

  it('treats a missing confirmation as confirmed, matching GameProfile', () => {
    // `GameProfile` reads `!== false` and `directory.ts` agrees. Only an
    // explicit false is a denial; null is simply nobody having said.
    expect(isReleased({ releaseDate: '2026-09-03T00:00:00Z', releaseDateConfirmed: null }, NOW)).toBe(
      true,
    )
  })

  it('is yes on the boundary itself', () => {
    // A game released at exactly this instant is out. The comparison is <=,
    // and this is here so nobody "tidies" it to < and moves launch by a day.
    expect(isReleased({ releaseDate: NOW.toISOString(), releaseDateConfirmed: true }, NOW)).toBe(true)
  })

  it('is no for a date that does not parse', () => {
    // Same rule as the empty field: we cannot say it is out, so we do not.
    expect(isReleased({ releaseDate: 'soon', releaseDateConfirmed: true }, NOW)).toBe(false)
  })
})

describe('daysSinceRelease', () => {
  it('is null for anything that is not out', () => {
    expect(daysSinceRelease({ releaseDate: null, releaseDateConfirmed: true }, NOW)).toBeNull()
    expect(
      daysSinceRelease({ releaseDate: '2026-09-24T00:00:00Z', releaseDateConfirmed: true }, NOW),
    ).toBeNull()
  })

  it('counts whole days, floored', () => {
    // 3 September to midday on the 18th is fifteen and a half days. The audit
    // says "released 15 days ago", never "15.5" and never 16.
    expect(
      daysSinceRelease({ releaseDate: '2026-09-03T00:00:00Z', releaseDateConfirmed: true }, NOW),
    ).toBe(15)
  })

  it('is 0 on launch day', () => {
    expect(
      daysSinceRelease({ releaseDate: '2026-09-18T00:00:00Z', releaseDateConfirmed: true }, NOW),
    ).toBe(0)
  })
})

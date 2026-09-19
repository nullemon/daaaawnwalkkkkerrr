import { describe, expect, it } from 'vitest'
import { withoutGameName } from './game-art-pool'

/**
 * Both directions, for the reason `docs/NETWORK.md` calls the Antar 4 rule: a
 * transform that is wrong in the direction of removing too much is exactly as
 * silent as one that removes too little.
 *
 * Too little and a screen reader gets "The Blood of Dawnwalker — The Blood of
 * Dawnwalker Beginner's Guide", which is what sent this here. Too much and an
 * article called "Everything Onimusha Does Differently" loses the word its
 * title is about, on 597 alt attributes, with nothing rendering any
 * differently.
 */
describe('withoutGameName', () => {
  it('drops the game name a title opens with', () => {
    expect(withoutGameName("The Blood of Dawnwalker Beginner's Guide", 'The Blood of Dawnwalker')).toBe(
      "Beginner's Guide",
    )
  })

  it('drops a separator with it', () => {
    expect(withoutGameName('Onimusha: Way of the Sword — All Bosses', 'Onimusha: Way of the Sword')).toBe(
      'All Bosses',
    )
    expect(withoutGameName('GTA 6: Every Region', 'GTA 6')).toBe('Every Region')
  })

  it('leaves a title that only mentions the game later', () => {
    expect(withoutGameName('Everything Onimusha Does Differently', 'Onimusha')).toBe(
      'Everything Onimusha Does Differently',
    )
  })

  it('does not match a longer word that starts the same way', () => {
    /*
      "Deadlock" against "Deadlocked Doors" would leave "ed Doors" if the match
      were a bare prefix. The separator requirement is what stops it, and it is
      the half most likely to be "simplified" away later.
    */
    expect(withoutGameName('Deadlocked Doors Explained', 'Deadlock')).toBe(
      'Deadlocked Doors Explained',
    )
  })

  it('keeps the title when the title is only the game name', () => {
    /* Stripping would leave an empty alt attribute, which says less than the
       game's name does. */
    expect(withoutGameName('Deadlock', 'Deadlock')).toBe('Deadlock')
  })

  it('is case-insensitive about the match but keeps the title’s own casing', () => {
    expect(withoutGameName('DEADLOCK: Hero Tier List', 'Deadlock')).toBe('Hero Tier List')
  })

  it('returns the title unchanged when there is no game name', () => {
    expect(withoutGameName('Some Guide', '')).toBe('Some Guide')
  })
})

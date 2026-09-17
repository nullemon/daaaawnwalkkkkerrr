import { describe, expect, it } from 'vitest'
import { catalogueCap } from './companies-copy'

/**
 * The heading over a company's catalogue, and the note that contradicted it.
 *
 * Twenty-nine profiles headed a table "Everything they are credited on" with
 * an eyebrow reading 60, over their own note saying "Showing 60 of 76 found."
 * The heading now reads the note, so these pin the one sentence that carries
 * the fact — the notes below are copied verbatim out of the database.
 */
describe('catalogueCap', () => {
  it('reads the sentence seed:company-games writes', () => {
    const note =
      'Compiled from the Steam store, read 2026-09-17, prices in US dollars on that date ' +
      'and the games table on Capcom at Wikipedia (CC BY-SA), read 2026-09-17. Showing 60 of 76 found.'
    expect(catalogueCap(note, 60)).toEqual({ shown: 60, found: 76 })
  })

  it('says nothing about a catalogue that is not capped', () => {
    const note = 'Compiled from the Steam store, read 2026-09-17, prices in US dollars on that date.'
    expect(catalogueCap(note, 12)).toBeNull()
  })

  it('says nothing when there is no note at all', () => {
    expect(catalogueCap(null, 12)).toBeNull()
    expect(catalogueCap(undefined, 0)).toBeNull()
  })

  /*
    A note describing some earlier state of the record. Believing it would swap
    one wrong heading for another — "Some of what they are credited on, 60 of
    76" over a table of twelve rows.
  */
  it('refuses a count that does not match the rows on the page', () => {
    expect(catalogueCap('Compiled from x. Showing 60 of 76 found.', 12)).toBeNull()
  })

  /*
    An editor who rewrites the note has taken the withdrawal out with it, and
    then nothing on the page contradicts the heading. Losing the signal is the
    honest outcome, not a gap.
  */
  it('says nothing when the sentence has been reworded away', () => {
    expect(catalogueCap('Sixty of seventy-six titles, read in September.', 60)).toBeNull()
  })
})

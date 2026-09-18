import { describe, expect, it } from 'vitest'
import { catalogueCap, catalogueOutlivesClosure } from './companies-copy'

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

/**
 * The sentence that stops a closure banner arguing with the table under it.
 *
 * `/atari-inc` printed "No longer operating (June 26, 1992)" over sixty titles
 * dated 2012 to 2026. Both halves are sourced; stacked with nothing between
 * them, the page contradicts itself.
 */
describe('catalogueOutlivesClosure', () => {
  it('is true when the catalogue carries a date after the closure', () => {
    // Atari, Inc., as it stands: a Steam catalogue of its own back numbers.
    expect(catalogueOutlivesClosure('June 26, 1992', [{ year: '2012' }, { year: '2026' }])).toBe(
      true,
    )
    expect(catalogueOutlivesClosure('2011', [{ year: '2014' }])).toBe(true)
  })

  it('is false when nothing in the catalogue postdates it', () => {
    expect(catalogueOutlivesClosure('2013', [{ year: '2011' }, { year: '2013' }])).toBe(false)
    expect(catalogueOutlivesClosure('2013', [])).toBe(false)
  })

  it('says nothing about a company that has not closed', () => {
    expect(catalogueOutlivesClosure(null, [{ year: '2026' }])).toBe(false)
    expect(catalogueOutlivesClosure('', [{ year: '2026' }])).toBe(false)
    // A `defunct` field with no year in it cannot date anything. No comparison,
    // rather than a comparison against zero.
    expect(catalogueOutlivesClosure('Dissolved', [{ year: '2026' }])).toBe(false)
  })

  it('takes the latest year a two-date field names', () => {
    /*
      989 Studios' field is "2000 (original), 2005" and its catalogue ends in
      2005. Reading the first date would put the sentence on a profile whose
      table does not need it - and the second date is the one the catalogue has
      to clear, because it is the later of the two the source gives.
    */
    expect(
      catalogueOutlivesClosure('2000 (original), 2005', [{ year: '2003' }, { year: '2005' }]),
    ).toBe(false)
    expect(catalogueOutlivesClosure('2000 (original), 2005', [{ year: '2006' }])).toBe(true)
  })

  it('ignores a row nobody dated', () => {
    expect(catalogueOutlivesClosure('2012', [{ year: null }, { year: 'TBA' }, { year: '' }])).toBe(
      false,
    )
  })
})

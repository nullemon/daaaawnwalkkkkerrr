import { describe, expect, it } from 'vitest'
import { namesCompany } from './logo-name.mjs'

/**
 * Both directions, because a logo is a claim about whose mark it is.
 *
 * Too loose and this network publishes one company's trademark on another's
 * profile — which is not a cosmetic error, it is the same class of thing as
 * putting one studio's screenshots on another studio's wiki. Too strict and a
 * hundred and sixty companies keep a blank square, which is only a gap.
 *
 * So the rejections below matter more than the acceptances, and the first of
 * them is the one that actually happened.
 */
describe('namesCompany', () => {
  it('rejects a file whose name merely contains the letters', () => {
    /*
      The real failure: with punctuation stripped, "metalgearsolid" contains
      "gears", so `.Gears` matched Metal Gear Solid's logo on the first run of
      the sweep.
    */
    expect(namesCompany('Metal Gear Solid logo 2.png', '.Gears')).toBe(false)
  })

  it('takes a logo filed under the company name', () => {
    expect(namesCompany('07th Expansion logo.svg', '07th Expansion')).toBe(true)
    expect(namesCompany('Konami logo.svg', 'Konami')).toBe(true)
  })

  it('takes the usual "<name> <year> logo" shape', () => {
    expect(namesCompany('3D Realms 2019 logo.png', '3D Realms')).toBe(true)
  })

  it('ignores case and punctuation between words', () => {
    expect(
      namesCompany('Unknown worlds entertainment logo.png', 'Unknown Worlds Entertainment'),
    ).toBe(true)
  })

  it('rejects a file that merely contains the name as a word', () => {
    /*
      The second real failure, after the first rule was added: "gears" is one
      of the words in "Shifting Gears", so word matching alone still took a
      television programme's logo for a game studio.
    */
    expect(namesCompany('Shifting Gears (20th Television) logo.svg', '.Gears')).toBe(false)
  })

  it('rejects a file whose name continues into another title', () => {
    /* A studio actually called "Gears" must not take this. */
    expect(namesCompany('Gears of War logo.svg', 'Gears')).toBe(false)
  })

  it('allows a legal suffix after the name', () => {
    expect(namesCompany('Capcom Co Ltd logo.svg', 'Capcom')).toBe(true)
  })

  it('does not match a longer company name against a shorter one', () => {
    /* "2K" and "2K Australia" are different companies, and the shorter name
       must not claim the longer one's mark. */
    expect(namesCompany('2K logo.svg', '2K Australia')).toBe(false)
  })

  it('does not let a short name claim a longer company’s file', () => {
    /* "2K Games" is not "2K", and "games" is not furniture. */
    expect(namesCompany('2K Games logo.svg', '2K')).toBe(false)
  })

  it('requires the words to open the file name', () => {
    expect(namesCompany('Games Workshop 2K logo.svg', '2K Games')).toBe(false)
  })

  it('refuses an empty company name rather than matching everything', () => {
    expect(namesCompany('Anything at all.svg', '')).toBe(false)
    expect(namesCompany('Anything at all.svg', '   ')).toBe(false)
  })
})

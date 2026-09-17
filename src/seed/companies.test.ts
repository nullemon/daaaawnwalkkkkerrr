import { describe, expect, it } from 'vitest'
import { closureYear, currentOwners, foundedValue, fromFacts, revenueValue } from './companies'

/**
 * The three refusals on a company profile, pinned in both directions.
 *
 * Each of these was live on `companies.<domain>` and each reads as a fact:
 * "AGEod is a games company founded Grenoble", `Revenue / 247.7 billion` on a
 * figure that is in yen, and "Sega is owned by Paramount Pictures", who sold
 * it in 1984. None of them errored, none of them failed a check, and all three
 * are the same failure — a value that is not what the field means, published
 * because nothing asked whether it was.
 *
 * Both directions, because a rule written to stop bad values is still a filter
 * and an over-broad one throws away the good ones just as quietly.
 */
describe('foundedValue', () => {
  it('keeps a value that opens with a year', () => {
    expect(foundedValue('1998')).toBe('1998')
    expect(foundedValue('2009 (as Tecmo Koei Holdings)')).toBe('2009 (as Tecmo Koei Holdings)')
    expect(foundedValue('1889 in Shimogyō-ku, Kyoto, Japan')).toBe('1889 in Shimogyō-ku, Kyoto, Japan')
  })

  it('keeps a value that opens with a date written out', () => {
    expect(foundedValue('June 3, 1960')).toBe('June 3, 1960')
    expect(foundedValue('June 2002 in Seoul, South Korea')).toBe('June 2002 in Seoul, South Korea')
    expect(foundedValue('January, 2000')).toBe('January, 2000')
  })

  /* AGEod, Allods Team, Wargaming and one more: the field holds a place. */
  it('reduces a value that opens with a place to the year it carries', () => {
    expect(foundedValue('Grenoble (Meylan), France (2005)')).toBe('2005')
    expect(foundedValue('Minsk (2001)')).toBe('2001')
    expect(foundedValue('Paris, France (2009)')).toBe('2009')
  })

  /*
    "16 years ago" was true in 2022. The template recomputes it on Wikipedia
    and this file freezes it, so a stored relative age is a figure that goes
    wrong on its own with nobody editing anything.
  */
  it('drops a relative age', () => {
    expect(foundedValue('September 1, 2006; 16 years ago')).toBe('September 1, 2006')
  })

  it('refuses a value with no year in it at all', () => {
    expect(foundedValue('Grenoble, France')).toBeUndefined()
    expect(foundedValue('')).toBeUndefined()
    expect(foundedValue(null)).toBeUndefined()
  })
})

describe('revenueValue', () => {
  it('keeps a figure that says which money it is in', () => {
    expect(revenueValue('¥247.7 billion')).toBe('¥247.7 billion')
    expect(revenueValue('€59.5 million (2025)')).toBe('€59.5 million (2025)')
    expect(revenueValue('US$8.0 billion (2025)')).toBe('US$8.0 billion (2025)')
    expect(revenueValue('7.53 billion USD')).toBe('7.53 billion USD')
  })

  /*
    Sega's, as it was published. An English reader supplies dollars and is out
    by a factor of about a hundred and fifty. There is nothing in the string to
    say which currency was lost, so there is nothing to recover and the row
    does not appear.
  */
  it('refuses a figure with no currency', () => {
    expect(revenueValue('247.7 billion')).toBeUndefined()
    expect(revenueValue('331.8 billion')).toBeUndefined()
  })

  it('refuses a figure with no figure in it', () => {
    /* Koei Tecmo's, live: `Revenue / billion (2023)`. */
    expect(revenueValue('billion (2023)')).toBeUndefined()
    expect(revenueValue('(2025)')).toBeUndefined()
    expect(revenueValue('¥')).toBeUndefined()
  })
})

describe('currentOwners', () => {
  /*
    Sega's parent field, in the order its article writes it: the company has
    had four owners and the profile said the second one. Nothing here dates
    them, so nothing here can choose between them.
  */
  it('reports every undated owner, so the caller claims none of them', () => {
    expect(currentOwners(['Gulf and Western', 'Paramount Pictures', 'SCSK', 'Sega Sammy Holdings'])).toHaveLength(4)
  })

  /* Paramount Pictures: two of the five carry the years they ended. */
  it('drops an owner whose article dates the end of it', () => {
    expect(
      currentOwners(['Viacom (1952–2005)', 'Viacom (2005–2019)', 'Paramount Skydance']),
    ).toEqual(['Paramount Skydance'])
  })

  /*
    A range with no end is a claim about now, so it stays — as the article's
    own title, which is what the link gave and what the slug is built from.
  */
  it('keeps an open range', () => {
    expect(currentOwners(['Sony Interactive Entertainment (2016–present)'])).toEqual([
      'Sony Interactive Entertainment (2016–present)',
    ])
  })

  it('leaves a single owner alone', () => {
    expect(currentOwners(['CyberAgent'])).toEqual(['CyberAgent'])
    expect(currentOwners([])).toEqual([])
  })
})

/**
 * The lede on a company that has closed.
 *
 * `/38-studios` read "38 Studios is a games company, founded 2006 ... and
 * based in Providence, Rhode Island" over a red closure banner and a body
 * saying the company closed in 2012. Seventy records were worded that way, and
 * because the summary is also the `<meta description>` the closure was stated
 * only where a search result cannot reach it.
 *
 * Both directions: a company still trading must not be put into the past by a
 * `defunct` field that holds nothing readable.
 */
describe('fromFacts', () => {
  const facts = {
    industry: 'Video games',
    founded: '2006',
    headquarters: 'Providence, Rhode Island',
  }

  it('leaves a trading company in the present tense', () => {
    expect(fromFacts('38 Studios', facts)).toBe(
      '38 Studios is a games company, founded 2006 and based in Providence, Rhode Island.',
    )
  })

  it('puts a closed company in the past and dates the closure', () => {
    expect(fromFacts('38 Studios', { ...facts, defunct: 'June 7, 2012' })).toBe(
      '38 Studios was a games company, founded 2006 and based in Providence, Rhode Island. It closed in 2012.',
    )
  })

  /* A close this cannot date is still a close. The banner says so either way,
     and the lede has to agree with the banner. */
  it('says a company is gone even where no year survives', () => {
    expect(fromFacts('Screen Burn', { industry: 'Video games', defunct: 'defunct' })).toBe(
      'Screen Burn was a games company. It is no longer operating.',
    )
  })

  /* `usable` refuses a value with nothing outside brackets, and a field that
     reads "(2015)" must not be the thing that closes a company down. */
  it('ignores a defunct field that carries no value', () => {
    expect(fromFacts('Capcom', { ...facts, defunct: '(2015)' })).toBe(
      'Capcom is a games company, founded 2006 and based in Providence, Rhode Island.',
    )
  })
})

describe('closureYear', () => {
  it('reads the year out of a date however it is written', () => {
    expect(closureYear('1 October 2010')).toBe('2010')
    expect(closureYear('May 28, 2003')).toBe('2003')
    expect(closureYear('2000 (2000) (original), 2005 (2005)')).toBe('2000')
  })

  it('has nothing to say about a field with no year in it', () => {
    expect(closureYear('defunct')).toBeUndefined()
    expect(closureYear(null)).toBeUndefined()
  })
})

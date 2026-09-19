import { describe, expect, it } from 'vitest'
import { gameWords, overlap, terms } from './terms'

describe('terms', () => {
  it('drops stop words, punctuation and case', () => {
    expect(terms('How Long To Beat: The Endings?')).toEqual(['beat', 'ending'])
  })

  it('drops fragments of two characters or fewer', () => {
    // "e-day" splits on the hyphen, and a bare "e" matches every title there is.
    expect(terms('Gears of War: E-Day')).toEqual(['gear', 'war', 'day'])
  })

  it('treats "game" as noise, because every wiki here is about one', () => {
    expect(terms('what kind of game is this')).toEqual(['kind', 'this'])
  })

  it('folds a plural onto its singular, so the two pages most about each other match', () => {
    expect(terms('The rarest achievements')).toContain('achievement')
    expect(terms('Every achievement')).toEqual(['achievement'])
    expect(terms('Quests and regions')).toEqual(['quest', 'region'])
  })

  it('leaves a word that merely ends in s alone', () => {
    // `this`, `bonus` and `chaos` are not plurals, and `boss` never was.
    expect(terms('this bonus chaos boss status')).toEqual([
      'this',
      'bonus',
      'chaos',
      'boss',
      'status',
    ])
  })
})

describe('gameWords', () => {
  it('collects every spelling a harvest carries', () => {
    const words = gameWords(['Resonance: A Plague Tale Legacy', 'Plague Tale'])
    expect([...words].sort()).toEqual(['legacy', 'plague', 'resonance', 'tale'])
  })
})

describe('overlap', () => {
  it('counts distinct shared words', () => {
    expect(overlap(terms('Anca romance guide'), terms('romance and companions'))).toBe(1)
  })

  it('does not double-count a word repeated on the left', () => {
    expect(overlap(['romance', 'romance'], ['romance'])).toBe(1)
  })

  /*
    The correction, pinned in the place that makes it fail rather than in a
    comment. Without the discount every article on a wiki matches every
    question asked about that game, because every question names the game —
    which is how the release-date page came to be offered as the answer to
    "how long to beat".
  */
  it('ignores the words that are only the game naming itself', () => {
    const discount = gameWords(['Resonance: A Plague Tale Legacy'])
    const question = terms('resonance a plague tale legacy how long to beat')
    const releaseDate = terms('Resonance: A Plague Tale Legacy release date')
    const howLong = terms('How long Resonance: A Plague Tale Legacy takes to beat')

    expect(overlap(question, releaseDate)).toBeGreaterThan(0)
    expect(overlap(question, releaseDate, discount)).toBe(0)
    expect(overlap(question, howLong, discount)).toBeGreaterThan(0)
  })
})

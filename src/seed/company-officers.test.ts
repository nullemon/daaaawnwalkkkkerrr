import { describe, expect, it } from 'vitest'
import {
  looksLikeName,
  readKeyPerson,
  readOfficer,
  rejoinStrayCommas,
  splitOutsideBrackets,
} from './company-officers'

/**
 * Both directions, because this pair of functions can fail either way and the
 * two failures look nothing alike.
 *
 * Too strict and a real officer is dropped — a gap, printed in the dropped
 * list, survivable. Too loose and the network publishes a page about a person
 * called "(chairman and CEO)", or a name cut down the middle of somebody's
 * surname, with a real source URL under it. Every case below is a real value
 * from a real `keyPeople` field.
 */
describe('splitOutsideBrackets', () => {
  it('splits an infobox list into one fragment per person', () => {
    expect(splitOutsideBrackets('Markus Mäki (chairman and CEO), Sam Lake (creative director)')).toEqual([
      'Markus Mäki (chairman and CEO)',
      'Sam Lake (creative director)',
    ])
  })

  it('leaves a comma that belongs to the role alone', () => {
    /* Tencent. A plain split makes a person called "Pony Ma (chairman". */
    expect(splitOutsideBrackets('Pony Ma (chairman, CEO)')).toEqual(['Pony Ma (chairman, CEO)'])
  })

  it('keeps a single name whole', () => {
    expect(splitOutsideBrackets('Haruhiro Tsujimoto (President and COO)')).toEqual([
      'Haruhiro Tsujimoto (President and COO)',
    ])
  })
})

describe('rejoinStrayCommas', () => {
  it('puts back together a name and the post a comma separated from it', () => {
    /* Take-Two Interactive, and five others write it the same way. */
    expect(rejoinStrayCommas(['Strauss Zelnick', '(chairman and CEO)'])).toEqual([
      'Strauss Zelnick (chairman and CEO)',
    ])
  })

  it('leaves a post with nobody before it alone, so it stays refused', () => {
    /* Sega's field opens with a bracket: the name never made it into the value. */
    const fragments = rejoinStrayCommas(['(chairman and CEO)', 'Shuji Utsumi (president and COO)'])
    expect(fragments).toEqual(['(chairman and CEO)', 'Shuji Utsumi (president and COO)'])
    expect(readOfficer('(chairman and CEO)')).toBeNull()
    expect(readKeyPerson('(chairman and CEO)')).toBeNull()
  })

  it('refuses to join across a fragment that already carries a bracket', () => {
    /*
      Bandai Namco Holdings: "Masaru Kawaguchi, (chairman)Yuji Asako, (president)".
      The second name is welded to the first one's post, so joining anything
      here would invent a person. All three stay dropped.
    */
    expect(rejoinStrayCommas(['Masaru Kawaguchi', '(chairman)Yuji Asako', '(president)'])).toEqual([
      'Masaru Kawaguchi',
      '(chairman)Yuji Asako',
      '(president)',
    ])
  })
})

describe('readOfficer', () => {
  it('reads a name and its post', () => {
    expect(readOfficer('Sam Lake (creative director)')).toEqual({
      name: 'Sam Lake',
      role: 'creative director',
    })
  })

  it('accepts a name carrying a lowercase particle', () => {
    /* Gameloft and 4J Studios. An uppercase-only rule dropped both. */
    expect(readOfficer('Alexandre de Rochefort (CEO)')).toEqual({
      name: 'Alexandre de Rochefort',
      role: 'CEO',
    })
    expect(readOfficer('Chris van der Kuyl (chairman)')).toEqual({
      name: 'Chris van der Kuyl',
      role: 'chairman',
    })
  })

  it('keeps years in the role, where the source put them', () => {
    expect(readOfficer('Jennifer MacLean (CEO; 2009–2012)')).toEqual({
      name: 'Jennifer MacLean',
      role: 'CEO; 2009–2012',
    })
  })

  it('refuses a digit in the name', () => {
    expect(readOfficer('Sega Fave 2 (president)')).toBeNull()
  })

  it('refuses a second bracketed phrase, because neither one is clearly the post', () => {
    /* 1C Company. Which bracket is the job and which is a date? Nobody can say. */
    expect(readOfficer('Boris Nuraliev (Founder & CEO) (1991–)')).toBeNull()
  })

  it('refuses an unbalanced value rather than guessing where it ends', () => {
    expect(readOfficer('Anastasios Flambouras (VP, 2010-2013))')).toBeNull()
  })

  it('refuses a bare name with no post', () => {
    expect(readOfficer('David Dedeine')).toBeNull()
  })
})

describe('readKeyPerson', () => {
  it('accepts a bare name, which is the weaker claim', () => {
    expect(readKeyPerson('David Dedeine')).toBe('David Dedeine')
    expect(readKeyPerson('Trip Hawkins')).toBe('Trip Hawkins')
  })

  it('refuses an infobox template that leaked into the value', () => {
    /* Cygames, Behaviour Interactive, Rovio, Bethesda Game Studios, EQT. */
    expect(readKeyPerson('ubl')).toBeNull()
    expect(readKeyPerson('Unbulleted list')).toBeNull()
  })

  it('refuses a bare job title', () => {
    /* AGEod writes "Philippe Thibaut, CEO" — the post is not a person. */
    expect(readKeyPerson('CEO')).toBeNull()
    expect(readKeyPerson('lead developer')).toBeNull()
  })

  it('refuses a name with its role stuck to the end of it', () => {
    /* 21st Street Games. Taking this would file the job as part of the name. */
    expect(readKeyPerson('Sandy Fliderman CTO & Founder')).toBeNull()
    expect(readKeyPerson('Brian Ferrara Creative Director')).toBeNull()
  })

  it('does not let a fragment the officer reader refused in through the back door', () => {
    expect(readKeyPerson('Boris Nuraliev (Founder & CEO) (1991–)')).toBeNull()
  })
})

describe('looksLikeName', () => {
  it('accepts two and three words, with diacritics in any script', () => {
    expect(looksLikeName('Markus Mäki')).toBe(true)
    expect(looksLikeName('Kagemasa Kōzuki')).toBe(true)
    expect(looksLikeName('Carlos Morales Troncoso')).toBe(true)
    expect(looksLikeName('R. L. McCann')).toBe(true)
  })

  it('accepts four words only when a particle or a suffix holds them together', () => {
    /*
      The rule `tools/fetch-people.mjs` learned the hard way: four capitalised
      words with nothing else are as likely to be two people as one.
    */
    expect(looksLikeName('Chris van der Kuyl')).toBe(true)
    expect(looksLikeName('O. C. Carmichael Jr.')).toBe(true)
    expect(looksLikeName('Stéphanie Cassignard Robyn Wolf')).toBe(false)
  })

  it('refuses one word, five words and anything with a digit', () => {
    expect(looksLikeName('Pilotpriest')).toBe(false)
    expect(looksLikeName('Kim Chang-han is the chief executive')).toBe(false)
    expect(looksLikeName('Sega Fave 2')).toBe(false)
  })

  it('refuses two words welded together and keeps Mc, Mac and O’ names', () => {
    expect(looksLikeName('AWEMartin McDougall')).toBe(false)
    expect(looksLikeName('Martin McDougall')).toBe(true)
    expect(looksLikeName('Terry O’Quinn')).toBe(true)
  })
})

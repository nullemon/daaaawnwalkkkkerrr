import { describe, expect, it } from 'vitest'
import {
  creditBasis,
  creditMark,
  creditPlacement,
  fanProjectNote,
  listSentence,
  mediaCredit,
  rightsCredit,
  rightsholders,
} from './credit'

const game = (over: Record<string, unknown> = {}) =>
  ({
    title: 'Gears of War: E-Day',
    developer: 'The Coalition',
    publisher: 'Xbox Game Studios',
    ...over,
  }) as never

describe('rightsCredit', () => {
  it('names the developer and the publisher', () => {
    expect(rightsCredit(game())).toBe(
      'Gears of War: E-Day © The Coalition / Xbox Game Studios.',
    )
  })

  it('does not say "Capcom / Capcom" when a studio publishes itself', () => {
    expect(
      rightsCredit(game({ title: 'Onimusha: Way of the Sword', developer: 'Capcom', publisher: 'Capcom' })),
    ).toBe('Onimusha: Way of the Sword © Capcom.')
  })

  it('uses whichever holder it has', () => {
    expect(rightsCredit(game({ developer: null }))).toBe(
      'Gears of War: E-Day © Xbox Game Studios.',
    )
    expect(rightsCredit(game({ publisher: '   ' }))).toBe('Gears of War: E-Day © The Coalition.')
  })

  it('names nobody rather than guessing when the record has neither', () => {
    expect(rightsCredit(game({ developer: null, publisher: null }))).toBe(
      'Gears of War: E-Day © its rightsholders.',
    )
  })

  it('has nothing to say without a game', () => {
    expect(rightsCredit(null)).toBeNull()
    expect(rightsCredit(undefined)).toBeNull()
  })
})

describe('fanProjectNote', () => {
  it('disclaims affiliation with the people who made this game', () => {
    expect(fanProjectNote(game())).toBe(
      'Unofficial fan project. Gears of War: E-Day is developed by The Coalition and published by Xbox Game Studios. No affiliation is claimed. Facts are compiled from public sources and have not been verified against the game.',
    )
  })

  it('reads as one sentence when the developer is the publisher', () => {
    expect(
      fanProjectNote(game({ title: 'Onimusha: Way of the Sword', developer: 'Capcom', publisher: 'Capcom' })),
    ).toContain('Onimusha: Way of the Sword is developed and published by Capcom.')
  })

  it('leaves the sentence out rather than building it round an empty field', () => {
    const note = fanProjectNote(game({ developer: null, publisher: null }))
    expect(note).toBe(
      'Unofficial fan project. No affiliation is claimed. Facts are compiled from public sources and have not been verified against the game.',
    )
  })

  it('falls back to the network note where there is no game, which is the hub', () => {
    expect(fanProjectNote(null, 'Network note.')).toBe('Network note.')
  })

  /*
   * The bug this replaced: one string on the network settings, so every page
   * of all eight wikis named Dawnwalker's developer and publisher.
   */
  it('never names another game’s rightsholders', () => {
    const note = fanProjectNote(game(), 'Unofficial fan project. The Blood of Dawnwalker is developed by Rebel Wolves.')
    expect(note).not.toContain('Rebel Wolves')
    expect(note).not.toContain('Dawnwalker')
  })
})

describe('mediaCredit', () => {
  it('does not double the full stop when the publisher’s name carries one', () => {
    expect(mediaCredit('Onimusha: Way of the Sword', 'CAPCOM Co., Ltd.')).toBe(
      'Onimusha: Way of the Sword © CAPCOM Co., Ltd. Used for identification and commentary.',
    )
  })

  it('adds the stop when the name has none', () => {
    expect(mediaCredit('Gears of War: E-Day', 'Xbox Game Studios')).toBe(
      'Gears of War: E-Day © Xbox Game Studios. Used for identification and commentary.',
    )
  })

  it('says "its publisher" rather than leaving a hole', () => {
    expect(mediaCredit('Some Game', null)).toContain('© its publisher.')
  })
})

describe('rightsholders across the network', () => {
  const games = [
    { developer: 'The Coalition', publisher: 'Xbox Game Studios' },
    { developer: 'Capcom', publisher: 'Capcom' },
    { developer: 'Screen Burn', publisher: 'Konami, Annapurna Interactive' },
  ] as never[]

  it('names each company once', () => {
    expect(rightsholders(games)).toEqual([
      'Annapurna Interactive',
      'Capcom',
      'Konami',
      'Screen Burn',
      'The Coalition',
      'Xbox Game Studios',
    ])
  })

  it('splits a field holding two companies, so a list does not run them together', () => {
    expect(rightsholders(games)).toContain('Konami')
    expect(rightsholders(games)).toContain('Annapurna Interactive')
    expect(rightsholders(games)).not.toContain('Konami, Annapurna Interactive')
  })

  it('reads as a sentence', () => {
    expect(listSentence(['a', 'b', 'c'])).toBe('a, b and c')
    expect(listSentence(['a'])).toBe('a')
    expect(listSentence([])).toBe('')
  })
})

/*
  Every string below is a real value from `media.credit`, copied out of the
  database rather than invented — the mark printed beside a credit is itself a
  claim, and a rule tested against made-up input is a rule tested against
  nothing. Both directions are pinned, because the two mistakes this network
  has already made with a classifier were an over-broad rule throwing good
  records away and a plausible-looking one keeping bad ones.
*/
describe('creditBasis', () => {
  it('reads game art as all-rights-reserved, however the seeder spelled it', () => {
    expect(
      creditBasis('STAR WARS Zero Company™ © Electronic Arts. Used for identification and commentary.'),
    ).toBe('rights')
    expect(
      creditBasis('Gears of War: E-Day, copyright Xbox Game Studios. Used for identification and commentary.'),
    ).toBe('rights')
    /* The oldest shape, with no trailing sentence. */
    expect(creditBasis('The Blood of Dawnwalker © Rebel Wolves / Bandai Namco Entertainment')).toBe(
      'rights',
    )
  })

  it('reads a Commons photograph as a photograph', () => {
    expect(creditBasis('Photograph of Ilkka Villi by Suvi Korhonen from Helsinki, Finland. CC BY 2.0.')).toBe(
      'photograph',
    )
    expect(creditBasis('Photograph of Toshiro Mifune by 映画世界社. Public domain.')).toBe(
      'photograph',
    )
  })

  it('does not read "replace with a photograph" as a photograph', () => {
    /*
      The trap that makes the order of these checks load-bearing: the word
      photograph appears in a sentence about its absence, on 36 records. The
      same shape as `CUBOT_NOTE_20` being a phone.
    */
    expect(creditBasis('Generated placeholder — replace with a photograph.')).toBe('generated')
    expect(
      creditBasis('Generated by this site — a drawn monogram, not a photograph of anybody.'),
    ).toBe('generated')
  })

  it('reads our own emblems as ours', () => {
    expect(
      creditBasis(
        'Emblem generated by this site from the record name. Abstract geometry: it is not game art and does not depict anything in the game.',
      ),
    ).toBe('generated')
  })

  it('reads a logo by its licence, not by a stray copyright glyph', () => {
    expect(creditBasis('Capcom logo (Public domain) — Nessa los')).toBe('licence')
    expect(creditBasis('Playtika logo (CC BY-SA 4.0) — Scoophole2021')).toBe('licence')
    /*
      This one carries a `©` inside the author field Commons gave us while
      the file itself is public domain. Reading the glyph first would mark a
      public-domain logo as all rights reserved, which is a false claim about
      somebody's copyright in two characters.
    */
    expect(creditBasis('TMS Entertainment logo (Public domain) — © 2013 TMS ENTERTAINMENT CO., LTD.')).toBe(
      'licence',
    )
  })

  it('says nothing rather than guessing', () => {
    expect(creditBasis('')).toBe('none')
    expect(creditBasis(null)).toBe('none')
    expect(creditBasis('   ')).toBe('none')
    expect(creditBasis('A screenshot from the announcement trailer')).toBe('plain')
  })
})

describe('creditMark', () => {
  it('puts a camera only on a photograph', () => {
    expect(creditMark('photograph')).toBe('camera')
    expect(creditMark('rights')).not.toBe('camera')
    expect(creditMark('licence')).not.toBe('camera')
  })

  it('puts the copyright glyph only where a copyright is being asserted', () => {
    expect(creditMark('rights')).toBe('copyright')
    /* Roughly half the logos are public domain; `©` there is a false claim. */
    expect(creditMark('licence')).toBe('licence')
    expect(creditMark('generated')).toBe('generated')
  })

  it('has no mark for a credit it could not place', () => {
    expect(creditMark('plain')).toBeNull()
    expect(creditMark('none')).toBeNull()
  })
})

describe('creditPlacement', () => {
  const long =
    'Phantom Blade Zero cover art © May be found at the following website: Steam. Direct link to the media. Archived from the original on 12 August 2026. Via "Phantom Blade Zero". SteamDB. Archived from the original on 12 August 2026. Used for identification and commentary.'

  it('puts a routine credit inside the picture', () => {
    const typical = 'Control Resonant © Remedy Entertainment. Used for identification and commentary.'
    expect(typical.length).toBeLessThan(120)
    expect(creditPlacement(typical, 'narrow')).toBe('overlay')
    expect(creditPlacement(typical, 'wide')).toBe('overlay')
  })

  it('moves the 269-character one under the picture rather than cutting it short', () => {
    /*
      This is the credit that was clipped to nothing inside `overflow: hidden`
      until `4206c56`. An overlay that clamped, faded or scrolled it would be
      that bug again in a new place, so the degradation is placement: it goes
      somewhere with room, whole.
    */
    expect(long.length).toBeGreaterThan(195)
    expect(creditPlacement(long, 'narrow')).toBe('below')
    expect(creditPlacement(long, 'wide')).toBe('below')
  })

  it('gives a wide figure more room than a 318px panel', () => {
    const emblem =
      'Emblem generated by this site from the record name. Abstract geometry: it is not game art and does not depict anything in the game.'
    expect(emblem.length).toBe(131)
    expect(creditPlacement(emblem, 'narrow')).toBe('below')
    expect(creditPlacement(emblem, 'wide')).toBe('overlay')
  })

  it('never moves a band credit, because a band has the whole page to wrap in', () => {
    expect(creditPlacement(long, 'band')).toBe('overlay')
  })

  it('treats a blank credit as an overlay, which renders nothing at all', () => {
    expect(creditPlacement('', 'narrow')).toBe('overlay')
    expect(creditPlacement(null, 'narrow')).toBe('overlay')
  })
})

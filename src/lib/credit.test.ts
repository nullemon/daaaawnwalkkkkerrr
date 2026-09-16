import { describe, expect, it } from 'vitest'
import { fanProjectNote, rightsCredit } from './credit'

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

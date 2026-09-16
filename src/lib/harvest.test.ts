import { describe, expect, it } from 'vitest'
import { isNotAnEntity } from './harvest'

const entity = (title: string, url = '') => ({ title, url })

describe('rejecting works about the game', () => {
  /* Every one of these was live, filed as a Region. */
  const REAL_CASES = [
    'https://gearsofwar.fandom.com/wiki/Gears_of_War_(film)',
    'https://gearsofwar.fandom.com/wiki/Gears_of_War_(TV_Series)',
    'https://gearsofwar.fandom.com/wiki/Gears_of_War_(franchise)',
    'https://silenthill.fandom.com/wiki/Silent_Hill_(pachislot)',
    'https://silenthill.fandom.com/wiki/Silent_Hill_(mobile_game)',
    'https://silenthill.fandom.com/wiki/Silent_Hill_(video_game)',
    'https://silenthill.fandom.com/wiki/Silent_Hill_(franchise)',
    'https://silenthill.fandom.com/wiki/Silent_Hill_2_(2024_video_game)',
    'https://silenthill.fandom.com/wiki/Silent_Hill_(upcoming_video_game)',
  ]

  for (const url of REAL_CASES) {
    it(`rejects ${url.split('/wiki/')[1]}`, () => {
      expect(isNotAnEntity(entity('Silent Hill', url))).toBe(true)
    })
  }

  it('rejects a numbered sequel to the game being harvested', () => {
    expect(isNotAnEntity(entity('Silent Hill 2'), 'Silent Hill: Townfall')).toBe(true)
    expect(isNotAnEntity(entity('Gears of War 3'), 'Gears of War: E-Day')).toBe(true)
    expect(isNotAnEntity(entity('Silent Hill: Mobile 2'), 'Silent Hill: Townfall')).toBe(true)
  })

  /*
   * The first version of the rule rejected any Title Case name ending in a
   * digit, and deleted Antar 4 - a real moon - from the Star Wars wiki on its
   * first run. Numbered names are ordinary in science fiction; only a number
   * after the game's own name means a sequel.
   */
  it('keeps a numbered place that is not the game with a number after it', () => {
    expect(isNotAnEntity(entity('Antar 4'), 'STAR WARS Zero Company')).toBe(false)
    expect(isNotAnEntity(entity('Sector 7'), 'Gears of War: E-Day')).toBe(false)
    expect(isNotAnEntity(entity('Delta Squad 2'), 'Gears of War: E-Day')).toBe(false)
  })

  it('does not reject a numbered title when no game is given', () => {
    expect(isNotAnEntity(entity('Silent Hill 2'))).toBe(false)
  })

  it('reads a percent-encoded url', () => {
    expect(
      isNotAnEntity(entity('Kyoto', 'https://x.fandom.com/wiki/Thing_%28film%29')),
    ).toBe(true)
  })

  it('survives a malformed escape rather than throwing', () => {
    expect(() => isNotAnEntity(entity('Thing', 'https://x/%E0%A4%A'))).not.toThrow()
  })
})

describe('keeping the things that are actually in the game', () => {
  const KEEP: [string, string][] = [
    ['Kyoto', 'https://onimusha.fandom.com/wiki/Kyoto_(Onimusha%3A_Way_of_the_Sword)'],
    ['Marcus Fenix', 'https://gearsofwar.fandom.com/wiki/Marcus_Fenix'],
    ['Lancer', 'https://gearsofwar.fandom.com/wiki/Lancer'],
    ['Ephyra', 'https://gearsofwar.fandom.com/wiki/Ephyra'],
    ['Locust Drone', 'https://gearsofwar.fandom.com/wiki/Locust_Drone'],
    ['Brookhaven Hospital', 'https://silenthill.fandom.com/wiki/Brookhaven_Hospital'],
  ]

  for (const [title, url] of KEEP) {
    it(`keeps ${title}`, () => {
      expect(isNotAnEntity(entity(title, url))).toBe(false)
    })
  }

  /*
   * The narrowness matters: a place can share the game's name, and rejecting
   * on the name alone would throw away the town the game is set in.
   */
  it('keeps a location that shares the game’s name', () => {
    expect(
      isNotAnEntity(entity('Silent Hill', 'https://silenthill.fandom.com/wiki/Silent_Hill_(town)')),
    ).toBe(false)
  })
})

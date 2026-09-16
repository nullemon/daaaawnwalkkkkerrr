import { describe, expect, it } from 'vitest'
import { gameName, sectionCopy } from './section-copy'

const dawnwalker = {
  slug: 'dawnwalker',
  title: 'The Blood of Dawnwalker',
  shortTitle: 'Dawnwalker',
} as never

const gears = {
  slug: 'gears-of-war-e-day',
  title: 'Gears of War: E-Day',
  shortTitle: 'Gears E-Day',
} as never

const SECTIONS = ['regions', 'characters', 'enemies', 'items', 'quests', 'mechanics', 'guides']

describe('gameName', () => {
  it('prefers the short title, which is what the title template uses', () => {
    expect(gameName(gears)).toBe('Gears E-Day')
    expect(gameName({ title: 'Onimusha: Way of the Sword', shortTitle: null } as never)).toBe(
      'Onimusha: Way of the Sword',
    )
    expect(gameName(null)).toBe('this game')
  })
})

describe('the copy a wiki gets', () => {
  it('keeps Dawnwalker’s hand-written copy for Dawnwalker', () => {
    const copy = sectionCopy('regions', dawnwalker, { total: 10 })
    expect(copy.title).toBe('All ten regions of Vale Sangora')
    expect(copy.heading).toBe('Vale Sangora')
    expect(copy.lede).toContain('roughly ten square kilometres')
  })

  it('builds another game’s copy from that game’s own records', () => {
    const copy = sectionCopy('regions', gears, { total: 51 })
    expect(copy.title).toBe('All 51 regions')
    expect(copy.heading).toBe('Regions')
    expect(copy.lede).toContain('51 regions')
    expect(copy.lede).toContain('Gears E-Day')
  })

  it('counts one region as a region', () => {
    expect(sectionCopy('regions', gears, { total: 1 }).title).toBe('All 1 region')
  })

  /*
   * The whole point. Every section index carried Dawnwalker's copy on all
   * eight wikis — "Vale Sangora" as the heading over fifty-one Gears regions,
   * and the segment clock quoted at games that do not have one.
   */
  it('never says Dawnwalker on another game’s wiki', () => {
    for (const section of SECTIONS) {
      const copy = sectionCopy(section, gears, { total: 12, detail: 3 })
      const everything = [copy.title, copy.description, copy.heading, copy.lede].join(' ')
      expect(everything, section).not.toMatch(/Dawnwalker|Vale Sangora|segment|Corruption|Infamy/i)
    }
  })

  it('gives every section it knows a title, a description and a lede', () => {
    for (const section of SECTIONS) {
      for (const game of [dawnwalker, gears]) {
        const copy = sectionCopy(section, game, { total: 7, detail: 2 })
        expect(copy.title, section).toBeTruthy()
        expect(copy.description, section).toBeTruthy()
        expect(copy.heading, section).toBeTruthy()
        expect(copy.lede, section).toBeTruthy()
      }
    }
  })

  it('falls back to something true for a section nobody has written copy for', () => {
    const copy = sectionCopy('gadgets', gears, { total: 4 })
    expect(copy.lede).toBe('4 catalogued for Gears E-Day.')
    expect(copy.description).toContain('Gears E-Day')
  })
})

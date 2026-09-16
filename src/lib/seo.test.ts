import { describe, expect, it } from 'vitest'
import {
  activityMeta,
  buildMeta,
  characterMeta,
  clamp,
  courtMeta,
  endingMeta,
  enemyMeta,
  guideKeywords,
  itemMeta,
  mechanicMeta,
  perkMeta,
  questMeta,
  regionMeta,
  treeMeta,
} from './seo'

const GAME = 'Gears of War: E-Day'

describe('clamp', () => {
  it('leaves a short line alone', () => {
    expect(clamp('Short enough.')).toBe('Short enough.')
  })

  it('stops at a sentence end when one is close to the limit', () => {
    const text = `${'a'.repeat(100)}. ${'b'.repeat(100)}`
    expect(clamp(text).endsWith('.')).toBe(true)
  })

  it('never returns more than the limit', () => {
    expect(clamp('word '.repeat(200)).length).toBeLessThanOrEqual(155)
  })
})

/*
 * The bug this guards: the game's name was a module constant pinned to
 * Dawnwalker, so every detail page on the other seven wikis described its
 * subject as a thing "in The Blood of Dawnwalker" — in the meta description,
 * which is the line a search result shows.
 */
describe('no description names a game other than its own', () => {
  const docs: [string, { title: string; description: string }][] = [
    ['item', itemMeta({ title: 'Lancer', category: 'weapon' } as never, GAME)],
    ['quest', questMeta({ title: 'Emergence', time: { known: false } } as never, GAME)],
    ['character', characterMeta({ title: 'Marcus Fenix' } as never, GAME)],
    ['region', regionMeta({ title: 'Ephyra' } as never, GAME, { quests: 3, items: 2 })],
    ['enemy', enemyMeta({ title: 'Locust Drone' } as never, GAME)],
    ['perk', perkMeta({ title: 'Steady Aim' } as never, GAME)],
    ['ending', endingMeta({ title: 'The Last Day', gate: 'finale' } as never, GAME)],
    ['court', courtMeta({ title: 'Someone' } as never, GAME)],
    ['activity', activityMeta({ title: 'A Task' } as never, GAME)],
    ['tree', treeMeta({ title: 'Support' } as never, GAME, 8)],
    ['build', buildMeta({ title: 'Rifleman' } as never, GAME)],
    ['mechanic', mechanicMeta({ title: 'Active Reload' } as never, GAME)],
  ]

  for (const [label, meta] of docs) {
    it(`${label} names only ${GAME}`, () => {
      const text = `${meta.title} ${meta.description}`
      expect(text).not.toMatch(/Dawnwalker|Vale Sangora|Rebel Wolves|Bandai Namco/i)
    })
  }

  it('says which game it is', () => {
    expect(itemMeta({ title: 'Lancer', category: 'weapon' } as never, GAME).description).toContain(
      GAME,
    )
  })

  it('does not claim a region count the game does not have', () => {
    // It used to say "one of the ten regions of Vale Sangora" for every game.
    const meta = regionMeta({ title: 'Ephyra' } as never, GAME, { quests: 0, items: 0 })
    expect(meta.description).not.toMatch(/ten regions/i)
    expect(meta.description).toContain('Ephyra')
  })
})

describe('guideKeywords', () => {
  it('uses this game’s name, not another one', () => {
    const words = guideKeywords({ targetQuery: 'how long is it' } as never, GAME)
    expect(words).toContain('how long is it')
    expect(words).toContain('gears of war: e-day')
    expect(words.join(' ')).not.toMatch(/dawnwalker/i)
  })

  it('still works with no target query', () => {
    expect(guideKeywords({} as never, GAME).length).toBeGreaterThan(0)
  })
})

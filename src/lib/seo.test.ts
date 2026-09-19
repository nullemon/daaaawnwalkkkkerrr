import { describe, expect, it } from 'vitest'
import {
  activityMeta,
  buildMeta,
  characterMeta,
  clamp,
  leadSentences,
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
 * The real bio of a seeded contributor. Its shape is the whole reason
 * `leadSentences` exists: a 62-character opening sentence followed by a
 * 190-character one, which `clamp` cuts in the middle of.
 */
const BIO =
  'Mei Chen covers localisation and languages across the network. ' +
  'Guides filed under this byline are compiled from published sources, cited on the page, and ' +
  'checked to the same editorial rules as every other record on the site: no fact without a ' +
  'source, and a gap left open rather than filled in.'

describe('leadSentences', () => {
  it('takes the whole opening sentence rather than a fragment of the next', () => {
    expect(leadSentences(BIO, 200)).toBe(
      'Mei Chen covers localisation and languages across the network.',
    )
  })

  it('is what clamp would not do, which is the point', () => {
    expect(clamp(BIO, 200).endsWith('…')).toBe(true)
  })

  it('leaves a bio that fits entirely alone, with no ellipsis', () => {
    expect(leadSentences('Two words. Three words.', 200)).toBe('Two words. Three words.')
  })

  it('takes every sentence that fits, not only the first', () => {
    const text = `${'a'.repeat(40)}. ${'b'.repeat(40)}. ${'c'.repeat(200)}`
    const result = leadSentences(text, 120)
    expect(result).toBe(`${'a'.repeat(40)}. ${'b'.repeat(40)}.`)
  })

  it('falls back to clamp when no sentence ends inside the budget', () => {
    const text = `${'word '.repeat(80)}end.`
    const result = leadSentences(text, 100)
    expect(result.endsWith('…')).toBe(true)
    expect(result.length).toBeLessThanOrEqual(100)
  })

  it('does not read a decimal or an abbreviation as a sentence end', () => {
    // `St.` is a stop, a space and a capital letter — the exact shape being
    // matched — and returning it would print `St.` as the whole blurb.
    const text = `St. Petersburg weighs 1.5 kg ${'x'.repeat(300)}`
    expect(leadSentences(text, 60)).not.toBe('St.')
    expect(leadSentences(text, 60).endsWith('…')).toBe(true)

    // The real sentence end is still taken when it fits.
    expect(leadSentences(`St. Petersburg is a city. ${'x'.repeat(300)}`, 200)).toBe(
      'St. Petersburg is a city.',
    )
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

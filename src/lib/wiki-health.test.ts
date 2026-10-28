import { describe, expect, it } from 'vitest'
import type { Game } from '@/payload-types'
import { healthScore, wikiChecklist } from './wiki-health'

const NOW = new Date('2026-10-28T12:00:00Z')

const game = (over: Partial<Game> = {}): Game =>
  ({
    id: 7,
    title: 'Example Game',
    slug: 'example',
    status: 'building',
    summary: 'A game.',
    tagline: 'A line.',
    developer: 'Studio',
    publisher: 'Publisher',
    releaseDate: '2026-09-01T00:00:00.000Z',
    releaseDateConfirmed: true,
    theme: { accent: '#123456', hero: { id: 1 } as never, logo: { id: 2 } as never },
    seo: { noindex: false },
    verification: { google: 'abc' },
    analytics: {},
    features: ['completion-tracker'],
    rating: { score: 8, rationale: 'Because.' },
    updatedAt: '',
    createdAt: '',
    ...over,
  }) as Game

const facts = { records: 100, guides: 10, ownAssets: true, pendingComments: 0, tools: ['Completion tracker'], now: NOW }
const find = (groups: ReturnType<typeof wikiChecklist>, key: string) =>
  groups.flatMap((g) => g.items).find((i) => i.key === key)!

describe('wikiChecklist', () => {
  it('is all green for a complete, released wiki', () => {
    const groups = wikiChecklist(game(), facts)
    const red = groups.flatMap((g) => g.items).filter((i) => i.ok === false)
    expect(red.map((i) => i.key)).toEqual([])
  })

  it('does not ask for a verdict on a game that is not out', () => {
    const groups = wikiChecklist(game({ releaseDate: '2027-01-01T00:00:00.000Z', rating: undefined }), facts)
    expect(find(groups, 'verdict').ok).toBeNull()
    expect(find(groups, 'verdict').detail).toMatch(/not out/)
  })

  it('asks for one once the game is out and nobody has rated it', () => {
    const groups = wikiChecklist(game({ rating: undefined }), facts)
    expect(find(groups, 'verdict').ok).toBe(false)
  })

  it('treats a missing icon set as a gap and says what fixes it', () => {
    const item = find(wikiChecklist(game(), { ...facts, ownAssets: false }), 'assets')
    expect(item.ok).toBe(false)
    expect(item.detail).toMatch(/make-wiki-icons/)
  })

  it('flags noindex as the owner’s problem, loudly', () => {
    const item = find(wikiChecklist(game({ seo: { noindex: true } }), facts), 'noindex')
    expect(item.ok).toBe(false)
    expect(item.actor).toBe('owner')
  })

  it('counts verification tokens rather than treating one as all', () => {
    const item = find(wikiChecklist(game(), facts), 'verification')
    expect(item.ok).toBe(true)
    expect(item.detail).toMatch(/^1 of 3/)
  })

  it('an unconfirmed release date is neither a tick nor a cross', () => {
    const item = find(wikiChecklist(game({ releaseDateConfirmed: false }), facts), 'release')
    expect(item.ok).toBeNull()
    expect(item.detail).toMatch(/unconfirmed/)
  })

  it('links every field row to the Games form with its tab named', () => {
    for (const item of wikiChecklist(game(), facts).flatMap((g) => g.items)) {
      if (item.href?.startsWith('/collections/games/')) expect(item.tab).toBeTruthy()
    }
  })
})

describe('healthScore', () => {
  it('counts only rows that apply', () => {
    const score = healthScore(wikiChecklist(game({ releaseDate: '2027-01-01T00:00:00.000Z', rating: undefined }), facts))
    expect(score.applicable).toBeLessThan(wikiChecklist(game(), facts).flatMap((g) => g.items).length)
    expect(score.ok).toBe(score.applicable)
  })
})

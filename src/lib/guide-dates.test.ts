import { describe, expect, it } from 'vitest'
import {
  SEEDED_WINDOW_DAYS,
  SEEDED_WINDOW_END,
  isSeededPublishedAt,
  seededPublishedAt,
} from './guide-dates'

const day = (iso: string) => iso.slice(0, 10)

describe('seededPublishedAt', () => {
  it('gives the same guide the same date every time', () => {
    // The whole reason this is a hash rather than a random draw: the database
    // is rebuilt from seed constantly, and a date that moved on every rebuild
    // would churn the sitemap's lastmod and re-publish bookmarked pages.
    const first = seededPublishedAt('beginners-guide')
    for (let i = 0; i < 50; i += 1) expect(seededPublishedAt('beginners-guide')).toBe(first)
  })

  it('lands inside the thirty-day window and never after it', () => {
    const end = Date.parse(`${SEEDED_WINDOW_END}T00:00:00.000Z`)
    const start = end - (SEEDED_WINDOW_DAYS - 1) * 86_400_000
    for (const slug of ['a', 'regions-known', 'does-dawnwalker-have-crossplay', 'x-1', '']) {
      const at = Date.parse(seededPublishedAt(slug))
      expect(at).toBeLessThanOrEqual(end)
      expect(at).toBeGreaterThanOrEqual(start)
    }
  })

  it('stores midnight UTC, the way Payload stores a day-only date', () => {
    expect(seededPublishedAt('items-known')).toMatch(/T00:00:00\.000Z$/)
  })

  it('spreads real slugs across the window rather than piling them on one day', () => {
    const slugs = [
      'beginners-guide', 'all-quests', 'all-characters', 'all-regions', 'all-enemies',
      'items-known', 'regions-known', 'enemies-known', 'characters-known', 'quests-known',
      'mechanics-known', 'achievements-known', 'crossplay', 'co-op', 'steam-deck',
      'release-date', 'system-requirements', 'editions', 'languages', 'most-searched',
      'open-questions', 'hidden-achievements', 'hardest-achievements', 'how-long-to-beat',
      'is-it-open-world', 'does-it-have-multiplayer', 'engine', 'composer', 'series-order',
      'endings-ranked-by-difficulty',
    ]
    const days = new Set(slugs.map((slug) => day(seededPublishedAt(slug))))
    // Thirty slugs over thirty buckets will collide; the failure this guards
    // against is every guide landing on one afternoon, which is what the owner
    // actually complained about.
    expect(days.size).toBeGreaterThan(SEEDED_WINDOW_DAYS / 2)
  })
})

describe('isSeededPublishedAt', () => {
  it('recognises its own value', () => {
    expect(isSeededPublishedAt('all-quests', seededPublishedAt('all-quests'))).toBe(true)
  })

  it('recognises it through a timezone or an admin round trip', () => {
    // A save from the admin can hand the value back with a time on it. A check
    // that answered "edited" because of a millisecond would quietly stop
    // counting the thing it exists to count.
    const seeded = seededPublishedAt('all-quests')
    const withTime = `${day(seeded)}T11:42:07.512Z`
    expect(isSeededPublishedAt('all-quests', withTime)).toBe(true)
    expect(isSeededPublishedAt('all-quests', new Date(seeded))).toBe(true)
  })

  it('stops counting a date somebody has edited', () => {
    expect(isSeededPublishedAt('all-quests', '2024-01-01T00:00:00.000Z')).toBe(false)
  })

  it('treats an empty date as undated rather than as seeded', () => {
    // Undated is a different finding, and conflating the two would report
    // guides as "still scaffolded" that have never been scaffolded at all.
    expect(isSeededPublishedAt('all-quests', null)).toBe(false)
    expect(isSeededPublishedAt('all-quests', undefined)).toBe(false)
    expect(isSeededPublishedAt('all-quests', '')).toBe(false)
  })

  it('does not blow up on a value that is not a date', () => {
    expect(isSeededPublishedAt('all-quests', 'not a date')).toBe(false)
  })
})

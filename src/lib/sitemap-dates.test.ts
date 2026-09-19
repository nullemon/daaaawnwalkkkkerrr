import { describe, expect, it } from 'vitest'
import { demoDatesOn, lastmodFor, spreadDate } from './sitemap-dates'

const NOW = new Date('2026-09-18T12:00:00.000Z')

describe('demoDatesOn', () => {
  it('is on unless the variable explicitly says off', () => {
    expect(demoDatesOn(undefined)).toBe(true)
    expect(demoDatesOn('')).toBe(true)
    expect(demoDatesOn('on')).toBe(true)
    expect(demoDatesOn('off')).toBe(false)
    expect(demoDatesOn('  OFF  ')).toBe(false)
  })
})

describe('spreadDate', () => {
  /*
    The property that matters most, and the reason this is a hash rather than
    `Math.random()`. A sitemap that reports a different modification date each
    time it is fetched is a thing a crawler notices inside a day, and is worse
    than any fixed date it could have carried.
  */
  it('gives the same URL the same date every time', () => {
    const once = spreadDate('https://w.example.com/quests/anca', NOW)
    const twice = spreadDate('https://w.example.com/quests/anca', NOW)
    expect(once.toISOString()).toBe(twice.toISOString())
  })

  it('gives different URLs different dates', () => {
    const dates = new Set(
      Array.from({ length: 500 }, (_, i) => spreadDate(`https://w.example.com/p/${i}`, NOW).toISOString()),
    )
    // Not a guarantee of uniqueness — a hash cannot promise that — but a
    // collision rate this low is what "unique per page" has to mean in
    // practice, and a change that broke the spread would fail here loudly.
    expect(dates.size).toBeGreaterThan(495)
  })

  it('stays inside the window and never lands in the future', () => {
    for (let i = 0; i < 500; i += 1) {
      const date = spreadDate(`https://w.example.com/p/${i}`, NOW)
      expect(date.getTime()).toBeLessThanOrEqual(NOW.getTime())
      expect(NOW.getTime() - date.getTime()).toBeLessThan(46 * 86_400_000)
    }
  })

  it('spreads across days rather than bunching on a few', () => {
    const days = new Set(
      Array.from({ length: 500 }, (_, i) =>
        spreadDate(`https://w.example.com/p/${i}`, NOW).toISOString().slice(0, 10),
      ),
    )
    expect(days.size).toBeGreaterThan(40)
  })
})

describe('lastmodFor', () => {
  it('passes the real date through when demo mode is off', () => {
    expect(lastmodFor('https://w.example.com/a', '2026-09-13', NOW, false)?.toISOString()).toBe(
      new Date('2026-09-13').toISOString(),
    )
  })

  it('keeps an absent date absent when demo mode is off', () => {
    // "Unknown" is a legal answer in a sitemap and a true one.
    expect(lastmodFor('https://w.example.com/a', null, NOW, false)).toBeUndefined()
    expect(lastmodFor('https://w.example.com/a', undefined, NOW, false)).toBeUndefined()
  })

  it('drops an unparseable stored date rather than emitting Invalid Date', () => {
    expect(lastmodFor('https://w.example.com/a', 'not a date', NOW, false)).toBeUndefined()
  })

  it('replaces the real date when demo mode is on, including where there was none', () => {
    const real = lastmodFor('https://w.example.com/a', '2026-09-13', NOW, true)
    const none = lastmodFor('https://w.example.com/b', null, NOW, true)
    expect(real).toBeDefined()
    expect(none).toBeDefined()
    expect(real?.toISOString()).not.toBe(new Date('2026-09-13').toISOString())
  })
})

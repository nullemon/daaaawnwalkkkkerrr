import { describe, expect, it } from 'vitest'
import {
  SEEDED_WINDOW_DAYS,
  SEEDED_WINDOW_END,
  guideDates,
  guideLastModified,
  isSeededPublishedAt,
  seededPublishedAt,
  sourcesLastRead,
} from './guide-dates'

const day = (iso: string) => iso.slice(0, 10)

/*
  The dates a guide is entitled to state.

  These pin the two halves of the rule that matter, and both of them are
  rules about *not* saying something:

    - a generated guide has no publication date, and nothing derives one
    - "last checked" is the day this page's own citations were read, which is
      a fact off a committed harvest file rather than a number off the clock

  The second is the reason a rebuild does not move any of it, and the first is
  the reason four hundred articles no longer claim a launch schedule nobody
  kept.
*/
describe('sourcesLastRead', () => {
  it('takes the most recent day any source was read', () => {
    expect(
      sourcesLastRead([
        { retrieved: '2026-09-13' },
        { retrieved: '2026-09-17' },
        { retrieved: '2026-09-15' },
      ]),
    ).toBe('2026-09-17')
  })

  it('reads a stored midnight-UTC timestamp as its calendar day', () => {
    expect(sourcesLastRead([{ retrieved: '2026-09-17T00:00:00.000Z' }])).toBe('2026-09-17')
    expect(sourcesLastRead([{ retrieved: new Date('2026-09-17T00:00:00.000Z') }])).toBe('2026-09-17')
  })

  it('ignores a citation with no retrieval date rather than guessing one', () => {
    expect(sourcesLastRead([{ retrieved: null }, { retrieved: '2026-09-15' }, {}])).toBe(
      '2026-09-15',
    )
  })

  it('answers nothing for no sources at all', () => {
    expect(sourcesLastRead([])).toBeUndefined()
    expect(sourcesLastRead(null)).toBeUndefined()
    expect(sourcesLastRead(undefined)).toBeUndefined()
    expect(sourcesLastRead([{ retrieved: 'not a date' }])).toBeUndefined()
  })
})

describe('guideDates', () => {
  it('never invents a publication date', () => {
    /*
      The whole point. A generated guide was not published on a day — it came
      into being when a generator ran and will do so again identically. Every
      derivation on offer (the row timestamps, a hash of the slug, the oldest
      citation) produces a plausible number, and a plausible date under a
      headline is indistinguishable from a real one.
    */
    const dates = guideDates({ sources: [{ retrieved: '2026-09-17' }] })
    expect(dates.published).toBeUndefined()
    expect(dates.updated).toBe('2026-09-17')
    expect(dates.basis).toBe('sources')
  })

  it('states a publication date only when an editor typed one', () => {
    const dates = guideDates({ published: '2026-09-02', sources: [{ retrieved: '2026-09-17' }] })
    expect(dates.published).toBe('2026-09-02')
  })

  it('prefers an editor’s "last checked" to the citations', () => {
    // Somebody going back to the sources is a real review; a harvester
    // re-reading a page is not, and the editor's word wins where there is one.
    const dates = guideDates({
      updated: '2026-09-14',
      sources: [{ retrieved: '2026-09-17' }],
    })
    expect(dates.updated).toBe('2026-09-14')
    expect(dates.basis).toBe('editorial')
  })

  it('offers nothing at all for a guide with neither', () => {
    const dates = guideDates({ sources: [] })
    expect(dates.published).toBeUndefined()
    expect(dates.updated).toBeUndefined()
    expect(dates.basis).toBe('none')
  })

  it('refuses a modification date earlier than the publication date', () => {
    /*
      `dateModified` before `datePublished` is malformed structured data, and
      it is reachable: an editor dates a page to today while its citations
      were harvested a fortnight ago. The sources were still read then — it is
      just not an answer to "when did this last change".
    */
    const dates = guideDates({ published: '2026-09-20', sources: [{ retrieved: '2026-09-17' }] })
    expect(dates.published).toBe('2026-09-20')
    expect(dates.updated).toBeUndefined()
    expect(dates.basis).toBe('none')
  })

  it('allows the two to fall on the same day', () => {
    const dates = guideDates({ published: '2026-09-17', sources: [{ retrieved: '2026-09-17' }] })
    expect(dates.updated).toBe('2026-09-17')
  })
})

describe('guideLastModified', () => {
  it('is the checked date where there is one', () => {
    expect(guideLastModified({ sources: [{ retrieved: '2026-09-16' }] })).toBe('2026-09-16')
  })

  it('falls back to the publication date rather than to a row timestamp', () => {
    expect(guideLastModified({ published: '2026-09-20', sources: [{ retrieved: '2026-09-17' }] })).toBe(
      '2026-09-20',
    )
  })

  it('is undefined when the guide has no honest date', () => {
    // An omitted <lastmod> says "unknown", which is true. A row timestamp on
    // four hundred pages says every one of them changed this afternoon, which
    // is the synthetic signal Google stops trusting.
    expect(guideLastModified({})).toBeUndefined()
  })
})

/*
  What is left of the old rule.

  `seededPublishedAt` no longer writes anything. It is kept so the dates it
  already wrote can be recognised and cleared, which is only possible because
  the value is reproducible — there is no flag beside the field saying it was
  a placeholder, and this repository has thirty-six placeholder contributors
  proving nobody unticks one.
*/
describe('seededPublishedAt', () => {
  it('gives the same guide the same value every time', () => {
    const first = seededPublishedAt('beginners-guide')
    for (let i = 0; i < 50; i += 1) expect(seededPublishedAt('beginners-guide')).toBe(first)
  })

  it('reproduces the window the old rule wrote into', () => {
    const end = Date.parse(`${SEEDED_WINDOW_END}T00:00:00.000Z`)
    const start = end - (SEEDED_WINDOW_DAYS - 1) * 86_400_000
    for (const slug of ['a', 'regions-known', 'does-dawnwalker-have-crossplay', 'x-1', '']) {
      const at = Date.parse(seededPublishedAt(slug))
      expect(at).toBeLessThanOrEqual(end)
      expect(at).toBeGreaterThanOrEqual(start)
    }
  })

  it('is midnight UTC, the way Payload stored it', () => {
    expect(seededPublishedAt('items-known')).toMatch(/T00:00:00\.000Z$/)
  })

  it('still recognises the spread it wrote, so every row can be found', () => {
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

  it('leaves a date somebody has edited alone', () => {
    // This is the guard on the clearing pass: it must never delete a date an
    // editor typed, only one the old rule computed.
    expect(isSeededPublishedAt('all-quests', '2024-01-01T00:00:00.000Z')).toBe(false)
  })

  it('treats an empty date as undated rather than as seeded', () => {
    expect(isSeededPublishedAt('all-quests', null)).toBe(false)
    expect(isSeededPublishedAt('all-quests', undefined)).toBe(false)
    expect(isSeededPublishedAt('all-quests', '')).toBe(false)
  })

  it('does not blow up on a value that is not a date', () => {
    expect(isSeededPublishedAt('all-quests', 'not a date')).toBe(false)
  })
})

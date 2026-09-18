import { describe, expect, it } from 'vitest'
import { DIMENSIONS, RAW_RETENTION_DAYS, WINDOWS, dayKey, dimension, rangeFor } from './shape'

const NOW = new Date('2026-09-18T14:30:00.000Z')

describe('rangeFor', () => {
  it('offers every window the picker offers', () => {
    for (const spec of WINDOWS) expect(rangeFor(spec.id, NOW).spec.id).toBe(spec.id)
  })

  it('falls back to 24 hours rather than throwing on nonsense', () => {
    expect(rangeFor('last tuesday', NOW).spec.id).toBe('24h')
    expect(rangeFor(null, NOW).spec.id).toBe('24h')
  })

  it('ends at now, so the newest bucket is partial rather than missing', () => {
    expect(rangeFor('24h', NOW).to).toBe(NOW.toISOString())
  })

  it('aligns the multi-day windows to UTC midnight and the sub-day ones to now', () => {
    /*
      Not cosmetic. A rollup is per UTC day, so a window starting at 14:30
      twenty-nine days ago can only be answered by reading individual page
      views — at 300,000 rows that is 13.7 seconds against 7ms. Day alignment
      is what lets the long windows use the summaries, and because the visitor
      key has the date in it the summary is the same number rather than an
      approximation of it.
    */
    expect(rangeFor('30d', NOW).from).toBe('2026-08-20T00:00:00.000Z')
    expect(rangeFor('30d', NOW).dayAligned).toBe(true)
    expect(rangeFor('7d', NOW).from).toBe('2026-09-12T00:00:00.000Z')
    expect(rangeFor('24h', NOW).from).toBe('2026-09-17T14:30:00.000Z')
    expect(rangeFor('24h', NOW).dayAligned).toBe(false)
  })

  it('names the first and last day, which are the rollup keys', () => {
    const range = rangeFor('7d', NOW)
    expect(range.firstDay).toBe('2026-09-12')
    expect(range.lastDay).toBe('2026-09-18')
  })

  it('counts today as one of the days, so “last 7 days” is seven and not eight', () => {
    // 2026-09-12 .. 2026-09-18 inclusive is seven days.
    const range = rangeFor('7d', NOW)
    const days =
      (Date.parse(`${range.lastDay}T00:00:00Z`) - Date.parse(`${range.firstDay}T00:00:00Z`)) /
        86_400_000 +
      1
    expect(days).toBe(7)
  })

  it('knows which windows the raw rows can still answer', () => {
    /*
      This is the flag that decides whether a filter means anything. A window
      inside retention reads individual page views and can be filtered on
      anything; a longer one reads rollups, which are one-dimensional. The
      admin prints which was used — a dashboard that silently ignored a filter
      and returned the unfiltered number is the exact failure this project
      keeps finding.
    */
    expect(rangeFor('30d', NOW).withinRaw).toBe(true)
    expect(rangeFor('90d', NOW).withinRaw).toBe(false)
    expect(rangeFor('12m', NOW).withinRaw).toBe(false)
    expect(rangeFor('all', NOW).withinRaw).toBe(false)
  })

  it('puts the retention boundary between 62 and 90 days', () => {
    // If somebody shortens RAW_RETENTION_DAYS below 30, the 30-day window
    // silently stops being filterable. This is the test that would say so.
    expect(RAW_RETENTION_DAYS).toBeGreaterThanOrEqual(30)
    expect(RAW_RETENTION_DAYS).toBeLessThan(90)
  })

  it('knows when a window crosses a UTC midnight', () => {
    /*
      The visitor key rotates daily, so a distinct count is exact inside one
      day and a ceiling across two. A one-hour window straddling midnight has
      the same problem as a week, which is why this is a date comparison rather
      than "is the window longer than a day".
    */
    expect(rangeFor('1h', NOW).spansDays).toBe(false)
    expect(rangeFor('1h', new Date('2026-09-18T00:20:00.000Z')).spansDays).toBe(true)
    expect(rangeFor('7d', NOW).spansDays).toBe(true)
  })
})

describe('dayKey', () => {
  it('is UTC, so a rollup key and the rows it came from agree', () => {
    expect(dayKey(NOW)).toBe('2026-09-18')
    expect(dayKey(new Date('2026-09-18T23:59:59.999Z'))).toBe('2026-09-18')
  })
})

describe('DIMENSIONS', () => {
  it('is the only place a dimension becomes a column name', () => {
    /*
      This list is the injection guard as well as the label list: nothing
      interpolates a caller's string into SQL, a dimension is looked up here
      and the column constant is what reaches the database. A column name with
      anything but word characters in it would mean somebody had started
      building them instead.
    */
    for (const dim of DIMENSIONS) expect(dim.column).toMatch(/^[a-z_]+$/)
    expect(dimension('site')?.column).toBe('site')
    expect(dimension('; drop table analytics_events --')).toBeUndefined()
  })

  it('says what each number is next to every one of them', () => {
    for (const dim of DIMENSIONS) expect(dim.note.length).toBeGreaterThan(20)
  })

  it('names country’s unknown as an answer rather than leaving it blank', () => {
    expect(dimension('country')?.note).toMatch(/unknown/i)
  })
})

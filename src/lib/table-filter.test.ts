import { describe, expect, it } from 'vitest'
import { applyFilters, applySort, distinct, numOf } from './table-filter'

const QUESTS = [
  { id: 1, title: 'A Bulwark Against Darkness', kind: 'Side', region: 'Briar Sloughs', segments: '' },
  { id: 2, title: 'A Friend Like This', kind: 'Ally questline', region: 'Svartrau City', segments: '3' },
  { id: 3, title: 'The Ritual', kind: 'Contract', region: 'Tantari Woods', segments: '2' },
  { id: 4, title: 'A Hero’s End', kind: 'Side', region: 'Svartrau City', segments: '' },
]

describe('index table filtering', () => {
  const searchKeys = ['title', 'kind', 'region']

  it('returns everything when nothing is set', () => {
    expect(applyFilters(QUESTS, {})).toHaveLength(4)
    expect(applyFilters(QUESTS, { query: '   ', searchKeys })).toHaveLength(4)
  })

  it('searches across every text column, not just the name', () => {
    expect(applyFilters(QUESTS, { query: 'ritual', searchKeys }).map((r) => r.id)).toEqual([3])
    expect(applyFilters(QUESTS, { query: 'svartrau', searchKeys }).map((r) => r.id)).toEqual([2, 4])
    expect(applyFilters(QUESTS, { query: 'contract', searchKeys }).map((r) => r.id)).toEqual([3])
  })

  it('is case-insensitive and matches mid-word', () => {
    expect(applyFilters(QUESTS, { query: 'BULWARK', searchKeys })).toHaveLength(1)
    expect(applyFilters(QUESTS, { query: 'oods', searchKeys })).toHaveLength(1)
  })

  it('combines a facet with the search rather than replacing it', () => {
    const out = applyFilters(QUESTS, {
      query: 'a',
      picked: { region: 'Svartrau City' },
      searchKeys,
    })
    expect(out.map((r) => r.id)).toEqual([2, 4])
  })

  it('treats an empty facet as no filter', () => {
    expect(applyFilters(QUESTS, { picked: { kind: '' }, searchKeys })).toHaveLength(4)
  })

  it('can return nothing', () => {
    expect(applyFilters(QUESTS, { query: 'zzzz', searchKeys })).toHaveLength(0)
  })

  it('offers facet options taken from the data, sorted and deduplicated', () => {
    expect(distinct(QUESTS, 'kind')).toEqual(['Ally questline', 'Contract', 'Side'])
    expect(distinct(QUESTS, 'segments')).toEqual(['2', '3'])
  })
})

describe('index table sorting', () => {
  it('sorts text both ways', () => {
    expect(applySort(QUESTS, { key: 'title', dir: 'asc' }, [])[0].id).toBe(1)
    expect(applySort(QUESTS, { key: 'title', dir: 'desc' }, [])[0].id).toBe(3)
  })

  it('keeps unknown costs at the bottom in both directions', () => {
    const asc = applySort(QUESTS, { key: 'segments', dir: 'asc' }, ['segments'])
    const desc = applySort(QUESTS, { key: 'segments', dir: 'desc' }, ['segments'])
    expect(asc.map((r) => r.segments)).toEqual(['2', '3', '', ''])
    expect(desc.map((r) => r.segments)).toEqual(['3', '2', '', ''])
  })

  it('never reads an unknown as a number', () => {
    expect(numOf({ id: 1, segments: '' }, 'segments')).toBe(Number.POSITIVE_INFINITY)
    expect(numOf({ id: 1, segments: 'unknown' }, 'segments')).toBe(Number.POSITIVE_INFINITY)
    expect(numOf({ id: 1, segments: '2–4' }, 'segments')).toBe(2)
  })

  it('leaves the order alone when no sort is set', () => {
    expect(applySort(QUESTS, null, []).map((r) => r.id)).toEqual([1, 2, 3, 4])
  })
})

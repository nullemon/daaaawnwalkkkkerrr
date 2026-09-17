import { describe, expect, it } from 'vitest'
import {
  AMBIGUOUS,
  EDGE_RULES,
  buildIndex,
  factsForRule,
  fold,
  isEmptyEdge,
  resolveFact,
  resolveRule,
  splitFactValue,
  wouldCycle,
} from './entity-links'

/*
  A small game, built from real values in src/seed/raw/wiki-entities/. Both
  directions are pinned here on purpose: the edges that must be written, and
  the ones that must not. An over-broad filter throws away good records as
  silently as a loose one writes bad ones — that is the Antar 4 lesson — so
  neither half of this file is optional.
*/
const regions = buildIndex([
  { id: 1, title: 'Oldest House' },
  { id: 2, title: 'Ordinary' },
  { id: 3, title: 'Research Sector' },
  { id: 4, title: 'Kalona' },
  { id: 5, title: 'Tyrus' },
  { id: 6, title: 'Château d’Ombrage' },
  { id: 7, title: 'Hollow' },
  { id: 8, title: 'La Cuna' },
])

const quests = buildIndex([
  { id: 11, title: 'Welcome to the Oldest House' },
  { id: 12, title: 'Unknown Caller' },
  { id: 13, title: 'Directorial Override' },
])

describe('fold', () => {
  it('folds case, accents and punctuation, because both sides go through it', () => {
    expect(fold('Château d’Ombrage')).toBe('chateau d ombrage')
    expect(fold("Laurentius' Farmstead")).toBe('laurentius farmstead')
    expect(fold('De Rune estate')).toBe(fold('de Rune Estate'))
  })

  it('does not fold away a leading article', () => {
    // "The Board" and "Board" are different records on the Control wiki.
    expect(fold('The Hollow')).not.toBe(fold('Hollow'))
  })
})

describe('splitFactValue', () => {
  it('splits a list and lifts the bracketed qualifier off each fragment', () => {
    expect(
      splitFactValue('Ordinary, Maine (formerly), Cheyenne, Wyoming (formerly), Oldest House'),
    ).toEqual([
      { text: 'Ordinary', qualifier: '' },
      { text: 'Maine', qualifier: 'formerly' },
      { text: 'Cheyenne', qualifier: '' },
      { text: 'Wyoming', qualifier: 'formerly' },
      { text: 'Oldest House', qualifier: '' },
    ])
  })

  it('does not split on "and", which is a word inside titles', () => {
    expect(splitFactValue('Dead Letters and Mail Room')).toEqual([
      { text: 'Dead Letters and Mail Room', qualifier: '' },
    ])
  })
})

describe('buildIndex', () => {
  it('poisons a title two records share rather than picking one', () => {
    const index = buildIndex([
      { id: 'a', title: 'Sanctuary' },
      { id: 'b', title: 'sanctuary' },
    ])
    expect(index.get('sanctuary')).toBe(AMBIGUOUS)
  })
})

describe('values that must write an edge', () => {
  it('matches a plain title', () => {
    const result = resolveFact('Oldest House', regions, { hasMany: false })
    expect(result.ids).toEqual([1])
    expect(result.unmatched).toEqual([])
  })

  it('matches through case and accent differences', () => {
    expect(resolveFact("chateau d'ombrage", regions, { hasMany: false }).ids).toEqual([6])
  })

  it('takes the one fragment that resolves and reports the rest', () => {
    // "Maintenance Sector, Oldest House" — only the second is a record here.
    const result = resolveFact('Maintenance Sector, Oldest House', regions, { hasMany: false })
    expect(result.ids).toEqual([1])
    expect(result.unmatched).toEqual(['Maintenance Sector'])
  })

  it('drops a qualified fragment so the unqualified one can stand alone', () => {
    const result = resolveFact('Ordinary (formerly), Oldest House', regions, { hasMany: false })
    expect(result.ids).toEqual([1])
    expect(result.droppedQualified).toEqual(['Ordinary (formerly)'])
  })

  it('keeps every match on a hasMany field', () => {
    const result = resolveFact('Unknown Caller, Directorial Override', quests, { hasMany: true })
    expect(result.ids).toEqual([12, 13])
  })
})

describe('values that must NOT write an edge', () => {
  it('refuses a single-valued field when two fragments resolve', () => {
    // Kalona is a town in Tyrus. Both are regions; choosing one is a coin flip.
    const result = resolveFact('Kalona, Tyrus', regions, { hasMany: false })
    expect(result.ids).toEqual([])
    expect(result.ambiguous).toBe(true)
    expect(result.matched).toEqual(['Kalona', 'Tyrus'])
  })

  it('refuses a partial match', () => {
    // "The Hollow" is not "Hollow", and "Oldest" is not "Oldest House".
    expect(resolveFact('The Hollow', regions, { hasMany: false }).ids).toEqual([])
    expect(resolveFact('Oldest', regions, { hasMany: false }).ids).toEqual([])
    expect(resolveFact('Oldest House Maintenance Wing', regions, { hasMany: false }).ids).toEqual([])
  })

  it('refuses a run-together wiki list, which names nothing exactly', () => {
    // Real value from control-resonant: two mission names with no separator.
    const result = resolveFact('Finnish TangoA Dark Place', quests, { hasMany: true })
    expect(result.ids).toEqual([])
    expect(result.unmatched).toEqual(['Finnish TangoA Dark Place'])
  })

  it('refuses a title two records share', () => {
    const shared = buildIndex([
      { id: 1, title: 'Sanctuary' },
      { id: 2, title: 'Sanctuary' },
    ])
    expect(resolveFact('Sanctuary', shared, { hasMany: false }).ids).toEqual([])
  })

  it('refuses a wiki saying it does not know', () => {
    // "Unknown" is itself a page title on more than one of these wikis, so
    // left alone this would link every unrecorded residence to one page.
    const withUnknown = buildIndex([{ id: 9, title: 'Unknown' }])
    expect(resolveFact('Unknown', withUnknown, { hasMany: false }).ids).toEqual([])
    expect(resolveFact('N/A (Currently in the possession of Jesse Faden)', regions, {
      hasMany: false,
    }).ids).toEqual([])
  })

  it('never makes a quest its own prerequisite', () => {
    const result = resolveFact('Unknown Caller', quests, { hasMany: true, self: 12 })
    expect(result.ids).toEqual([])
  })
})

describe('factsForRule', () => {
  const rule = EDGE_RULES.find((entry) => entry.from === 'characters')!

  it('reads the keys in the order the rule lists them, case-insensitively', () => {
    expect(factsForRule({ Residence: 'Oldest House', homeland: 'Ordinary' }, rule)).toEqual([
      { key: 'residence', value: 'Oldest House' },
      { key: 'homeland', value: 'Ordinary' },
    ])
  })

  it('ignores a key the rule does not name and an empty value', () => {
    expect(factsForRule({ affiliation: 'Federal Bureau of Control' }, rule)).toEqual([])
    expect(factsForRule({ residence: '   ' }, rule)).toEqual([])
  })
})

describe('resolveRule', () => {
  const parent = EDGE_RULES.find((entry) => entry.field === 'parent')!

  it('prefers the narrower key where a wiki states both', () => {
    // Real Control values: the Ashtray Maze is in the Research Sector, which
    // is in the Oldest House. Both are true; the narrower one is the edge.
    const result = resolveRule(
      { sector: 'Research Sector', location: 'Oldest House' },
      parent,
      regions,
    )
    expect(result?.key).toBe('sector')
    expect(result?.ids).toEqual([3])
  })

  it('falls through a key that names nothing', () => {
    // Star Wars writes sector="N/A" and sector="None" all over the A-C slice.
    const result = resolveRule({ sector: 'N/A', location: 'Oldest House' }, parent, regions)
    expect(result?.key).toBe('location')
    expect(result?.ids).toEqual([1])
  })

  it('does NOT fall through a key that names two things', () => {
    // A conflict gets recorded, not resolved — trying another key until one
    // gives a tidy answer is resolving it.
    const result = resolveRule({ sector: 'Kalona, Tyrus', location: 'Ordinary' }, parent, regions)
    expect(result?.key).toBe('sector')
    expect(result?.ambiguous).toBe(true)
    expect(result?.ids).toEqual([])
  })

  it('returns null when the entity carries none of the rule’s keys', () => {
    expect(resolveRule({ tenants: 'Federal Bureau of Control' }, parent, regions)).toBeNull()
  })

  it('never makes a region its own parent', () => {
    expect(resolveRule({ location: 'Oldest House' }, parent, regions, 1)?.ids).toEqual([])
  })
})

describe('wouldCycle', () => {
  it('sees a loop that no pairwise check can', () => {
    // "A inside B" is already stored and valid. "B inside A" is valid too.
    // Together they are a breadcrumb that renders forever.
    const edges = new Map<string | number, (string | number)[]>([['a', ['b']]])
    expect(wouldCycle('b', 'a', edges)).toBe(true)
  })

  it('walks the whole chain, not just one hop', () => {
    const edges = new Map<string | number, (string | number)[]>([
      ['a', ['b']],
      ['b', ['c']],
    ])
    expect(wouldCycle('c', 'a', edges)).toBe(true)
    expect(wouldCycle('d', 'a', edges)).toBe(false)
  })

  it('allows a deeper hierarchy, which is the whole point of the field', () => {
    // Ashtray Maze -> Research Sector -> Oldest House -> New York City.
    const edges = new Map<string | number, (string | number)[]>([
      ['maze', ['research']],
      ['research', ['house']],
    ])
    expect(wouldCycle('house', 'nyc', edges)).toBe(false)
  })

  it('terminates on a graph that already contains a cycle', () => {
    // Without the visited set the guard is the first thing to hang, on data
    // written before the guard existed.
    const edges = new Map<string | number, (string | number)[]>([
      ['a', ['b']],
      ['b', ['a']],
    ])
    expect(wouldCycle('z', 'a', edges)).toBe(false)
  })
})

describe('isEmptyEdge', () => {
  it('treats only an absent value as fillable, so a hand-written edge stands', () => {
    expect(isEmptyEdge(null)).toBe(true)
    expect(isEmptyEdge([])).toBe(true)
    expect(isEmptyEdge(0)).toBe(false)
    expect(isEmptyEdge(42)).toBe(false)
    expect(isEmptyEdge([7])).toBe(false)
  })
})

describe('EDGE_RULES', () => {
  it('names only fields that exist on the collections in src/collections', () => {
    // Payload drops an unknown key on update silently, so a rule naming a field
    // that is not there produces a clean run and no edges.
    const schema: Record<string, string[]> = {
      characters: ['region', 'questline'],
      enemies: ['region'],
      items: ['region'],
      regions: ['court', 'parent'],
      quests: ['region', 'prereqs', 'unlocks', 'excludes'],
    }
    for (const rule of EDGE_RULES) {
      expect(schema[rule.from]).toContain(rule.field)
    }
  })

  it('marks every self-referencing rule acyclic', () => {
    // A field pointing at its own collection is the only place a loop can
    // form, and a loop is invisible at write time.
    for (const rule of EDGE_RULES) {
      if (rule.from === rule.to) expect(rule.acyclic).toBe(true)
    }
  })
})

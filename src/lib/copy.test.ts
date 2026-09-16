import { describe, expect, it } from 'vitest'
import { copy, fill, hasRichText, pick, splitTokens } from './copy'
import { guideMatches } from './game-copy'

/*
  These four functions decide what several thousand pages say, so the cases
  worth pinning are the ones where a wrong answer is invisible: a blank field
  blanking a heading, a token quietly deleting a number, an editable string
  reaching the DOM as markup.
*/

describe('pick', () => {
  it('falls back for every shape of empty a Payload text field can arrive as', () => {
    expect(pick(undefined, 'built-in')).toBe('built-in')
    expect(pick(null, 'built-in')).toBe('built-in')
    expect(pick('', 'built-in')).toBe('built-in')
    expect(pick('   ', 'built-in')).toBe('built-in')
  })

  it('takes the override when there is one', () => {
    expect(pick('written', 'built-in')).toBe('written')
  })

  it('does not treat a legitimate false or zero as empty', () => {
    expect(pick(false, true)).toBe(false)
    expect(pick(0, 5)).toBe(0)
  })
})

describe('fill', () => {
  it('substitutes what it has', () => {
    expect(fill('{count} quests in {game}', { count: 93, game: 'Dawnwalker' })).toBe(
      '93 quests in Dawnwalker',
    )
  })

  it('leaves an unknown token visible rather than blanking it', () => {
    // A typo should show on the page as a typo. A silently missing number
    // reads as a finished sentence and is wrong.
    expect(fill('{gmae} has {count}', { game: 'x', count: 2 })).toBe('{gmae} has 2')
  })

  it('leaves a token whose value is empty alone', () => {
    expect(fill('by {maintainer}', { maintainer: '' })).toBe('by {maintainer}')
    expect(fill('by {maintainer}', { maintainer: null })).toBe('by {maintainer}')
  })

  it('groups thousands, because these are counts a reader reads', () => {
    expect(fill('{count} pages', { count: 1959 })).toBe('1,959 pages')
  })
})

describe('copy', () => {
  it('fills the built-in when the field is blank', () => {
    expect(copy('', '{count} guides', { count: 3 })).toBe('3 guides')
  })

  it('fills the override when there is one', () => {
    expect(copy('all {count} of them', '{count} guides', { count: 3 })).toBe('all 3 of them')
  })
})

describe('splitTokens', () => {
  it('returns the pieces an element can be built from', () => {
    expect(splitTokens('Published by {entity}.')).toEqual([
      { text: 'Published by ' },
      { token: 'entity' },
      { text: '.' },
    ])
  })

  it('handles a token at either end', () => {
    expect(splitTokens('{a}')).toEqual([{ token: 'a' }])
  })

  it('returns plain text unchanged', () => {
    expect(splitTokens('no tokens here')).toEqual([{ text: 'no tokens here' }])
  })
})

describe('hasRichText', () => {
  it('is false for the empty document Lexical produces for an untouched field', () => {
    expect(hasRichText({ root: { children: [] } })).toBe(false)
    expect(hasRichText(null)).toBe(false)
    expect(hasRichText({ root: { children: [{ type: 'paragraph', children: [] }] } })).toBe(false)
  })

  it('is true once somebody has typed something', () => {
    expect(
      hasRichText({
        root: { children: [{ type: 'paragraph', children: [{ type: 'text', text: 'hello' }] }] },
      }),
    ).toBe(true)
  })
})

describe('guideMatches', () => {
  const regions = new Set(['the-slits', 'tantari-woods'])

  it('matches a listed slug, however the list was typed', () => {
    expect(guideMatches({ heading: 'x', slugs: 'a-guide\nb-guide' }, 'b-guide', regions)).toBe(true)
    expect(guideMatches({ heading: 'x', slugs: 'a-guide, b-guide' }, 'b-guide', regions)).toBe(true)
  })

  it('matches a suffix and a substring', () => {
    expect(guideMatches({ heading: 'x', endsWith: '-tree-guide' }, 'blood-tree-guide', regions)).toBe(
      true,
    )
    expect(guideMatches({ heading: 'x', contains: 'ending' }, 'best-ending-guide', regions)).toBe(true)
  })

  it('matches a region guide against this wiki’s own regions, not a typed list', () => {
    expect(guideMatches({ heading: 'x', matchRegions: true }, 'the-slits-guide', regions)).toBe(true)
    // A region belonging to a different wiki must not match here. This is the
    // whole reason the rule reads the records instead of a hardcoded Set.
    expect(guideMatches({ heading: 'x', matchRegions: true }, 'nether-gate-guide', regions)).toBe(
      false,
    )
  })

  it('matches nothing when the group says nothing', () => {
    expect(guideMatches({ heading: 'x' }, 'anything-guide', regions)).toBe(false)
  })
})

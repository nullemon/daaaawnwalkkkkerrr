import { describe, expect, it } from 'vitest'
import { rich, __spansForTest as spans } from './lexical'

/**
 * Bold in seed prose.
 *
 * Every generator writes `**like this**`, and for a long time every one of
 * them shipped two literal asterisks to the page, because Lexical carries
 * emphasis as a bitmask on the text node rather than as markup in the string.
 * Nothing threw and no test failed - the page simply read as though somebody
 * had left a draft marker in. These tests are what makes that visible.
 */
describe('spans', () => {
  it('leaves plain text as a single node', () => {
    const [node, ...rest] = spans('Nothing emphasised here.')
    expect(rest).toHaveLength(0)
    expect(node.text).toBe('Nothing emphasised here.')
    expect(node.format).toBe(0)
  })

  it('marks a bold run with format 1 and drops the asterisks', () => {
    const nodes = spans('It releases on **6 October 2026**, per the store page.')
    expect(nodes.map((node) => node.text)).toEqual([
      'It releases on ',
      '6 October 2026',
      ', per the store page.',
    ])
    expect(nodes.map((node) => node.format)).toEqual([0, 1, 0])
  })

  it('handles more than one run, and a run at the very start', () => {
    const nodes = spans('**Yes** - it lists **Online Co-op**')
    expect(nodes.map((node) => node.text)).toEqual(['Yes', ' - it lists ', 'Online Co-op'])
    expect(nodes.map((node) => node.format)).toEqual([1, 0, 1])
  })

  it('leaves an unclosed marker alone rather than eating the rest of the line', () => {
    // A lone `**` is far more likely to be a typo than an intent to bold
    // everything that follows, and swallowing the tail would be the worse
    // failure of the two.
    const nodes = spans('A stray ** in the prose')
    expect(nodes).toHaveLength(1)
    expect(nodes[0].text).toBe('A stray ** in the prose')
  })

  it('does not treat an empty pair as bold', () => {
    const nodes = spans('An empty **** pair')
    expect(nodes.map((node) => node.text).join('')).toBe('An empty **** pair')
  })
})

describe('rich', () => {
  it('applies bold inside headings and list items, not just paragraphs', () => {
    const doc = rich({ h: 'The **only** heading' }, { ul: ['**One**', 'Two'] })
    const [heading, list] = doc.root.children as unknown as [
      { children: { text: string; format: number }[] },
      { children: { children: { text: string; format: number }[] }[] },
    ]

    expect(heading.children.map((node) => node.format)).toEqual([0, 1, 0])
    expect(list.children[0].children[0]).toMatchObject({ text: 'One', format: 1 })
    expect(list.children[1].children[0]).toMatchObject({ text: 'Two', format: 0 })
  })

  it('never leaves a literal asterisk pair in rendered text', () => {
    const doc = rich('A **bold** claim', { h: '**Heading**' }, { ul: ['**Item**'] })
    expect(JSON.stringify(doc)).not.toContain('**')
  })
})

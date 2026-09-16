import { describe, expect, it } from 'vitest'
import { rich, __spansForTest } from './lexical'

/*
  `spans` now returns link nodes as well as text nodes, and every assertion
  below is about text. Narrowed once here rather than at forty call sites.
*/
type Span = { text: string; format: number }
const spans = (value: string) => __spansForTest(value) as unknown as Span[]

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

describe('links', () => {
  it('turns [words](/path) into a link node and keeps the words', () => {
    const [before, anchor, after] = __spansForTest(
      'If you can confirm something, [tell us](/corrections) about it.',
    ) as unknown as [
      { text: string },
      { type: string; fields: { url: string; newTab: boolean }; children: { text: string }[] },
      { text: string },
    ]
    expect(before.text).toBe('If you can confirm something, ')
    expect(anchor.type).toBe('link')
    expect(anchor.fields.url).toBe('/corrections')
    expect(anchor.fields.newTab).toBe(false)
    expect(anchor.children[0].text).toBe('tell us')
    expect(after.text).toBe(' about it.')
  })

  it('opens an outbound link in a new tab and an internal one in place', () => {
    const [outbound] = __spansForTest('[the store page](https://example.com/app)') as unknown as [
      { fields: { newTab: boolean } },
    ]
    expect(outbound.fields.newTab).toBe(true)
  })

  it('leaves bracket text that is not a link alone', () => {
    const nodes = spans('A [bracketed] aside, and [another] one.')
    expect(nodes).toHaveLength(1)
    expect(nodes[0].text).toBe('A [bracketed] aside, and [another] one.')
  })

  it('applies bold and links in the order they appear', () => {
    const nodes = __spansForTest('**Bold** then [a link](/x) then more.') as unknown as {
      type?: string
      text?: string
      format?: number
    }[]
    expect(nodes.map((node) => node.type ?? 'text')).toEqual(['text', 'text', 'link', 'text'])
    expect(nodes[0].format).toBe(1)
  })
})

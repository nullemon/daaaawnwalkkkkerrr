import { describe, expect, it } from 'vitest'
import {
  articleHeadings,
  articleWords,
  headingId,
  readingMinutes,
  WORDS_PER_MINUTE,
} from './article'

/** A Lexical text node. */
const text = (value: string) => ({ type: 'text', text: value })

const heading = (value: string, tag: 'h2' | 'h3' = 'h2') => ({
  type: 'heading',
  tag,
  children: [text(value)],
})

const paragraph = (value: string) => ({ type: 'paragraph', children: [text(value)] })

const body = (...children: unknown[]) => ({ root: { type: 'root', children } })

describe('headingId', () => {
  it('is the heading, lower case and hyphenated', () => {
    expect(headingId('Time is spent by your actions')).toBe('time-is-spent-by-your-actions')
  })

  it('drops apostrophes rather than turning them into hyphens', () => {
    expect(headingId("Brencis' coronation")).toBe('brencis-coronation')
  })

  it('keeps an accented name readable instead of eating the vowel', () => {
    expect(headingId('Zoltán and the court')).toBe('zoltan-and-the-court')
  })

  it('never returns an empty anchor', () => {
    // `href="#"` jumps to the top of the page, which is the one thing a
    // contents link must not do.
    expect(headingId('。。。')).toBe('section')
  })

  it('numbers repeats only when a document is being walked', () => {
    const seen = new Map<string, number>()
    expect(headingId('Notes', seen)).toBe('notes')
    expect(headingId('Notes', seen)).toBe('notes-2')
    expect(headingId('Notes', seen)).toBe('notes-3')
    // Without the map it is a pure function of the text.
    expect(headingId('Notes')).toBe('notes')
    expect(headingId('Notes')).toBe('notes')
  })
})

describe('articleHeadings', () => {
  it('reads h2 and h3 in document order', () => {
    const found = articleHeadings(
      body(
        paragraph('An opening.'),
        heading('Stamina'),
        paragraph('Words.'),
        heading('Why it matters', 'h3'),
        heading('The clock'),
      ),
    )
    expect(found).toEqual([
      { id: 'stamina', text: 'Stamina', level: 2 },
      { id: 'why-it-matters', text: 'Why it matters', level: 3 },
      { id: 'the-clock', text: 'The clock', level: 2 },
    ])
  })

  it('joins the runs of a part-bolded heading into one title', () => {
    const found = articleHeadings(
      body({ type: 'heading', tag: 'h2', children: [text('Best '), text('early'), text(' gear')] }),
    )
    expect(found).toEqual([{ id: 'best-early-gear', text: 'Best early gear', level: 2 }])
  })

  it('disambiguates two headings with the same words', () => {
    const found = articleHeadings(body(heading('Notes'), paragraph('x'), heading('Notes')))
    expect(found.map((h) => h.id)).toEqual(['notes', 'notes-2'])
  })

  it('ignores an empty heading, so the list and the renderer still agree', () => {
    const found = articleHeadings(body({ type: 'heading', tag: 'h2', children: [] }, heading('Real')))
    expect(found).toEqual([{ id: 'real', text: 'Real', level: 2 }])
  })

  it('is empty for a body that is missing, malformed or has no headings', () => {
    expect(articleHeadings(null)).toEqual([])
    expect(articleHeadings({})).toEqual([])
    expect(articleHeadings({ root: { children: 'not an array' } })).toEqual([])
    expect(articleHeadings(body(paragraph('Just prose.')))).toEqual([])
  })
})

describe('articleWords', () => {
  it('counts the words in every text node, headings included', () => {
    expect(articleWords(body(heading('Two words'), paragraph('three more words here')))).toBe(6)
  })

  it('is zero for nothing at all', () => {
    expect(articleWords(null)).toBe(0)
    expect(articleWords(body())).toBe(0)
  })
})

describe('readingMinutes', () => {
  it('rounds to the nearest minute at the stated rate', () => {
    expect(readingMinutes(WORDS_PER_MINUTE * 4)).toBe(4)
    expect(readingMinutes(WORDS_PER_MINUTE * 4 + 10)).toBe(4)
  })

  it('never claims a written article is a zero-minute read', () => {
    expect(readingMinutes(12)).toBe(1)
  })

  it('is zero for an empty body, so the caller can print nothing', () => {
    expect(readingMinutes(0)).toBe(0)
  })
})

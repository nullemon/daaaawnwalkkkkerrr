/**
 * Minimal builders for Lexical's JSON shape, so seed content can be written as
 * plain strings instead of hand-rolled editor state.
 */

type TextNode = {
  type: 'text'
  text: string
  detail: number
  format: number
  mode: 'normal'
  style: string
  version: 1
}

const text = (value: string, format = 0): TextNode => ({
  type: 'text',
  text: value,
  detail: 0,
  format,
  mode: 'normal',
  style: '',
  version: 1,
})

/**
 * Split a string into text nodes, honouring `**bold**`.
 *
 * Lexical stores emphasis as a bitmask on the text node - 1 is bold - rather
 * than as markup inside the string, so a `**` written by a seed generator is
 * just two asterisks and renders as two asterisks. It did, on every page that
 * used one, from the day these builders were written: nothing errors, no test
 * fails, and the page reads as though somebody forgot to finish it.
 *
 * Anything with no `**` in it takes the same path it always did, so this
 * cannot change a page that was already correct.
 */
const BOLD = /\*\*(.+?)\*\*/g

/**
 * And `[words](/path)`, for the same reason.
 *
 * A link is the one piece of a sentence that cannot survive being seeded as
 * plain text. "If you can confirm something here, tell us" with the link gone
 * is not a slightly plainer sentence — it is a corrections page nobody can
 * reach from the page asking them to use it. Three of the seeded legal
 * sentences and most of the about page carry one, and without this the choice
 * was between seeding them broken and not seeding them at all.
 *
 * Custom links only: an internal link stores a document id, and a seeder that
 * guessed one would point at whatever happened to have that id.
 */
const LINK = /\[([^\]]+)\]\((\/[^)\s]*|https?:\/\/[^)\s]+)\)/g

type LinkNode = {
  type: 'link'
  fields: { linkType: 'custom'; url: string; newTab: boolean }
  children: TextNode[]
  direction: 'ltr'
  format: ''
  indent: 0
  version: 3
}

const link = (label: string, url: string): LinkNode => ({
  type: 'link',
  fields: { linkType: 'custom', url, newTab: !url.startsWith('/') },
  children: [text(label)],
  direction: 'ltr',
  format: '',
  indent: 0,
  version: 3,
})

const spans = (value: string): (TextNode | LinkNode)[] => {
  if (!value.includes('**') && !value.includes('](')) return [text(value)]

  const nodes: (TextNode | LinkNode)[] = []
  let cursor = 0

  /*
    Both patterns in one pass, in the order they appear. Running them one after
    the other would mean the second one re-reading text the first had already
    turned into nodes — and the bold pass rewriting the label inside a link is
    exactly the kind of thing that produces a page nobody can explain.
  */
  const matches = [...value.matchAll(BOLD), ...value.matchAll(LINK)].sort(
    (a, b) => (a.index ?? 0) - (b.index ?? 0),
  )

  for (const match of matches) {
    const at = match.index ?? 0
    if (at < cursor) continue
    if (at > cursor) nodes.push(text(value.slice(cursor, at)))
    nodes.push(match[0].startsWith('**') ? text(match[1], 1) : link(match[1], match[2]))
    cursor = at + match[0].length
  }

  if (cursor < value.length) nodes.push(text(value.slice(cursor)))
  return nodes.length > 0 ? nodes : [text(value)]
}

const paragraph = (value: string) => ({
  type: 'paragraph',
  children: spans(value),
  direction: 'ltr' as const,
  format: '' as const,
  indent: 0,
  textFormat: 0,
  version: 1,
})

const heading = (value: string, tag: 'h2' | 'h3' = 'h2') => ({
  type: 'heading',
  tag,
  children: spans(value),
  direction: 'ltr' as const,
  format: '' as const,
  indent: 0,
  version: 1,
})

const listItem = (value: string, index: number) => ({
  type: 'listitem',
  children: spans(value),
  direction: 'ltr' as const,
  format: '' as const,
  indent: 0,
  value: index + 1,
  version: 1,
})

const list = (values: string[]) => ({
  type: 'list',
  listType: 'bullet' as const,
  start: 1,
  tag: 'ul' as const,
  children: values.map(listItem),
  direction: 'ltr' as const,
  format: '' as const,
  indent: 0,
  version: 1,
})

export { spans as __spansForTest }

export type Block = string | { h: string } | { h3: string } | { ul: string[] }

const toNode = (block: Block) => {
  if (typeof block === 'string') return paragraph(block)
  if ('h' in block) return heading(block.h, 'h2')
  if ('h3' in block) return heading(block.h3, 'h3')
  return list(block.ul)
}

/** Build a Lexical document from an ordered list of simple blocks. */
export const rich = (...blocks: Block[]) => ({
  root: {
    type: 'root',
    children: blocks.map(toNode),
    direction: 'ltr' as const,
    format: '' as const,
    indent: 0,
    version: 1,
  },
})

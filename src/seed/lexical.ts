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

const paragraph = (value: string) => ({
  type: 'paragraph',
  children: [text(value)],
  direction: 'ltr' as const,
  format: '' as const,
  indent: 0,
  textFormat: 0,
  version: 1,
})

const heading = (value: string, tag: 'h2' | 'h3' = 'h2') => ({
  type: 'heading',
  tag,
  children: [text(value)],
  direction: 'ltr' as const,
  format: '' as const,
  indent: 0,
  version: 1,
})

const listItem = (value: string, index: number) => ({
  type: 'listitem',
  children: [text(value)],
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

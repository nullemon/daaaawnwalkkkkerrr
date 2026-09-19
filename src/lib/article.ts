/**
 * What can be read off an article body without asking anybody.
 *
 * Two derivations, both from the Lexical document a guide already stores: the
 * headings it contains, and how many words it is. Neither is a fact about the
 * game — they are facts about the page, measured from the page — so they are
 * safe to print in a way a segment cost or a release date would not be.
 *
 * Deliberately free of Payload types and of React, the same way
 * `src/lib/reachability.ts` is, so the ids the contents list links to and the
 * ids the renderer stamps on the headings can be proved to agree in a unit
 * test with no database anywhere near it. **That agreement is the whole
 * point.** A contents block built from one derivation and headings stamped by
 * another is a page of links that scroll nowhere, and nothing errors: the
 * anchors are valid, the headings are there, the browser simply does not move.
 */

/** A heading in an article body, with the id its anchor will carry. */
export type Heading = { id: string; text: string; level: 2 | 3 }

/*
  Loose shapes rather than Lexical's own.

  A serialised editor state is `unknown` to this module on purpose: it arrives
  from the database, it is walked defensively, and anything that is not the
  shape below is skipped rather than thrown over. A guide with a malformed
  body should lose its contents list, not its page.
*/
type Node = {
  type?: unknown
  tag?: unknown
  text?: unknown
  children?: unknown
}

const childrenOf = (node: unknown): Node[] => {
  const kids = (node as Node | null)?.children
  return Array.isArray(kids) ? (kids as Node[]) : []
}

/**
 * Nodes that end a run of words.
 *
 * Lexical splits a text node at every format boundary, so "Best **early**
 * gear" is three nodes that must be joined with nothing at all or the heading
 * reads "Best  early  gear" and anchors as `best--early--gear`. Joining every
 * node with nothing is the other half of the same trap: a heading and the
 * paragraph after it then run together as one word, and the word count comes
 * back one short per block. So the separator goes in at the block boundary and
 * nowhere else.
 */
const BLOCKS = new Set([
  'paragraph',
  'heading',
  'listitem',
  'list',
  'quote',
  'horizontalrule',
  'tablecell',
  'tablerow',
  'table',
  'upload',
  'block',
])

/**
 * Every text node under this one, in reading order.
 *
 * `gap` is what goes between blocks: nothing when the caller wants one
 * heading's own words, a space when it is counting the words of a document.
 */
const textOf = (node: unknown, gap = ''): string => {
  const self = (node as Node | null)?.text
  const own = typeof self === 'string' ? self : ''
  const parts = childrenOf(node).map((child) => {
    const inner = textOf(child, gap)
    return gap && BLOCKS.has(String(child?.type)) ? `${gap}${inner}${gap}` : inner
  })
  return own + parts.join('')
}

/**
 * The words of one node, with no separators added.
 *
 * Exported for the renderer, which has a heading node in its hand and needs
 * exactly the string `articleHeadings` would have derived from it. Two
 * implementations of "what does this heading say" is how the list and the
 * anchors would come to disagree, which is the failure this module exists to
 * make impossible.
 */
export const nodeText = (node: unknown): string => textOf(node)

/*
  The combining marks NFKD splits an accent into, built from their code points
  rather than typed into a character class.

  Two reasons, and the second is the one this repository keeps meeting. A
  combining mark in source is invisible in every editor, so a reader cannot
  check it; and an escape written to disk through this project's tooling has
  been interpreted on the way at least four times, in four files, to different
  authors — see the header of `tools/no-control-characters.test.mjs`. Built
  from a number there is no escape left to interpret and nothing invisible to
  read past.
*/
const COMBINING = new RegExp(
  '[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']',
  'g',
)

/**
 * A heading's anchor, derived from its own words.
 *
 * `slugify` in `src/fields/shared.ts` is the same idea and is deliberately not
 * reused: it is the rule for a *stored* slug, an editor can overwrite what it
 * produces, and changing it would move every URL on the site. This one has to
 * be a pure function of the text and nothing else, because it is computed
 * twice per page — once for the list and once for the heading — and the two
 * copies never meet.
 *
 * `NFKD` and then `COMBINING`, so "Zoltán" anchors as `zoltan`. Normalising
 * alone is not enough and is worse than not normalising: it splits the accent
 * into a mark the class below reads as punctuation, which cut the word in half
 * as `zolta-n` — an anchor that works, and is wrong.
 *
 * `seen` is how two headings with the same words get different anchors. Pass
 * one map through a whole document and the second "Notes" becomes `notes-2`.
 * Omit it and the id is the bare slug — which is what a caller wants when it
 * is asking about one heading rather than walking a document.
 */
export const headingId = (text: string, seen?: Map<string, number>): string => {
  const base =
    text
      .normalize('NFKD')
      .replace(COMBINING, '')
      .toLowerCase()
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      /*
        A heading written entirely in a script this strips — Japanese, Cyrillic
        — would otherwise anchor as the empty string, and `href="#"` jumps to
        the top of the page rather than to the heading. Named rather than
        dropped: a numbered anchor still works, and the numbering falls out of
        `seen` for free.
      */
      || 'section'
  if (!seen) return base
  const nth = (seen.get(base) ?? 0) + 1
  seen.set(base, nth)
  return nth === 1 ? base : `${base}-${nth}`
}

/**
 * The h2s and h3s of an article body, in reading order.
 *
 * Only those two levels. An h1 in a body would be a second page title and does
 * not appear in ours; h4 and below are too fine to be worth a jump link, and a
 * contents list with four levels of indent is the thing it was meant to save
 * the reader from.
 *
 * The walk is depth-first and in document order, which is also the order
 * Payload's JSX converter runs in — so a `seen` map threaded through this
 * function and a `seen` map threaded through the renderer produce the same
 * numbering. See `LinkedRichText`.
 */
export const articleHeadings = (data: unknown): Heading[] => {
  const root = (data as { root?: unknown } | null)?.root
  if (!root) return []

  const seen = new Map<string, number>()
  const found: Heading[] = []

  const walk = (node: unknown) => {
    const type = (node as Node | null)?.type
    const tag = (node as Node | null)?.tag
    if (type === 'heading' && (tag === 'h2' || tag === 'h3')) {
      const text = textOf(node).trim()
      // A heading with no words is markup, not a section. It gets no anchor
      // here and none from the renderer either, so the two still agree.
      if (text) found.push({ id: headingId(text, seen), text, level: tag === 'h2' ? 2 : 3 })
      return
    }
    for (const child of childrenOf(node)) walk(child)
  }

  walk(root)
  return found
}

/** Every word in an article body, counted once. */
export const articleWords = (data: unknown): number => {
  const root = (data as { root?: unknown } | null)?.root
  if (!root) return 0
  return textOf(root, ' ').trim().split(/\s+/).filter(Boolean).length
}

/**
 * Words per minute, and why this number.
 *
 * 220 is the middle of the range silent adult reading of ordinary prose is
 * usually measured at. It is an estimate and the interface says so — the
 * string is "{count} min read", not "takes {count} minutes" — and it is
 * derived from this page's own word count rather than typed in per guide,
 * so it cannot go stale when somebody edits the article.
 */
export const WORDS_PER_MINUTE = 220

/** Roughly how long an article takes to read, never less than a minute. */
export const readingMinutes = (words: number): number =>
  words <= 0 ? 0 : Math.max(1, Math.round(words / WORDS_PER_MINUTE))

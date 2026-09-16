/**
 * The legal pages as an editor left them, with the legal *details* still
 * coming from Site settings.
 *
 * `legal-pages` holds the prose — headings and rich text bodies — because a
 * privacy policy changes on the Tuesday a processor changes, not on a release.
 * What it deliberately does not hold is who the entity is, the contact
 * address, the postal address or the governing law. Those stay in Site
 * settings and arrive here as `{entity}`, `{email}`, `{address}`,
 * `{jurisdiction}` and `{site}`.
 *
 * That split is the whole point, and this module is what enforces it. A value
 * typed straight into a body is a value `LegalGap` can no longer see, so a
 * page still running on stand-in details would look finished and print no
 * warning — the exact failure `legalProvisional` exists to prevent.
 * Substituted here, every one of them renders through `LegalField` and stays
 * marked in red until somebody says the details are real.
 *
 * Nothing on this path ever becomes a string of markup. The bodies are
 * editable, and an admin-editable string that reaches the DOM through
 * `dangerouslySetInnerHTML` is a stored-XSS hole waiting for the first editor
 * account that should not have had one — the same reason the attribution
 * template is split rather than interpolated. Every piece below is a React
 * child, so angle brackets somebody types come out as text.
 */
import Link from 'next/link'
import { Fragment, cache, createElement, type ReactNode } from 'react'
import { LegalField } from '@/components/LegalGap'
import { RichText } from '@/components/RichText'
import { hasRichText, splitTokens } from './copy'
import { client } from './payload'
import type { LegalPage, SiteSetting } from '@/payload-types'

export type LegalPageKey = 'privacy' | 'terms' | 'contact'
export type LegalCopy = NonNullable<LegalPage['privacy']>
export type LegalSection = NonNullable<LegalCopy['sections']>[number]

/**
 * The global, or nothing at all.
 *
 * Three pages that carry a site's only privacy policy must not depend on a
 * global having been saved. An unsaved global, or one whose table is not in
 * the database yet — production builds run with `push: false`, so that is the
 * ordinary state of a new global between a schema change and a rebuild — has
 * to fall back to the wording compiled into the page rather than 500 it.
 * Failing open here is what makes every field in `LegalPages` genuinely
 * optional.
 */
export const getLegalPages = cache(async (): Promise<Partial<LegalPage>> => {
  try {
    const payload = await client()
    return await payload.findGlobal({ slug: 'legal-pages', depth: 0 })
  } catch {
    return {}
  }
})

export const getLegalCopy = cache(async (page: LegalPageKey): Promise<LegalCopy> => {
  const pages = await getLegalPages()
  return pages[page] ?? {}
})

/**
 * The sections to render, if any. An empty list means the page prints the
 * wording it shipped with — blank is "use the built-in", never "print
 * nothing". See `src/lib/copy.ts`.
 */
export const legalSections = (copy: LegalCopy): LegalSection[] => copy.sections ?? []

export type LegalTokens = Record<string, ReactNode>

/**
 * The legal details as elements, each still carrying its own marker.
 *
 * `LegalField` prints a plain value once the details are real and a red
 * `<mark>` naming the admin field until then, so handing these through
 * unchanged is what keeps the page honest about what it does not yet know.
 *
 * `extra` is for the tokens one page computes for itself — the terms page
 * names the actual rightsholders rather than gesturing at them, and that list
 * is read from the games, not from settings.
 */
export const legalTokens = (settings: SiteSetting, extra: LegalTokens = {}): LegalTokens => {
  const provisional = settings.legalProvisional !== false

  const marked = (field: string, value?: string | null, multiline = false): ReactNode => {
    const node = createElement(LegalField, { field, value, provisional })
    // A postal address is the one legal value that is genuinely several lines,
    // and a paragraph collapses its newlines into one run-on line.
    return multiline ? createElement('span', { style: { whiteSpace: 'pre-line' } }, node) : node
  }

  return {
    entity: marked('legal entity', settings.legalEntity),
    email: marked('contact email', settings.contactEmail),
    address: marked('postal address', settings.postalAddress, true),
    jurisdiction: marked('jurisdiction', settings.jurisdiction),
    site: settings.siteName,
    ...extra,
  }
}

/**
 * Fill the tokens in one line of text.
 *
 * A token nobody knows is left exactly as it was typed: `{juristiction}` on
 * the page is a typo somebody fixes in a minute, while a sentence with a
 * silent hole in it is a sentence nobody notices is wrong. A token that *is*
 * known but resolves to nothing renders as nothing — that is a computed
 * absence, such as a network with no published games having no rightsholders
 * to name.
 */
export const fillNodes = (text: string, tokens: LegalTokens): ReactNode[] =>
  splitTokens(text).map((part, index) =>
    createElement(
      Fragment,
      { key: index },
      'text' in part ? part.text : part.token in tokens ? tokens[part.token] : `{${part.token}}`,
    ),
  )

type LexicalNode = {
  type?: string
  tag?: string
  text?: string
  format?: number | string
  fields?: { url?: string | null; newTab?: boolean | null; linkType?: string | null }
  children?: LexicalNode[]
}

/**
 * Lexical stores emphasis as a bitmask on the text node rather than as markup
 * inside the string. These are the tags Payload's own JSX converter emits, so
 * a body reads the same whichever of the two paths in `legalBody` drew it.
 */
const FORMATS: [number, string][] = [
  [1, 'strong'],
  [2, 'em'],
  [4, 's'],
  [8, 'u'],
  [16, 'code'],
  [32, 'sub'],
  [64, 'sup'],
]

const BLOCK_TAGS: Record<string, string> = {
  paragraph: 'p',
  quote: 'blockquote',
  listitem: 'li',
}

const renderChildren = (node: LexicalNode, tokens: LegalTokens): ReactNode[] =>
  (node.children ?? []).map((child, index) => renderNode(child, index, tokens))

const renderLink = (node: LexicalNode, key: number, tokens: LegalTokens): ReactNode => {
  const children = renderChildren(node, tokens)
  const href = node.fields?.url ?? ''

  // An internal link stores a document id, and turning one into a URL needs a
  // lookup this module deliberately does not do. The words are worth more than
  // a dead anchor, so they print unlinked rather than as href="#".
  if (!href || node.fields?.linkType === 'internal') {
    return createElement(Fragment, { key }, children)
  }

  // Root-relative means somewhere on this host, so it routes like every other
  // internal link on the page.
  if (href.startsWith('/')) return createElement(Link, { key, href }, children)

  const newTab = Boolean(node.fields?.newTab)
  return createElement(
    'a',
    {
      key,
      href,
      rel: newTab ? 'noopener noreferrer' : undefined,
      target: newTab ? '_blank' : undefined,
    },
    children,
  )
}

const renderNode = (node: LexicalNode, key: number, tokens: LegalTokens): ReactNode => {
  if (!node || typeof node !== 'object') return null

  if (node.type === 'text') {
    const format = typeof node.format === 'number' ? node.format : 0
    let rendered: ReactNode = createElement(Fragment, null, ...fillNodes(node.text ?? '', tokens))
    for (const [bit, tag] of FORMATS) {
      if (format & bit) rendered = createElement(tag, null, rendered)
    }
    return createElement(Fragment, { key }, rendered)
  }

  if (node.type === 'link' || node.type === 'autolink') return renderLink(node, key, tokens)
  if (node.type === 'linebreak') return createElement('br', { key })
  if (node.type === 'horizontalrule') return createElement('hr', { key })
  if (node.type === 'heading') {
    return createElement(node.tag ?? 'h2', { key }, renderChildren(node, tokens))
  }
  if (node.type === 'list') {
    return createElement(node.tag ?? 'ul', { key }, renderChildren(node, tokens))
  }

  const tag = BLOCK_TAGS[node.type ?? '']
  if (tag) return createElement(tag, { key }, renderChildren(node, tokens))

  // A node type this walker has never heard of still has words inside it, and
  // on a legal page losing the words is the worse of the two failures.
  return createElement(Fragment, { key }, renderChildren(node, tokens))
}

/**
 * The same token pattern `copy.ts` uses. A serialised document cannot match it
 * by accident, because JSON puts a quote after every `{`.
 */
const TOKEN_SOMEWHERE = /\{[a-zA-Z][a-zA-Z0-9_]*\}/

/**
 * One section body.
 *
 * A body with no token in it goes through Payload's own renderer, which knows
 * about node types this file does not — uploads, tables, whatever an editor
 * reaches for next. The walker below is only for bodies that carry a token,
 * and it exists for one reason: a substituted detail has to arrive as an
 * element so `LegalGap` can still mark it, and no string can do that without
 * becoming markup on the way in.
 */
export const legalBody = (body: unknown, tokens: LegalTokens): ReactNode => {
  if (!hasRichText(body)) return null
  const root = (body as { root?: LexicalNode }).root
  if (!root) return null

  if (!TOKEN_SOMEWHERE.test(JSON.stringify(root))) return createElement(RichText, { data: body })

  // `.prose` nests on purpose — it is the wrapper `RichText` puts round the
  // other path, so the two render with the same spacing. See globals.css.
  return createElement('div', { className: 'prose' }, ...renderChildren(root, tokens))
}

import Link from 'next/link'
import type { ReactNode } from 'react'
import {
  RichText as LexicalRichText,
  type JSXConverters,
} from '@payloadcms/richtext-lexical/react'
import type { SerializedEditorState } from '@payloadcms/richtext-lexical/lexical'
import {
  insideProtectedNode,
  matchText,
  type LinkTarget,
  type Matcher,
  type NodeWithParent,
} from '@/lib/autolink'
import { getMatcher, type LinkScope } from '@/lib/link-index'

/**
 * Composed prose, with the entities it names turned into links.
 *
 * `src/lib/autolink.ts` finds the mentions and `src/lib/link-index.ts` decides
 * what is in the index; this file is only the rendering, and it has three rules
 * of its own.
 *
 * **Output is React nodes, never markup.** There is no `dangerouslySetInnerHTML`
 * anywhere in here and there must not be. Some of the strings this renders are
 * editable in the admin, and an editable string that reaches the DOM as markup
 * is a stored-XSS hole waiting for the first editor account that should not
 * have had one — the same rule `splitTokens` in `src/lib/copy.ts` and the
 * licence-attribution template have followed since they were written. A
 * mechanism that builds anchors out of arbitrary text is exactly where somebody
 * would be tempted to make an exception.
 *
 * **Same host uses `next/link`, another host uses `<a>`.** Every wiki, the
 * people host and the companies host are separate origins, and `Link` across
 * one adds a prefetch that cannot work. `link-index.ts` has already decided
 * which a target is; this file only honours it.
 *
 * **First mention per block, not per page.** Wikipedia and Fandom both link the
 * first occurrence and leave the rest plain, and a paragraph where every proper
 * noun is a link is unreadable. The scope is one `Linked` or `LinkedRichText`
 * element — so a lede and the body below it may each link a name once, and the
 * body's ten paragraphs share one set between them.
 *
 * Per block rather than per page deliberately. A page-wide set would have to be
 * request-scoped mutable state shared between components React is free to
 * render in any order, so which of the lede and the body got the link would
 * depend on which resolved first — and the symptom would be prerendered HTML
 * that changes between builds with nothing to explain it. A lede and a body are
 * also separated by a rule and a header on the page, which is the case
 * Wikipedia's own guidance makes for relinking in a later section.
 */

type Props = { scope: LinkScope }

/** One matched run, as the element its host situation calls for. */
const anchor = (target: LinkTarget, text: string, key: number): ReactNode =>
  target.external ? (
    /* Another origin: a plain anchor. `Link` would prefetch a document it can
       never client-navigate to. */
    <a className="elink" href={target.href} key={key} title={target.name}>
      {text}
    </a>
  ) : (
    <Link className="elink" href={target.href} key={key} title={target.name}>
      {text}
    </Link>
  )

const toNodes = (
  text: string,
  matcher: Matcher,
  scope: LinkScope,
  seen: Set<string>,
): ReactNode[] =>
  matchText(text, matcher, { game: scope.game, self: scope.self, seen }).map((part, index) =>
    part.target ? anchor(part.target, part.text, index) : part.text,
  )

/**
 * A sentence composed by us — a summary, a lede, a note — with its links in.
 *
 * Takes a string rather than children, because the matcher works on text and
 * anything already rendered as elements has been linked or deliberately not.
 * Renders nothing at all for an empty value, so a call site can pass a record's
 * optional summary straight through.
 */
export async function Linked({
  text,
  scope,
}: Props & { text?: string | null }): Promise<ReactNode> {
  if (!text || !text.trim()) return null
  const matcher = await getMatcher(scope.host, scope.game)
  /* A fragment, with no element of its own: this renders inside whatever the
     call site already had - a `.lede`, a `.note`, a table cell - and wrapping
     it in a span of ours would change the layout of each of them differently. */
  return <>{toNodes(text, matcher, scope, new Set())}</>
}

/*
  `IS_CODE` is a format bit on the text node itself rather than a node type, so
  it is checked here as well as in `insideProtectedNode`. Lexical marks inline
  code both ways depending on how it was typed.
*/
const IS_CODE = 1 << 4

/*
  The format bits, applied outside the links rather than inside them.

  Copied in shape from Payload's own `TextJSXConverter`, which this replaces:
  it wraps the node's plain string, and there is no way to hand it nodes. The
  order matters only in that the anchors end up innermost, so `**Resonance: A
  Plague Tale Legacy**` renders as a bold link rather than a bold word next to
  a link.
*/
const WRAPPERS: [number, (children: ReactNode) => ReactNode][] = [
  [1, (children) => <strong>{children}</strong>],
  [1 << 1, (children) => <em>{children}</em>],
  [1 << 2, (children) => <span style={{ textDecoration: 'line-through' }}>{children}</span>],
  [1 << 3, (children) => <span style={{ textDecoration: 'underline' }}>{children}</span>],
  [1 << 5, (children) => <sub>{children}</sub>],
  [1 << 6, (children) => <sup>{children}</sup>],
]

/**
 * A rich text body with the entities its paragraphs name turned into links.
 *
 * Only the `text` converter is replaced, so every other node — lists, uploads,
 * tables, blocks — keeps rendering exactly as it did. Matching is per text
 * node: a name that an editor has half-bolded is two nodes and will not be
 * found, which is a miss rather than a wrong link and is the direction this
 * whole mechanism errs in.
 */
export async function LinkedRichText({
  data,
  scope,
}: Props & { data?: unknown }): Promise<ReactNode> {
  if (!data) return null
  const matcher = await getMatcher(scope.host, scope.game)

  /*
    One set for the whole body, created here and mutated as the converter runs.

    Safe because `convertLexicalToJSX` is synchronous and depth-first: the
    traversal order is the reading order of the document, so "first mention"
    means the first one a reader meets. It is created per render rather than
    per module, or one page's links would depend on which pages built before it.
  */
  const seen = new Set<string>()

  const converters: JSXConverters = {
    text: ({ node, parent }) => {
      const value = String((node as { text?: unknown }).text ?? '')
      const format = Number((node as { format?: unknown }).format ?? 0)

      let rendered: ReactNode =
        format & IS_CODE || insideProtectedNode(parent as NodeWithParent)
          ? value
          : toNodes(value, matcher, scope, seen)

      if (format & IS_CODE) rendered = <code>{rendered}</code>
      for (const [bit, wrap] of WRAPPERS) if (format & bit) rendered = wrap(rendered)
      return rendered
    },
  }

  return (
    <div className="prose">
      <LexicalRichText
        converters={({ defaultConverters }) => ({ ...defaultConverters, ...converters })}
        data={data as SerializedEditorState}
      />
    </div>
  )
}

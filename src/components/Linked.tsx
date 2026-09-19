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
import { headingId, nodeText } from '@/lib/article'

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
 * A body cut into sections at its own top-level h2s.
 *
 * Returns editor states that each hold one run of blocks, so they can be
 * rendered in order with something between them. The first group is whatever
 * comes before the first heading — usually the opening paragraphs — and is
 * kept even when empty is not possible, because an article that opens on a
 * heading simply has no intro group.
 *
 * Only `h2`, and only at the top level. An `h3` is a subsection and a picture
 * dropped between a heading and the sentence explaining it separates a claim
 * from its support, which is the failure `ImageCredit` documents from the
 * other direction.
 */
const splitAtHeadings = (data: unknown): unknown[] => {
  const root = (data as { root?: { children?: unknown[] } })?.root
  const children = root?.children
  if (!Array.isArray(children) || children.length === 0) return []

  const groups: unknown[][] = []
  let current: unknown[] = []

  for (const child of children) {
    const node = child as { type?: string; tag?: string }
    if (node?.type === 'heading' && node.tag === 'h2' && current.length > 0) {
      groups.push(current)
      current = []
    }
    current.push(child)
  }
  if (current.length > 0) groups.push(current)

  return groups.map((group) => ({ ...(data as object), root: { ...root, children: group } }))
}

/**
 * A rich text body with the entities its paragraphs name turned into links.
 *
 * Two converters are replaced and no others — `text`, for the links, and
 * `heading`, for the anchors a contents list needs — so every other node
 * (lists, uploads, tables, blocks) keeps rendering exactly as it did. Matching
 * is per text node: a name that an editor has half-bolded is two nodes and
 * will not be found, which is a miss rather than a wrong link and is the
 * direction this whole mechanism errs in.
 */
export async function LinkedRichText({
  data,
  scope,
  headingIds = false,
  interleave = [],
}: Props & {
  data?: unknown
  /**
   * Give every h2 and h3 an `id`, so something can link to it.
   *
   * Opt-in, and only the guide route asks for it. Two reasons it is not simply
   * always on. An id has to be unique in a *document*, and several pages
   * render four or eight of these side by side — `[game]/about` renders seven
   * — so stamping every body on such a page would put the same `#sourcing` on
   * two headings and the browser would jump to whichever came first. And an id
   * is a URL somebody bookmarks: turning it on for a collection means
   * committing to it, which is a decision per route rather than a default.
   *
   * The ids come from `headingId` in `src/lib/article.ts`, which is also what
   * builds the contents list. Both walk the document depth-first and share the
   * numbering rule, so the link and its target cannot drift — that agreement
   * is what `src/lib/article.test.ts` pins, and it is the only thing standing
   * between a tidy contents block and a column of links that scroll nowhere.
   */
  headingIds?: boolean
  /**
   * Figures to place between the body's sections.
   *
   * An article on this network had its pictures in one stack underneath the
   * prose, under a heading, which is a gallery — the reader has finished
   * reading by the time they reach it. Passing them here puts them where a
   * magazine puts them: at the breaks between sections, in order.
   *
   * Empty is the normal case and behaves exactly as before.
   */
  interleave?: ReactNode[]
}): Promise<ReactNode> {
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

  /*
    The same argument as `seen`, one node type along: the converter runs
    synchronously and depth-first, which is the reading order of the document,
    so a counter threaded through it numbers repeated headings exactly as
    `articleHeadings` does walking the same tree.
  */
  const headings = new Map<string, number>()

  const converters: JSXConverters = {
    /*
      Replaces Payload's own heading converter, which is four lines and emits
      `<h2>{children}</h2>` with no id. Everything about it is kept except the
      attribute — including reading the tag off the node, so an h3 stays an h3.

      The id is derived from the heading's *own text*, read here rather than
      from the children this returns: the children are React nodes by then, and
      some of them are anchors the autolinker put in.
    */
    heading: ({ node, nodesToJSX }) => {
      const Tag = node.tag
      const children = nodesToJSX({ nodes: node.children })
      if (!headingIds || (Tag !== 'h2' && Tag !== 'h3')) return <Tag>{children}</Tag>
      const text = nodeText(node).trim()
      // An empty heading gets no id, which is what `articleHeadings` does with
      // it too — so the list and the document still agree.
      if (!text) return <Tag>{children}</Tag>
      return (
        <Tag className="anchored" id={headingId(text, headings)}>
          {children}
        </Tag>
      )
    },
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

  const render = (slice: unknown, key?: number) => (
    <LexicalRichText
      key={key}
      converters={({ defaultConverters }) => ({ ...defaultConverters, ...converters })}
      data={slice as SerializedEditorState}
    />
  )

  /*
    No pictures to place, or nowhere to place them: one pass, exactly as this
    component has always worked.
  */
  const sections = interleave.length > 0 ? splitAtHeadings(data) : []
  if (interleave.length === 0 || sections.length < 2) {
    return (
      <div className="prose">
        {render(data)}
        {interleave}
      </div>
    )
  }

  /*
    Pictures between sections, not stacked after the article.

    **Every slice shares `seen` and `headings`**, because the converters close
    over them and are rebuilt per slice from the same two maps. That is the
    whole reason this splits the data rather than calling `LinkedRichText`
    three times from the route: a fresh call would get fresh maps, and the
    autolinker's "link a name once per body" rule would quietly become "once
    per section" — the same term linked three times down one page — while the
    heading counter restarted and handed two sections the same `id`, which the
    contents block scrolls by.

    React renders these siblings in document order and the converters run
    synchronously during that render, so "first mention" still means the first
    one a reader meets.
  */
  const placed: ReactNode[] = []
  for (const [index, section] of sections.entries()) {
    placed.push(render(section, index))
    /*
      Spread across the boundaries rather than dropped after the first few.
      `+1` on both sides so nothing lands after the final section, where it
      would sit against the article's foot and read as the gallery this
      replaced.
    */
    const slot = Math.round(((index + 1) * (interleave.length + 1)) / sections.length) - 1
    const figure = interleave[slot]
    if (figure && index < sections.length - 1 && !placed.includes(figure)) placed.push(figure)
  }

  /* Anything the spread could not fit still gets printed rather than dropped. */
  for (const figure of interleave) if (!placed.includes(figure)) placed.push(figure)

  return <div className="prose">{placed}</div>
}

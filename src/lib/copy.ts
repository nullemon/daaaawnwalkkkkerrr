/**
 * Editable copy: choosing between what an editor wrote and what the code
 * shipped, and filling the tokens in whichever won.
 *
 * Two rules hold everywhere this is used.
 *
 * **Blank means "use the built-in".** Not "print nothing". An empty text field
 * in Payload arrives as `''`, `null` or `undefined` depending on how it got
 * there, and treating any of those as an instruction to render an empty
 * heading is how a half-filled record silently deletes a page's title. The
 * only way to show nothing is an explicit switch — the `hide` checkbox on a
 * callout, for instance.
 *
 * **Counts are never typed in.** A sentence that says how many quests a wiki
 * has is a sentence that goes wrong the week somebody adds a quest, and this
 * is the site whose entire pitch is that its numbers are real. So the editable
 * string carries `{count}` and the number arrives at render time. That is also
 * why an unknown token is left visible rather than blanked: `{gmae}` on the
 * page is a typo somebody fixes in a minute, and a silently missing number is
 * a wrong sentence nobody notices.
 */

export type Tokens = Record<string, string | number | null | undefined>

const TOKEN = /\{([a-zA-Z][a-zA-Z0-9_]*)\}/g

/** The editor's version if there is one, otherwise the built-in. */
export const pick = <T>(override: T | null | undefined, fallback: T): T => {
  if (override === null || override === undefined) return fallback
  if (typeof override === 'string' && override.trim() === '') return fallback
  return override
}

/**
 * Fill `{token}` placeholders. A token with no value is left as it was typed,
 * so a mistake is visible on the page rather than a gap in a sentence.
 */
export const fill = (text: string, tokens: Tokens): string =>
  text.replace(TOKEN, (whole, name: string) => {
    const value = tokens[name]
    if (value === null || value === undefined || value === '') return whole
    return typeof value === 'number' ? value.toLocaleString('en-GB') : value
  })

/** `pick` and `fill` in one, which is how almost every call site uses them. */
export const copy = (
  override: string | null | undefined,
  fallback: string,
  tokens: Tokens = {},
): string => fill(pick(override, fallback), tokens)

export type Part = { text: string } | { token: string }

/**
 * The same substitution, as parts, for the tokens that render as elements.
 *
 * `{rightsholders}` is two company names linked to their profiles on another
 * host; `{storeLink}` is an outbound anchor. Those cannot be a string, and the
 * alternative — letting an editable string reach the DOM as markup — is the
 * stored-XSS hole the attribution template already refuses to be. See the note
 * on `attributionText` in `SiteSettings`.
 */
export const splitTokens = (text: string): Part[] => {
  const parts: Part[] = []
  let last = 0
  for (const match of text.matchAll(TOKEN)) {
    const at = match.index ?? 0
    if (at > last) parts.push({ text: text.slice(last, at) })
    parts.push({ token: match[1] })
    last = at + match[0].length
  }
  if (last < text.length) parts.push({ text: text.slice(last) })
  return parts
}

/**
 * True when a rich text value actually has something in it.
 *
 * Lexical's "empty" is not `null`. A field somebody clicked into and left
 * gives back a root holding one empty paragraph, and anything that tests the
 * value for truthiness — or, as the first version of this did, stringifies it
 * and looks for characters — reads that as content and renders a blank
 * section where the built-in prose used to be. So this looks for text nodes
 * with text in them and nothing else.
 */
type LexicalNode = { text?: unknown; children?: unknown }

const hasText = (node: unknown): boolean => {
  if (!node || typeof node !== 'object') return false
  const { text, children } = node as LexicalNode
  if (typeof text === 'string' && text.trim() !== '') return true
  // An image or an embed is content too, and has no text of its own.
  if (!Array.isArray(children)) {
    const type = (node as { type?: unknown }).type
    return typeof type === 'string' && (type === 'upload' || type === 'horizontalrule')
  }
  return children.some(hasText)
}

export const hasRichText = (value: unknown): boolean => {
  const root = (value as { root?: { children?: unknown[] } } | null)?.root
  if (!root || !Array.isArray(root.children) || root.children.length === 0) return false
  return root.children.some(hasText)
}

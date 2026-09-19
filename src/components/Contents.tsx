import { Icon } from './Icon'
import { getUi } from '@/lib/ui'
import type { Heading } from '@/lib/article'

/**
 * Jump links to an article's own sections.
 *
 * ## Where the links come from
 *
 * `articleHeadings` in `src/lib/article.ts`, walking the same Lexical document
 * `LinkedRichText` is about to render with `headingIds` on. Both derive the id
 * from the heading's own words with the same function and the same numbering,
 * which is the only reason a link here and a heading down the page cannot
 * drift apart — and drifting apart would be silent: the anchors would be
 * perfectly valid and the browser would simply not move.
 *
 * ## Why fewer than three headings renders nothing
 *
 * A contents box containing one link is furniture pretending to be navigation.
 * It costs a reader a glance, tells them nothing they could not see, and on a
 * short guide it is taller than the section it indexes. Silence is the same
 * answer `RelatedList` and `EntityImage` give an empty list, and for the same
 * reason.
 *
 * ## Why it is not in the rail
 *
 * The sidebar stacks *under* the body on a phone, so a contents list living
 * there would sit below the article it indexes — useless exactly where a jump
 * list is worth most. Rendering it twice and hiding one copy per width is two
 * DOM copies of one list and two `<nav>` landmarks for a screen reader to
 * announce. So it sits at the top of the body column, which works at every
 * width and is where the reader already is.
 */
export async function Contents({ headings }: { headings: Heading[] }) {
  if (headings.length < 3) return null
  const ui = await getUi()

  return (
    <nav className="contents" aria-labelledby="contents-head">
      <h2 className="contents-head" id="contents-head">
        <Icon name="list" size={15} className="ic" />
        {ui.t('article.contents')}
      </h2>
      <ol className="contents-list">
        {headings.map((heading) => (
          <li key={heading.id} data-level={heading.level}>
            <a href={`#${heading.id}`}>{heading.text}</a>
          </li>
        ))}
      </ol>
    </nav>
  )
}

import { Linked } from './Linked'
import type { LinkScope } from '@/lib/link-index'
import { getUi } from '@/lib/ui'

/**
 * The three or four things a reader would take away if they read nothing else.
 *
 * ## Written, never derived
 *
 * Fextralife's "Key Takeaways" block is the pattern; the important half is the
 * half that is invisible in their markup, which is that a person wrote it.
 * Ours is an editable field on the guide (`takeaways`), **blank on every guide
 * until somebody fills it in**, and a blank one renders nothing at all.
 *
 * It is deliberately not generated from the body — not the first sentence of
 * each section, not the first paragraph, not a summary of any kind. A
 * generated summary of compiled prose is a new claim nobody checked, printed
 * in the one place on the page designed to be read instead of the article. The
 * rest of this repository refuses the same trade every time it comes up: there
 * is no default fact-check sentence, no byline stand-in, no release date
 * inferred from a store page. This is that rule, one block along.
 *
 * ## Why the points run through `Linked`
 *
 * They are composed prose and composed prose names records that have pages,
 * exactly like the lede above them. The first mention in this block is linked
 * and the rest are not, per `Linked`'s own rule.
 */
export async function Takeaways({
  points,
  scope,
}: {
  points?: ({ point?: string | null } | null)[] | null
  scope: LinkScope
}) {
  const list = (points ?? [])
    .map((entry) => entry?.point?.trim())
    .filter((point): point is string => Boolean(point))

  if (list.length === 0) return null
  const ui = await getUi()

  return (
    <aside className="takeaways" aria-labelledby="takeaways-head">
      <h2 className="takeaways-head" id="takeaways-head">
        {ui.t('article.takeaways')}
      </h2>
      <ul className="takeaways-list">
        {list.map((point) => (
          <li key={point}>
            <Linked text={point} scope={scope} />
          </li>
        ))}
      </ul>
    </aside>
  )
}

'use client'

import type { ReactNode } from 'react'
import { Icon } from './Icon'
import { useUi } from './UiStrings'
import { useIsEditor } from './EditorOnly'

/**
 * The small coloured words: confidence, phase, rarity.
 *
 * ## Why this is a client component
 *
 * It reads the label overrides, and those reach a component one of two ways —
 * `await getUi()` on the server or `useUi()` in the browser. `DataTable` is a
 * client component and renders two of these in its cells, so the server form
 * is not available to it; and twenty-four server pages import the same three
 * badges, so a second client-only copy would be the duplicated enum map this
 * whole registry exists to delete. One client component, one set of wording.
 * The cost is a hydration boundary around a `<span>`, which is the cheaper of
 * the two mistakes.
 */

/**
 * How much this record is trusted — **shown to editors, not to readers**.
 *
 * Every figure on this site came from somebody else's site, and those sites
 * contradict each other, so how much to trust a number is a real question and
 * the rating is recorded on every record. It is an *editorial* rating: a note
 * from the people compiling the wiki to the people compiling the wiki, about
 * which entries still need a second source. The owner's decision is that a
 * reader has no use for it, and the pages say what they know and what they do
 * not in plain sentences instead.
 *
 * So this renders nothing for anybody who is not signed in as an editor.
 * `useIsEditor` explains how that is decided on a site where every page is
 * prerendered and the markup cannot know who is asking.
 *
 * **Nothing is hidden from a reader by CSS.** The badge is not in the document
 * at all until the check says otherwise, which is the difference between a
 * control that is absent and text that is present and covered over — the
 * second is `4206c56` and this file is not going to repeat it.
 *
 * `null` rather than an empty `<span>`, because a caller putting this in a row
 * of badges should get a row without it rather than a gap where it was.
 */
export function Confidence({ level }: { level?: string | null }) {
  const ui = useUi()
  const isEditor = useIsEditor()
  const safe = level === 'high' || level === 'medium' || level === 'low' ? level : 'low'
  if (!isEditor) return null
  return (
    <span className="badge" data-level={safe} title={ui.label('confidence-why', safe)}>
      {ui.label('confidence', safe)}
    </span>
  )
}

export function PhaseBadge({ phase }: { phase?: string | null }) {
  const ui = useUi()
  if (!phase || phase === 'either') {
    return <span className="badge">{ui.label('phase', 'either')}</span>
  }
  return (
    <span className="badge" data-phase={phase}>
      <Icon name={phase === 'day' ? 'sun' : 'moon'} size={12} />
      {ui.label('phase', phase === 'day' ? 'day' : 'night')}
    </span>
  )
}

export function Badge({ children }: { children: ReactNode }) {
  return <span className="badge">{children}</span>
}

/**
 * Rarity is a real signal in this genre, so it carries its own colour.
 *
 * The class still comes from the stored value rather than the label — renaming
 * "legendary" in the admin must not take `rarity-legendary` out of the CSS with
 * it, which is the silent-failure mode `pnpm check:css` exists to catch.
 */
export function Rarity({ value }: { value?: string | null }) {
  const ui = useUi()
  if (!value) return null
  return <span className={`badge rarity-${value}`}>{ui.label('rarity', value)}</span>
}

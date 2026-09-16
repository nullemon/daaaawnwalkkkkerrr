'use client'

import type { ReactNode } from 'react'
import { Icon } from './Icon'
import { useUi } from './UiStrings'

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
 * Every figure on this site came from somebody else's site, and those sites
 * contradict each other. How much to trust a number is the point of the
 * project, so the badge is never optional.
 */
export function Confidence({ level }: { level?: string | null }) {
  const ui = useUi()
  const safe = level === 'high' || level === 'medium' || level === 'low' ? level : 'low'
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

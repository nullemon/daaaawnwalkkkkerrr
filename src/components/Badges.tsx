import type { ReactNode } from 'react'
import { Icon } from './Icon'

type Level = 'high' | 'medium' | 'low'

const CONFIDENCE_TITLE: Record<Level, string> = {
  high: 'Agreed by multiple independent sources',
  medium: 'One good source, or minor disagreement between sources',
  low: 'Contested, inferred, or not yet confirmed anywhere we trust',
}

/**
 * Every figure on this site came from somebody else's site, and those sites
 * contradict each other. How much to trust a number is the point of the
 * project, so the badge is never optional.
 */
export function Confidence({ level }: { level?: string | null }) {
  const safe = (level === 'high' || level === 'medium' || level === 'low' ? level : 'low') as Level
  return (
    <span className="badge" data-level={safe} title={CONFIDENCE_TITLE[safe]}>
      {safe}
    </span>
  )
}

export function PhaseBadge({ phase }: { phase?: string | null }) {
  if (!phase || phase === 'either') {
    return <span className="badge">Any time</span>
  }
  return (
    <span className="badge" data-phase={phase}>
      <Icon name={phase === 'day' ? 'sun' : 'moon'} size={12} />
      {phase === 'day' ? 'Day' : 'Night'}
    </span>
  )
}

export function Badge({ children }: { children: ReactNode }) {
  return <span className="badge">{children}</span>
}

/** Rarity is a real signal in this genre, so it carries its own colour. */
export function Rarity({ value }: { value?: string | null }) {
  if (!value) return null
  return <span className={`badge rarity-${value}`}>{value}</span>
}

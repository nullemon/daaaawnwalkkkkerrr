import type { ReactNode } from 'react'

type Level = 'high' | 'medium' | 'low'

const CONFIDENCE_TITLE: Record<Level, string> = {
  high: 'Agreed by multiple independent sources',
  medium: 'One good source, or minor disagreement between sources',
  low: 'Contested, inferred, or not yet confirmed anywhere we trust',
}

/**
 * Every figure on this site came from somebody else's site, and those sites
 * contradict each other. Showing how much to trust a number is the point of
 * the project, so the badge is never optional.
 */
export function Confidence({ level }: { level?: string | null }) {
  const safe = (level === 'high' || level === 'medium' || level === 'low' ? level : 'low') as Level
  return (
    <span className="badge" data-level={safe} title={CONFIDENCE_TITLE[safe]}>
      {safe} confidence
    </span>
  )
}

export function PhaseBadge({ phase }: { phase?: string | null }) {
  if (!phase || phase === 'either') {
    return <span className="badge">Day or night</span>
  }
  return (
    <span className="badge" data-phase={phase}>
      {phase === 'day' ? 'Day only' : 'Night only'}
    </span>
  )
}

export function Badge({ children }: { children: ReactNode }) {
  return <span className="badge">{children}</span>
}

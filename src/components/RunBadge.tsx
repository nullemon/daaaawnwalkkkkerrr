'use client'

import Link from 'next/link'
import { useRun } from './RunProvider'
import { TOTAL_SEGMENTS } from '@/lib/segments'

/** Persistent run readout in the header. Hidden until a run actually exists. */
export function RunBadge() {
  const { hydrated, started, day, phase, segmentsLeft, completed } = useRun()
  if (!hydrated || !started) return null

  const spentPct = ((TOTAL_SEGMENTS - segmentsLeft) / TOTAL_SEGMENTS) * 100

  return (
    <Link href="/my-run" className="run-badge" title="Your run">
      <span className="run-badge-bar" aria-hidden="true">
        <span style={{ width: `${spentPct}%` }} />
      </span>
      <span className="run-badge-text mono">
        Day {day} {phase === 'night' ? 'night' : 'daylight'} · {segmentsLeft} left ·{' '}
        {completed.length} done
      </span>
    </Link>
  )
}

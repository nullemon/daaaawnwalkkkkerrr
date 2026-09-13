'use client'

import Link from 'next/link'
import { useRun } from './RunProvider'
import { TOTAL_SEGMENTS } from '@/lib/segments'

/** Persistent run readout. Hidden until a run actually exists. */
export function RunBadge() {
  const { hydrated, started, day, segmentsLeft } = useRun()
  if (!hydrated || !started) return null

  const spentPct = ((TOTAL_SEGMENTS - segmentsLeft) / TOTAL_SEGMENTS) * 100

  return (
    <Link href="/tools/run-checker" className="run-badge" title="Your run">
      <span className="run-badge-bar" aria-hidden="true">
        <span style={{ width: `${spentPct}%` }} />
      </span>
      <span className="run-badge-fig">
        Day <b>{day}</b> · <b>{segmentsLeft}</b> left
      </span>
    </Link>
  )
}

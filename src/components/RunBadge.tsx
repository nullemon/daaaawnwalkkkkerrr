'use client'

import Link from 'next/link'
import { useRun } from './RunProvider'
import { useUi } from './UiStrings'
import { TOTAL_SEGMENTS } from '@/lib/segments'

/** Persistent run readout. Hidden until a run actually exists. */
export function RunBadge() {
  const ui = useUi()
  const { hydrated, started, day, segmentsLeft } = useRun()
  if (!hydrated || !started) return null

  const spentPct = ((TOTAL_SEGMENTS - segmentsLeft) / TOTAL_SEGMENTS) * 100

  return (
    <Link href="/tools/run-checker" className="run-badge" title={ui.t('run.badge-title')}>
      <span className="run-badge-bar" aria-hidden="true">
        <span style={{ width: `${spentPct}%` }} />
      </span>
      <span className="run-badge-fig">
        {ui.t('run.badge-day')} <b>{day}</b> · <b>{segmentsLeft}</b> {ui.t('run.badge-left')}
      </span>
    </Link>
  )
}

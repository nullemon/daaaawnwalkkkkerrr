'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { useRun } from './RunProvider'
import { useUi } from './UiStrings'
import { fill } from '@/lib/copy'
import {
  checkRun,
  summariseRun,
  type EndingNode,
  type QuestNode,
  type ReachabilityStatus,
} from '@/lib/reachability'

/**
 * "You can still reach 4 of 7", and which four.
 *
 * The endings index used to be a static list of seven, identical for a player
 * on day 2 and a player on day 28 — which is exactly backwards, since the
 * whole point of the endings is that the clock takes them away from you. This
 * puts the same answer the run checker gives on the page where people are
 * actually choosing what to aim for.
 *
 * Renders nothing until a run exists. Someone browsing without a run wants the
 * reference, not a nag to start one.
 */

const STATUS_TONE: Record<ReachabilityStatus, 'high' | 'medium' | 'low'> = {
  achieved: 'high',
  reachable: 'high',
  tight: 'medium',
  'out-of-time': 'low',
  'locked-out': 'low',
}

export function RunOutlook({
  quests,
  endings,
  heading,
}: {
  quests: QuestNode[]
  endings: EndingNode[]
  /** Falls back to the registry; passed only where a page wants its own. */
  heading?: string
}) {
  const ui = useUi()
  const run = useRun()

  const outlook = useMemo(
    () =>
      summariseRun(
        checkRun(endings, quests, {
          segmentsSpent: run.segmentsSpent,
          completedQuestIds: run.completed,
        }),
      ),
    [endings, quests, run.segmentsSpent, run.completed],
  )

  if (!run.hydrated || !run.started) return null

  return (
    <section className="section" aria-labelledby="outlook-heading">
      <div className="section-head">
        <h2 id="outlook-heading">{heading ?? ui.t('outlook.heading')}</h2>
        <span className="eyebrow">
          {fill(ui.t('outlook.eyebrow'), { day: run.day, left: run.segmentsLeft })}
        </span>
      </div>

      <p className="outlook-headline">
        {ui.t('outlook.reach')} <b>{outlook.openCount}</b>{' '}
        {fill(ui.t('outlook.of'), { total: outlook.totalCount })}
        {outlook.tightCount > 0 ? (
          <>
            {' '}
            — <b>{outlook.tightCount}</b> {ui.t('outlook.tight')}
          </>
        ) : null}
        {outlook.lostCount > 0 ? (
          <>
            . <b>{outlook.lostCount}</b>{' '}
            {ui.t(outlook.lostCount === 1 ? 'outlook.gone-one' : 'outlook.gone-many')}
          </>
        ) : (
          '.'
        )}
      </p>

      <ul className="outlook-list">
        {outlook.results.map((result) => (
          <li key={result.ending.id} data-status={result.status}>
            <Link href={`/endings/${result.ending.slug}`}>{result.ending.title}</Link>
            {/* Not an ending you aim for, so it is kept out of the tally above
                and labelled for what it is. */}
            {result.ending.isFailure ? (
              <span className="badge" title={ui.t('outlook.failure-title')}>
                {ui.t('outlook.failure-state')}
              </span>
            ) : (
              <span className="badge" data-level={STATUS_TONE[result.status]}>
                {ui.label('ending-status', result.status)}
              </span>
            )}
            {result.outstanding.length > 0 ? (
              <span className="note">
                {fill(
                  ui.t(
                    result.outstanding.length === 1
                      ? 'run.quests-left-one'
                      : 'run.quests-left-many',
                  ),
                  { count: result.outstanding.length },
                )}
                {result.unknownCostCount > 0
                  ? ui.t('outlook.some-uncosted')
                  : fill(ui.t('outlook.segments'), { count: result.maxCost })}
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      <p className="note">
        {ui.t('outlook.based-on')}{' '}
        <Link href="/run">{ui.t('outlook.dashboard-link')}</Link>{' '}
        {ui.t('outlook.dashboard-tail')}{' '}
        <Link href="/tools/run-checker">{ui.t('outlook.checker-link')}</Link>.
      </p>
    </section>
  )
}

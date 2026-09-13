'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { useRun } from './RunProvider'
import {
  STATUS_LABELS,
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
  heading = 'Where your run stands',
}: {
  quests: QuestNode[]
  endings: EndingNode[]
  heading?: string
}) {
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
    <section className="section outlook" aria-labelledby="outlook-heading">
      <div className="section-head">
        <h2 id="outlook-heading">{heading}</h2>
        <span className="eyebrow">
          Day {run.day} · {run.segmentsLeft} segments left
        </span>
      </div>

      <p className="outlook-headline">
        You can still reach <b>{outlook.openCount}</b> of {outlook.totalCount}
        {outlook.tightCount > 0 ? (
          <>
            {' '}
            — <b>{outlook.tightCount}</b> of them with no room for detours
          </>
        ) : null}
        {outlook.lostCount > 0 ? (
          <>
            . <b>{outlook.lostCount}</b> {outlook.lostCount === 1 ? 'is' : 'are'} gone.
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
              <span className="badge" title="Reached by running out of days, not by choosing it">
                Failure state
              </span>
            ) : (
              <span className="badge" data-level={STATUS_TONE[result.status]}>
                {STATUS_LABELS[result.status]}
              </span>
            )}
            {result.outstanding.length > 0 ? (
              <span className="note">
                {result.outstanding.length} quest{result.outstanding.length === 1 ? '' : 's'} left
                {result.unknownCostCount > 0 ? ', some uncosted' : ` · ${result.maxCost} segments`}
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      <p className="note">
        Based on the run in your browser. <Link href="/run">Open the dashboard</Link> for what to do
        next, or <Link href="/tools/run-checker">change what you have finished</Link>.
      </p>
    </section>
  )
}

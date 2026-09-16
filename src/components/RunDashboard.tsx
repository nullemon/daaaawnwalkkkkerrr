'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { useRun } from './RunProvider'
import { Icon } from './Icon'
import {
  checkRun,
  STATUS_LABELS,
  summariseRun,
  type EndingNode,
  type QuestNode,
} from '@/lib/reachability'
import { TOTAL_DAYS, TOTAL_SEGMENTS, formatSegments } from '@/lib/segments'

/**
 * One page that answers "where am I, and what should I do next?".
 *
 * The pieces existed — a clock, a tick list, a reachability solver — but they
 * were on three different pages, so keeping a run meant holding the joins in
 * your head. This is the page you leave open on the second monitor.
 *
 * Everything here is derived, never stored: endings compute their own chains,
 * so a correction in the admin changes this page too, and nothing can drift.
 */
export function RunDashboard({
  quests,
  endings,
}: {
  quests: QuestNode[]
  endings: EndingNode[]
}) {
  const { day, phase, completed, segmentsSpent, segmentsLeft, hydrated, started, reset } = useRun()

  const results = useMemo(
    () => checkRun(endings, quests, { segmentsSpent, completedQuestIds: completed }),
    [endings, quests, segmentsSpent, completed],
  )

  /**
   * "Time Runs Out" is excluded from the tally on both sides. It is reached by
   * failing rather than choosing, so counting it as an open ending would mean
   * the figure never drops below one and a doomed run would still read "1
   * ending open" — the one outcome the player was trying to avoid.
   */
  const outlook = useMemo(() => summariseRun(results), [results])
  const live = outlook.results.filter(
    (r) => !r.ending.isFailure && r.status !== 'out-of-time' && r.status !== 'locked-out',
  )
  const secured = results.filter((r) => r.status === 'achieved' && !r.ending.isFailure)
  const lost = outlook.lostCount

  // What to actually go and do: the first outstanding quest of the cheapest
  // route still open. One answer, not a list of lists.
  const nextUp = useMemo(() => {
    for (const result of live) {
      if (result.outstanding.length > 0) return { quest: result.outstanding[0], via: result.ending }
    }
    return null
  }, [live])

  if (!hydrated) {
    return <p className="note">Reading your run…</p>
  }

  const dayPct = Math.min(100, Math.round((segmentsSpent / TOTAL_SEGMENTS) * 100))

  return (
    <div className="dashboard">
      <div className="statrow">
        <div className="statbox">
          <span className="statbox-label">Day</span>
          <span className="statbox-value">
            {day} <span className="statbox-of">of {TOTAL_DAYS}</span>
          </span>
          <span className="statbox-sub">{phase === 'day' ? 'Daytime' : 'Night'}</span>
        </div>
        <div className="statbox" data-tone={segmentsLeft < 60 ? 'risk' : undefined}>
          <span className="statbox-label">Segments left</span>
          <span className="statbox-value">{segmentsLeft}</span>
          <span className="statbox-sub">{segmentsSpent} spent of {TOTAL_SEGMENTS}</span>
        </div>
        <div className="statbox">
          <span className="statbox-label">Quests done</span>
          <span className="statbox-value">{completed.length}</span>
          <span className="statbox-sub">of {quests.length} catalogued</span>
        </div>
        <div className="statbox" data-tone={live.length === 0 ? 'risk' : 'good'}>
          <span className="statbox-label">Endings open</span>
          <span className="statbox-value">{live.length}</span>
          <span className="statbox-sub">
            {secured.length > 0 ? `${secured.length} already secured` : `${lost} closed off`}
          </span>
        </div>
      </div>

      <div className="meter" data-tone={segmentsLeft < 60 ? 'risk' : undefined} aria-hidden="true">
        <span style={{ width: `${dayPct}%` }} />
      </div>

      {!started && completed.length === 0 ? (
        <div className="callout">
          <h2>Nothing tracked yet</h2>
          <p>
            Tick a quest anywhere on the site and it appears here. Nothing is sent anywhere —
            it lives in this browser until you decide otherwise.
          </p>
        </div>
      ) : null}

      {nextUp ? (
        <section className="panel">
          <div className="panel-head">
            <h2>Do this next</h2>
            <span className="meta">cheapest route still open</span>
          </div>
          <p className="nextup">
            <Link href={`/quests/${nextUp.quest.slug}`}>{nextUp.quest.title}</Link>
            <span className="nextup-why">
              first outstanding step towards{' '}
              <Link href={`/endings/${nextUp.via.slug}`}>{nextUp.via.title}</Link>
            </span>
          </p>
        </section>
      ) : null}

      <section className="panel">
        <div className="panel-head">
          <h2>Every ending, from here</h2>
          <span className="meta">{results.length} routes</span>
        </div>
        <ul className="endinglist">
          {results.map((result) => {
            const floor = result.unknownCostCount > 0
            return (
              <li key={result.ending.id} data-status={result.status}>
                <div className="endinglist-top">
                  <Link href={`/endings/${result.ending.slug}`}>{result.ending.title}</Link>
                  <span className="status" data-status={result.status}>
                    {STATUS_LABELS[result.status]}
                  </span>
                </div>
                <p className="endinglist-meta">
                  {result.status === 'achieved' ? (
                    'Every required quest is done.'
                  ) : result.status === 'locked-out' ? (
                    <>
                      Closed by{' '}
                      {result.blockedBy.map((quest, index) => (
                        <span key={quest.id}>
                          {index > 0 ? ', ' : ''}
                          <Link href={`/quests/${quest.slug}`}>{quest.title}</Link>
                        </span>
                      ))}
                      .
                    </>
                  ) : result.chainLength === 0 ? (
                    'No source records a required questline for this one yet.'
                  ) : (
                    <>
                      {result.outstanding.length} of {result.chainLength} quests left
                      {result.maxCost > 0
                        ? ` · ${floor ? 'at least ' : ''}${formatSegments(result.maxCost)}`
                        : ''}
                      {floor ? ` · ${result.unknownCostCount} with no published cost` : ''}
                      {/*
                        A latest-start day computed from a chain whose costs are
                        mostly unpublished is not a deadline, it is arithmetic on
                        zeroes — and "start by day 30" would read as reassurance
                        the data cannot give. Shown only when every cost is known.
                      */}
                      {!floor && result.latestStartDay !== null && result.status !== 'out-of-time'
                        ? ` · start by day ${result.latestStartDay}`
                        : ''}
                    </>
                  )}
                </p>
              </li>
            )
          })}
        </ul>
      </section>

      {completed.length > 0 ? (
        <p className="note">
          <button type="button" className="linkish" onClick={() => reset()}>
            Clear this run
          </button>{' '}
          — removes every tick and puts the clock back to day 1.
        </p>
      ) : null}
    </div>
  )
}

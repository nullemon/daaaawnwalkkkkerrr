'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useRun } from './RunProvider'
import { SpoilerSetting } from './Spoiler'
import {
  STATUS_LABELS,
  checkRun,
  type EndingNode,
  type QuestNode,
  type ReachabilityStatus,
} from '@/lib/reachability'
import {
  SEGMENTS_PER_PHASE,
  TOTAL_DAYS,
  TOTAL_SEGMENTS,
  formatSegments,
  type Phase,
} from '@/lib/segments'

const STATUS_TONE: Record<ReachabilityStatus, 'good' | 'warn' | 'risk'> = {
  achieved: 'good',
  reachable: 'good',
  tight: 'warn',
  'out-of-time': 'risk',
  'locked-out': 'risk',
}

const BADGE_LEVEL = { good: 'high', warn: 'medium', risk: 'low' } as const

export function RunChecker({ quests, endings }: { quests: QuestNode[]; endings: EndingNode[] }) {
  const run = useRun()
  const [filter, setFilter] = useState('')

  const results = useMemo(
    () => checkRun(endings, quests, { segmentsSpent: run.segmentsSpent, completedQuestIds: run.completed }),
    [endings, quests, run.segmentsSpent, run.completed],
  )

  /**
   * The single most useful line on the page: of everything still outstanding,
   * which quests can be started *right now* — prerequisites met, and playable
   * in the phase the player is currently in.
   */
  const availableNow = useMemo(() => {
    const done = new Set(run.completed)
    const wanted = new Map<string, QuestNode>()
    for (const result of results) {
      if (result.status === 'locked-out' || result.ending.isFailure) continue
      for (const quest of result.outstanding) {
        const ready = quest.prereqs.every((id) => done.has(id))
        const rightPhase = quest.phase === 'either' || quest.phase === run.phase
        if (ready && rightPhase) wanted.set(quest.id, quest)
      }
    }
    return [...wanted.values()]
  }, [results, run.completed, run.phase])

  const visibleQuests = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    if (!needle) return quests
    return quests.filter((quest) => quest.title.toLowerCase().includes(needle))
  }, [quests, filter])

  const spentPct = (run.segmentsSpent / TOTAL_SEGMENTS) * 100

  return (
    <div className="checker">
      <section className="checker-panel" aria-labelledby="where-heading">
        <h2 id="where-heading">Where are you?</h2>
        <p className="note">
          Your journal shows the day. Segments only advance on actions marked with an hourglass, so
          this is a budget, not a clock.
        </p>

        <div className="field-row">
          <div className="field">
            <label htmlFor="run-day">Day</label>
            <input
              id="run-day"
              type="number"
              min={1}
              max={TOTAL_DAYS}
              value={run.day}
              onChange={(event) => run.setClock({ day: Number(event.target.value) || 1 })}
            />
          </div>
          <div className="field">
            <label htmlFor="run-phase">Phase</label>
            <select
              id="run-phase"
              value={run.phase}
              onChange={(event) => run.setClock({ phase: event.target.value as Phase })}
            >
              <option value="day">Day</option>
              <option value="night">Night</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="run-into">Segments into phase</label>
            <input
              id="run-into"
              type="number"
              min={0}
              max={SEGMENTS_PER_PHASE - 1}
              value={run.intoPhase}
              onChange={(event) => run.setClock({ intoPhase: Number(event.target.value) || 0 })}
            />
          </div>
        </div>

        <div className="budget">
          <div
            className="budget-bar"
            role="img"
            aria-label={`${run.segmentsSpent} of ${TOTAL_SEGMENTS} segments spent`}
          >
            <span className="budget-spent" style={{ width: `${spentPct}%` }} />
          </div>
          <div className="budget-figures">
            <span>
              <strong className="mono">{run.segmentsSpent}</strong> spent
            </span>
            <span>
              <strong className="mono">{run.segmentsLeft}</strong> left ({formatSegments(run.segmentsLeft)})
            </span>
          </div>
        </div>

        <SpoilerSetting />
      </section>

      <section className="checker-panel" aria-labelledby="done-heading">
        <div className="panel-head">
          <h2 id="done-heading">What have you finished?</h2>
          <button type="button" className="linkish" onClick={run.reset}>
            Reset run
          </button>
        </div>
        <p className="note">
          Ticked here or on any quest page — it is the same run either way, kept in this browser.
        </p>
        <div className="field">
          <label htmlFor="quest-filter">Filter quests</label>
          <input
            id="quest-filter"
            type="search"
            placeholder="Start typing a quest name"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </div>
        <ul className="quest-check">
          {visibleQuests.map((quest) => (
            <li key={quest.id}>
              <label>
                <input
                  type="checkbox"
                  id={`quest-${quest.slug}`}
                  checked={run.isDone(quest.id)}
                  onChange={() => run.toggleQuest(quest.id)}
                />
                <span>
                  {quest.title}
                  <span className="sub">
                    {quest.phase === 'either' ? 'Day or night' : `${quest.phase} only`}
                    {quest.costKnown ? ` · ${quest.timeMax} segments` : ' · cost unconfirmed'}
                  </span>
                </span>
              </label>
            </li>
          ))}
          {visibleQuests.length === 0 ? <li className="note">No quest matches that.</li> : null}
        </ul>
      </section>

      <section className="checker-results" aria-labelledby="next-heading">
        <h2 id="next-heading">What you can start right now</h2>
        {availableNow.length > 0 ? (
          <>
            <p className="note">
              Prerequisites met, and playable during {run.phase === 'night' ? 'the night' : 'the day'}.
              Everything else needs either another quest finished first or the other phase.
            </p>
            <ul className="next-up">
              {availableNow.map((quest) => (
                <li key={quest.id}>
                  <Link href={`/quests/${quest.slug}`}>{quest.title}</Link>
                  <span className="sub">
                    {quest.phase === 'either' ? 'Either phase' : `${quest.phase} only`}
                    {quest.costKnown ? ` · ${quest.timeMax} segments` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="note">
            Nothing in an ending chain is startable in this phase. Switch to{' '}
            {run.phase === 'night' ? 'day' : 'night'} above, or finish a prerequisite first.
          </p>
        )}
      </section>

      <section className="checker-results" aria-labelledby="results-heading">
        <h2 id="results-heading">What is still reachable</h2>
        <ul className="results">
          {results.map((result) => {
            const tone = STATUS_TONE[result.status]
            return (
              <li key={result.ending.id} className="result" data-tone={tone}>
                <div className="result-head">
                  <h3>
                    <Link href={`/endings/${result.ending.slug}`}>{result.ending.title}</Link>
                  </h3>
                  <span className="badge" data-level={BADGE_LEVEL[tone]}>
                    {STATUS_LABELS[result.status]}
                  </span>
                </div>

                {result.status === 'locked-out' ? (
                  <p className="result-detail">
                    Closed by {result.blockedBy.map((quest) => quest.title).join(', ')}. No amount of
                    remaining time reopens it.
                  </p>
                ) : result.chainLength === 0 ? (
                  <p className="result-detail">
                    {result.ending.isFailure
                      ? 'Reached by overrunning the thirty days. Nothing can bar it.'
                      : 'Needs no advance preparation. Decided at the finale, so it stays open as long as you get there.'}
                  </p>
                ) : result.status === 'achieved' ? (
                  <p className="result-detail">Everything this ending needs is already done.</p>
                ) : (
                  <p className="result-detail">
                    {result.outstanding.length} quest{result.outstanding.length === 1 ? '' : 's'} left
                    {result.unknownCostCount > 0
                      ? `, of which ${result.unknownCostCount} ${result.unknownCostCount === 1 ? 'has' : 'have'} no confirmed cost`
                      : ` · ${result.maxCost} segments of your ${result.segmentsLeft}`}
                    .
                  </p>
                )}

                {result.outstanding.length > 0 ? (
                  <details>
                    <summary>What is left</summary>
                    <ol className="chain">
                      {result.outstanding.map((quest, position) => (
                        <li key={quest.id}>
                          <span className="step">{String(position + 1).padStart(2, '0')}</span>
                          <Link href={`/quests/${quest.slug}`}>{quest.title}</Link>
                        </li>
                      ))}
                    </ol>
                  </details>
                ) : null}
              </li>
            )
          })}
        </ul>

        <div className="callout" data-tone="risk">
          <h2>Read these as a floor, not a verdict</h2>
          <p>
            Reliable per-quest segment costs are not published anywhere we trust, so the checker
            counts what it knows and tells you what it does not. The prerequisite and lock-out logic
            is sound. The arithmetic is only as good as the costs behind it.{' '}
            <Link href="/corrections">Send us real numbers</Link> and this sharpens for everyone.
          </p>
        </div>
      </section>
    </div>
  )
}

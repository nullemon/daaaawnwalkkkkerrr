'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
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
  segmentsSpentAt,
  type Phase,
} from '@/lib/segments'

const STORAGE_KEY = 'dw-run-state'

/** Opens mid-run rather than at day one, because that is when the question gets asked. */
const DEFAULT_DAY = 14
const DEFAULT_PHASE: Phase = 'night'

type Stored = { day: number; phase: Phase; intoPhase: number; done: string[] }

const STATUS_TONE: Record<ReachabilityStatus, string> = {
  achieved: 'good',
  reachable: 'good',
  tight: 'warn',
  'out-of-time': 'risk',
  'locked-out': 'risk',
}

export function RunChecker({ quests, endings }: { quests: QuestNode[]; endings: EndingNode[] }) {
  const [day, setDay] = useState(DEFAULT_DAY)
  const [phase, setPhase] = useState<Phase>(DEFAULT_PHASE)
  const [intoPhase, setIntoPhase] = useState(0)
  const [done, setDone] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)
  const [filter, setFilter] = useState('')

  // Restore a run in progress. This is the one bit of state worth keeping —
  // nobody wants to re-tick twelve quests on a second visit.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Stored
        if (typeof parsed.day === 'number') setDay(parsed.day)
        if (parsed.phase === 'day' || parsed.phase === 'night') setPhase(parsed.phase)
        if (typeof parsed.intoPhase === 'number') setIntoPhase(parsed.intoPhase)
        if (Array.isArray(parsed.done)) setDone(parsed.done)
      }
    } catch {
      // Blocked or corrupt storage just means starting from the defaults.
    }
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (!loaded) return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ day, phase, intoPhase, done }))
    } catch {
      // Not being able to save is not worth interrupting the user over.
    }
  }, [loaded, day, phase, intoPhase, done])

  const segmentsSpent = segmentsSpentAt({ day, phase, intoPhase })
  const segmentsLeft = TOTAL_SEGMENTS - segmentsSpent

  const results = useMemo(
    () => checkRun(endings, quests, { segmentsSpent, completedQuestIds: done }),
    [endings, quests, segmentsSpent, done],
  )

  const visibleQuests = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    if (!needle) return quests
    return quests.filter((quest) => quest.title.toLowerCase().includes(needle))
  }, [quests, filter])

  const toggle = (id: string) =>
    setDone((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    )

  const reset = () => {
    setDay(DEFAULT_DAY)
    setPhase(DEFAULT_PHASE)
    setIntoPhase(0)
    setDone([])
    setFilter('')
  }

  return (
    <div className="checker">
      <section className="checker-panel" aria-labelledby="where-heading">
        <h2 id="where-heading">Where are you?</h2>
        <p className="note">
          The game shows the day on your journal. Segments only advance on actions marked with an
          hourglass, so this is a budget rather than a clock.
        </p>

        <div className="field-row">
          <div className="field">
            <label htmlFor="run-day">Day</label>
            <input
              id="run-day"
              type="number"
              min={1}
              max={TOTAL_DAYS}
              value={day}
              onChange={(event) => setDay(Math.min(TOTAL_DAYS, Math.max(1, Number(event.target.value) || 1)))}
            />
          </div>
          <div className="field">
            <label htmlFor="run-phase">Phase</label>
            <select
              id="run-phase"
              value={phase}
              onChange={(event) => setPhase(event.target.value as Phase)}
            >
              <option value="day">Day</option>
              <option value="night">Night</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="run-into">Segments into the phase</label>
            <input
              id="run-into"
              type="number"
              min={0}
              max={SEGMENTS_PER_PHASE - 1}
              value={intoPhase}
              onChange={(event) =>
                setIntoPhase(Math.min(SEGMENTS_PER_PHASE - 1, Math.max(0, Number(event.target.value) || 0)))
              }
            />
          </div>
        </div>

        <div className="budget">
          <div
            className="budget-bar"
            role="img"
            aria-label={`${segmentsSpent} of ${TOTAL_SEGMENTS} segments spent`}
          >
            <span className="budget-spent" style={{ width: `${(segmentsSpent / TOTAL_SEGMENTS) * 100}%` }} />
          </div>
          <div className="budget-figures">
            <span>
              <strong className="mono">{segmentsSpent}</strong> spent
            </span>
            <span>
              <strong className="mono">{segmentsLeft}</strong> left ({formatSegments(segmentsLeft)})
            </span>
          </div>
        </div>
      </section>

      <section className="checker-panel" aria-labelledby="done-heading">
        <div className="panel-head">
          <h2 id="done-heading">What have you finished?</h2>
          <button type="button" className="linkish" onClick={reset}>
            Reset
          </button>
        </div>
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
                  checked={done.includes(quest.id)}
                  onChange={() => toggle(quest.id)}
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

      <section className="checker-results" aria-labelledby="results-heading">
        <h2 id="results-heading">What is still reachable</h2>
        <ul className="results">
          {results.map((result) => (
            <li key={result.ending.id} className="result" data-tone={STATUS_TONE[result.status]}>
              <div className="result-head">
                <h3>
                  <Link href={`/endings/${result.ending.slug}`}>{result.ending.title}</Link>
                </h3>
                <span className="badge" data-level={STATUS_TONE[result.status] === 'good' ? 'high' : STATUS_TONE[result.status] === 'warn' ? 'medium' : 'low'}>
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
                    : 'Needs no advance preparation — it is decided at the finale, so it stays open as long as you get there.'}
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
          ))}
        </ul>

        <div className="callout" data-tone="risk">
          <h3>Read these as a floor, not a verdict</h3>
          <p>
            Reliable per-quest segment costs are not published anywhere we trust, so the checker
            counts what it knows and tells you what it does not. The prerequisite and lock-out logic
            is sound; the arithmetic is only as good as the costs behind it.{' '}
            <Link href="/corrections">Send us real numbers</Link> and this gets sharper for everyone.
          </p>
        </div>
      </section>
    </div>
  )
}

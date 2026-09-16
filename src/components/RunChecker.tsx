'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useRun } from './RunProvider'
import { SpoilerSetting } from './Spoiler'
import { useUi } from './UiStrings'
import { fill } from '@/lib/copy'
import {
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

export function RunChecker({
  quests,
  endings,
  /*
    The one sentence on this page that is an editorial position rather than a
    result: a total built on costs nobody published is a floor. It is editable
    per wiki - see `runCheckerFloorNote` in `src/fields/gameCopy.ts` - and it
    falls back to the wording that shipped, because a blank must never leave
    the numbers above it standing unqualified.
  */
  floorNote,
}: {
  quests: QuestNode[]
  endings: EndingNode[]
  floorNote?: string
}) {
  const ui = useUi()
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
        <h2 id="where-heading">{ui.t('run.where-heading')}</h2>
        <p className="note">{ui.t('run.where-note')}</p>

        <div className="field-row">
          <div className="field">
            <label htmlFor="run-day">{ui.t('run.day-label')}</label>
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
            <label htmlFor="run-phase">{ui.t('run.phase-label')}</label>
            <select
              id="run-phase"
              value={run.phase}
              onChange={(event) => run.setClock({ phase: event.target.value as Phase })}
            >
              <option value="day">{ui.label('phase', 'day')}</option>
              <option value="night">{ui.label('phase', 'night')}</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="run-into">{ui.t('run.into-label')}</label>
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
            aria-label={fill(ui.t('run.budget-aria'), {
              spent: run.segmentsSpent,
              total: TOTAL_SEGMENTS,
            })}
          >
            <span className="budget-spent" style={{ width: `${spentPct}%` }} />
          </div>
          <div className="budget-figures">
            <span>
              <strong className="mono">{run.segmentsSpent}</strong> {ui.t('run.spent')}
            </span>
            <span>
              <strong className="mono">{run.segmentsLeft}</strong> {ui.t('run.left')} (
              {formatSegments(run.segmentsLeft)})
            </span>
          </div>
        </div>

        <SpoilerSetting />
      </section>

      <section className="checker-panel" aria-labelledby="done-heading">
        <div className="panel-head">
          <h2 id="done-heading">{ui.t('run.done-heading')}</h2>
          <button type="button" className="linkish" onClick={run.reset}>
            {ui.t('run.reset')}
          </button>
        </div>
        <p className="note">{ui.t('run.done-note')}</p>
        <div className="field">
          <label htmlFor="quest-filter">{ui.t('run.filter-label')}</label>
          <input
            id="quest-filter"
            type="search"
            placeholder={ui.t('run.filter-placeholder')}
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
                    {ui.label('quest-phase', quest.phase)}
                    {quest.costKnown
                      ? ` · ${fill(ui.t('run.segments'), { count: quest.timeMax })}`
                      : ` · ${ui.t('run.cost-unconfirmed')}`}
                  </span>
                </span>
              </label>
            </li>
          ))}
          {visibleQuests.length === 0 ? (
            <li className="note">{ui.t('run.no-quest-match')}</li>
          ) : null}
        </ul>
      </section>

      <section className="checker-results" aria-labelledby="next-heading">
        <h2 id="next-heading">{ui.t('run.next-heading')}</h2>
        {availableNow.length > 0 ? (
          <>
            <p className="note">
              {fill(ui.t('run.next-note'), { phase: ui.label('phase-lower', run.phase) })}
            </p>
            <ul className="next-up">
              {availableNow.map((quest) => (
                <li key={quest.id}>
                  <Link href={`/quests/${quest.slug}`}>{quest.title}</Link>
                  <span className="sub">
                    {quest.phase === 'either'
                      ? ui.t('run.either-phase')
                      : ui.label('quest-phase', quest.phase)}
                    {quest.costKnown
                      ? ` · ${fill(ui.t('run.segments'), { count: quest.timeMax })}`
                      : ''}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="note">
            {fill(ui.t('run.next-empty'), {
              phase: ui.label('phase-lower', run.phase === 'night' ? 'day' : 'night'),
            })}
          </p>
        )}
      </section>

      <section className="checker-results" aria-labelledby="results-heading">
        <h2 id="results-heading">{ui.t('run.results-heading')}</h2>
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
                    {ui.label('ending-status', result.status)}
                  </span>
                </div>

                {result.status === 'locked-out' ? (
                  <p className="result-detail">
                    {fill(ui.t('run.locked-out-detail'), {
                      quests: result.blockedBy.map((quest) => quest.title).join(', '),
                    })}
                  </p>
                ) : result.chainLength === 0 ? (
                  <p className="result-detail">
                    {result.ending.isFailure
                      ? ui.t('run.failure-detail')
                      : ui.t('run.no-prep-detail')}
                  </p>
                ) : result.status === 'achieved' ? (
                  <p className="result-detail">{ui.t('run.achieved-detail')}</p>
                ) : (
                  <p className="result-detail">
                    {fill(
                      ui.t(
                        result.outstanding.length === 1
                          ? 'run.quests-left-one'
                          : 'run.quests-left-many',
                      ),
                      { count: result.outstanding.length },
                    )}
                    {result.unknownCostCount > 0
                      ? fill(
                          ui.t(
                            result.unknownCostCount === 1
                              ? 'run.unconfirmed-one'
                              : 'run.unconfirmed-many',
                          ),
                          { count: result.unknownCostCount },
                        )
                      : fill(ui.t('run.cost-of-yours'), {
                          cost: result.maxCost,
                          left: result.segmentsLeft,
                        })}
                    .
                  </p>
                )}

                {result.outstanding.length > 0 ? (
                  <details>
                    <summary>{ui.t('run.whats-left')}</summary>
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
          <h2>{floorNote?.trim() || ui.t('run.floor-title')}</h2>
          <p>
            {ui.t('run.floor-body')}{' '}
            <Link href="/corrections">{ui.t('run.floor-link')}</Link> {ui.t('run.floor-tail')}
          </p>
        </div>
      </section>
    </div>
  )
}

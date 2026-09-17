'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { useRun } from './RunProvider'
import { Icon } from './Icon'
import { useUi } from './UiStrings'
import { fill } from '@/lib/copy'
import { indexQuests, type QuestNode } from '@/lib/reachability'
import { chainPlan } from '@/lib/unlock'
import { formatSegments } from '@/lib/segments'

/**
 * "How do I unlock this?", answered against the run you are actually on.
 *
 * The whole chain in the order it has to be done, ticked off as you go, with
 * what to do next, what the rest costs, and whether something you have already
 * finished has closed the route. All of it read off `prereqs` and `excludes`,
 * so it is as sourced as the rest of the site and it cannot drift — change the
 * graph in the admin and every unlock path on the site changes with it.
 */
export function UnlockPath({
  roots,
  quests,
  questId,
  clock = false,
  heading,
  emptyNote,
}: {
  /** Where to start walking: one quest, or an ending's whole questline. */
  roots: string[]
  quests: QuestNode[]
  /** Set when the page is about a quest, so it renders as the last step. */
  questId?: string
  /**
   * Whether this wiki's game has the segment clock.
   *
   * Off means the chain renders as an order and nothing else. Segments are
   * Dawnwalker's, and the cost half of this component asserts the mechanic
   * exists even when it only says the figure is missing: a Control Resonant
   * quest page printed "cost unpublished" against all nine of its steps and
   * "No source publishes a cost for any of them" underneath. That is the same
   * leak as the Segments column in the quests table and the Time cost row in
   * the fact panel, both already gated on this feature, one component further
   * down the page.
   */
  clock?: boolean
  /** Both fall back to the registry; a page passes one to say something else. */
  heading?: string
  emptyNote?: string
}) {
  const ui = useUi()
  const title = heading ?? ui.t('unlock.heading')
  const empty = emptyNote ?? ui.t('unlock.empty-note')
  const { completed, hydrated, isDone, toggleQuest, segmentsLeft } = useRun()

  const plan = useMemo(
    () => chainPlan(roots, indexQuests(quests), completed, questId),
    [roots, quests, completed, questId],
  )

  if (!plan) return null

  const { steps, lockedBy, achieved, next, doneCount, remainingMin, remainingMax, unknownCount } =
    plan
  const total = steps.length
  const soloQuest = total <= 1

  // Until the browser copy is read, showing progress would flash "0 done" at
  // somebody who has done plenty. Show the chain, hold the personal part.
  const personal = hydrated

  if (lockedBy) {
    return (
      <section className="section">
        <div className="section-head">
          <h2>{title}</h2>
        </div>
        <div className="callout" data-tone="risk">
          <h2>
            <Icon name="lock" size={14} /> {ui.t('unlock.closed-title')}
          </h2>
          <p>
            {ui.t('unlock.closed-before')}{' '}
            <Link href={`/quests/${lockedBy.slug}`}>{lockedBy.title}</Link>{' '}
            {ui.t('unlock.closed-after')}
          </p>
        </div>
      </section>
    )
  }

  const affordable =
    remainingMax > 0 && segmentsLeft > 0 ? remainingMax <= segmentsLeft : null

  const span =
    remainingMin === remainingMax
      ? formatSegments(remainingMin)
      : `${remainingMin}\u2013${formatSegments(remainingMax)}`

  /*
   * "At least 0 segments" is true and useless — it is what you get when the
   * whole remaining chain is unpublished, which on this data is most of it.
   * Say that there is no figure rather than dressing up a zero as one.
   */
  const costLine =
    unknownCount === 0
      ? remainingMin === 0
        ? ui.t('unlock.nothing-to-pay')
        : fill(ui.t('unlock.left'), { span })
      : remainingMin === 0
        ? fill(ui.t(unknownCount === 1 ? 'unlock.no-total-one' : 'unlock.no-total-many'), {
            count: unknownCount,
          })
        : fill(ui.t(unknownCount === 1 ? 'unlock.floor-one' : 'unlock.floor-many'), {
            span,
            count: unknownCount,
          })

  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}</h2>
        {personal && !soloQuest ? (
          <span className="eyebrow">
            {fill(ui.t('unlock.done-count'), { done: doneCount, total })}
          </span>
        ) : null}
      </div>

      {soloQuest ? (
        <p className="note">{empty}</p>
      ) : (
        <p className="note">
          {fill(
            ui.t(total - 1 === 1 ? 'unlock.stand-between-one' : 'unlock.stand-between-many'),
            { count: total - 1 },
          )}
        </p>
      )}

      {personal && achieved ? (
        <p className="unlockpath-state" data-tone="good">
          <Icon name="check" size={14} /> {ui.t('unlock.done-in-run')}
        </p>
      ) : personal && next ? (
        <p className="unlockpath-state">
          {ui.t('unlock.next')} <Link href={`/quests/${next.slug}`}>{next.title}</Link>
        </p>
      ) : null}

      <ol className="unlocksteps">
        {steps.map((step, index) => {
          const done = personal && step.done
          const isNext = personal && !achieved && next?.id === step.quest.id
          const isTarget = step.quest.id === questId
          return (
            <li key={step.quest.id} data-done={done || undefined} data-next={isNext || undefined}>
              <button
                type="button"
                className="unlockstep-tick"
                onClick={() => toggleQuest(step.quest.id)}
                aria-pressed={isDone(step.quest.id)}
                disabled={!hydrated}
                title={done ? ui.t('unlock.mark-not-done') : ui.t('unlock.mark-done')}
              >
                {done ? <Icon name="check" size={13} /> : <span>{index + 1}</span>}
              </button>
              <span className="unlockstep-body">
                {isTarget && questId ? (
                  <b>{step.quest.title}</b>
                ) : (
                  <Link href={`/quests/${step.quest.slug}`}>{step.quest.title}</Link>
                )}
                {clock ? (
                  <span className="unlockstep-cost">
                    {step.quest.costKnown
                      ? step.quest.timeMin === step.quest.timeMax
                        ? formatSegments(step.quest.timeMin)
                        : `${step.quest.timeMin}–${formatSegments(step.quest.timeMax)}`
                      : ui.t('unlock.cost-unpublished')}
                  </span>
                ) : null}
              </span>
            </li>
          )
        })}
      </ol>

      {clock && personal && !achieved ? (
        <p className="note unlockpath-cost">
          {costLine}
          {affordable === false ? ui.t('unlock.unaffordable') : null}
        </p>
      ) : null}
    </section>
  )
}

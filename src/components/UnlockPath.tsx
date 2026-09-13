'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { useRun } from './RunProvider'
import { Icon } from './Icon'
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
  heading = 'How to unlock this',
  emptyNote = 'Nothing has to happen first — this is open from the start of the run.',
}: {
  /** Where to start walking: one quest, or an ending's whole questline. */
  roots: string[]
  quests: QuestNode[]
  /** Set when the page is about a quest, so it renders as the last step. */
  questId?: string
  heading?: string
  emptyNote?: string
}) {
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
          <h2>{heading}</h2>
        </div>
        <div className="callout" data-tone="risk">
          <h3>
            <Icon name="lock" size={14} /> Closed for this run
          </h3>
          <p>
            You marked <Link href={`/quests/${lockedBy.slug}`}>{lockedBy.title}</Link> as done, and
            it permanently locks this route out. No amount of time left changes that — it is a
            different playthrough, not a longer one.
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
  const plural = unknownCount === 1 ? '' : 's'

  /*
   * "At least 0 segments" is true and useless — it is what you get when the
   * whole remaining chain is unpublished, which on this data is most of it.
   * Say that there is no figure rather than dressing up a zero as one.
   */
  const costLine =
    unknownCount === 0
      ? remainingMin === 0
        ? 'Nothing left to pay for.'
        : `${span} left.`
      : remainingMin === 0
        ? `No source publishes a cost for any of the ${unknownCount} remaining step${plural}, so there is no total to give — only that there are ${unknownCount} of them.`
        : `At least ${span}, plus ${unknownCount} step${plural} nobody has published a cost for. Treat it as a floor, not a total.`

  return (
    <section className="section">
      <div className="section-head">
        <h2>{heading}</h2>
        {personal && !soloQuest ? (
          <span className="eyebrow">
            {doneCount} of {total} done
          </span>
        ) : null}
      </div>

      {soloQuest ? (
        <p className="note">{emptyNote}</p>
      ) : (
        <p className="note">
          {total - 1} quest{total - 1 === 1 ? '' : 's'} stand between the start of a run and this
          one. They have to happen in this order.
        </p>
      )}

      {personal && achieved ? (
        <p className="unlockpath-state" data-tone="good">
          <Icon name="check" size={14} /> Done in your run.
        </p>
      ) : personal && next ? (
        <p className="unlockpath-state">
          Next: <Link href={`/quests/${next.slug}`}>{next.title}</Link>
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
                title={done ? 'Mark as not done' : 'Mark as done'}
              >
                {done ? <Icon name="check" size={13} /> : <span>{index + 1}</span>}
              </button>
              <span className="unlockstep-body">
                {isTarget && questId ? (
                  <b>{step.quest.title}</b>
                ) : (
                  <Link href={`/quests/${step.quest.slug}`}>{step.quest.title}</Link>
                )}
                <span className="unlockstep-cost">
                  {step.quest.costKnown
                    ? step.quest.timeMin === step.quest.timeMax
                      ? formatSegments(step.quest.timeMin)
                      : `${step.quest.timeMin}–${formatSegments(step.quest.timeMax)}`
                    : 'cost unpublished'}
                </span>
              </span>
            </li>
          )
        })}
      </ol>

      {personal && !achieved ? (
        <p className="note unlockpath-cost">
          {costLine}
          {affordable === false ? ' That is more than you have left in this run.' : null}
        </p>
      ) : null}
    </section>
  )
}

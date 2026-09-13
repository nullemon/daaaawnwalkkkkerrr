import { expandRequirements, type QuestIndex, type QuestNode } from './reachability'

/**
 * What it actually takes to unlock one quest, given the run you are on.
 *
 * A quest page used to list only its direct prerequisite, so "how do I get
 * this?" meant clicking backwards through the graph one link at a time. This
 * walks it to the roots and answers the question in one panel: the whole chain
 * in the order you have to do it, what you have already ticked off, what is
 * next, what the rest costs, and whether something you have already done has
 * closed the route for good.
 *
 * Every line of this is computed from `prereqs` and `excludes`, which are real
 * data with sources. Nothing here is a written walkthrough, because nobody has
 * published one — and a guessed one would be worth less than none.
 */

export interface UnlockStep {
  quest: QuestNode
  done: boolean
}

export interface UnlockPlan {
  /** The chain in dependency order, the target itself last. */
  steps: UnlockStep[]
  target: QuestNode
  doneCount: number
  /** The first step not yet ticked — what to go and do now. */
  next: QuestNode | null
  /** Segment cost of what is left. A floor: steps with no published cost add nothing. */
  remainingMin: number
  remainingMax: number
  /** How many outstanding steps nobody has published a cost for. */
  unknownCount: number
  /** A quest you have completed that permanently closed this route, if any. */
  lockedBy: QuestNode | null
  /** True when the target itself is already ticked. */
  achieved: boolean
}

export function unlockPlan(
  targetId: string,
  index: QuestIndex,
  completedIds: string[],
): UnlockPlan | null {
  const target = index.get(targetId)
  if (!target) return null

  const completed = new Set(completedIds)
  const chain = expandRequirements([targetId], index)
  const steps: UnlockStep[] = chain.map((quest) => ({ quest, done: completed.has(quest.id) }))

  // An exclusion is permanent, so a single completed quest that locks out any
  // link in the chain ends the question — no amount of time left helps.
  let lockedBy: QuestNode | null = null
  const chainIds = new Set(chain.map((quest) => quest.id))
  for (const doneId of completedIds) {
    const doneQuest = index.get(doneId)
    if (!doneQuest) continue
    if (doneQuest.excludes.some((excludedId: string) => chainIds.has(excludedId))) {
      lockedBy = doneQuest
      break
    }
  }

  const outstanding = steps.filter((step) => !step.done)
  let remainingMin = 0
  let remainingMax = 0
  let unknownCount = 0
  for (const step of outstanding) {
    if (step.quest.costKnown) {
      remainingMin += step.quest.timeMin
      remainingMax += step.quest.timeMax
    } else {
      unknownCount += 1
    }
  }

  return {
    steps,
    target,
    doneCount: steps.length - outstanding.length,
    next: outstanding[0]?.quest ?? null,
    remainingMin,
    remainingMax,
    unknownCount,
    lockedBy,
    achieved: completed.has(targetId),
  }
}

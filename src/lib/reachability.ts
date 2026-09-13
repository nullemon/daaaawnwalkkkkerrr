import {
  TOTAL_SEGMENTS,
  clockAt,
  segmentsRemaining,
  type PhaseRequirement,
} from './segments'

/**
 * The run checker.
 *
 * Every other Dawnwalker planner online builds a route from day zero. This
 * answers the question a player actually has mid-run: given where I am and
 * what I have already done, which endings can I still reach, and when does
 * each one stop being possible?
 */

export interface QuestNode {
  id: string
  slug: string
  title: string
  /** Segment cost, best case. */
  timeMin: number
  /** Segment cost, worst case. Equal to timeMin when the cost is fixed. */
  timeMax: number
  phase: PhaseRequirement
  /**
   * False when no source gives this quest a confirmed segment cost. Such a
   * quest still counts as work to do, but contributes nothing to the totals,
   * so any estimate containing one is a floor rather than a figure.
   */
  costKnown: boolean
  /** Quest ids that must be done first. */
  prereqs: string[]
  /** Quest ids this one permanently locks out. */
  excludes: string[]
}

export interface EndingNode {
  id: string
  slug: string
  title: string
  gate: 'ally' | 'choice' | 'clock'
  /** The chain. Prereqs are walked from here, so the questline alone is enough. */
  requiredQuests: string[]
  /** True for "Time Runs Out", which is reached by failing rather than choosing. */
  isFailure: boolean
}

export interface RunState {
  segmentsSpent: number
  completedQuestIds: string[]
}

export type ReachabilityStatus =
  /** Every required quest is already done. */
  | 'achieved'
  /** Comfortably affordable even at worst-case costs. */
  | 'reachable'
  /** Affordable at best-case costs but not at worst-case. No room for detours. */
  | 'tight'
  /** Cannot be afforded in the segments left. */
  | 'out-of-time'
  /** A completed quest permanently closed this route. No amount of time helps. */
  | 'locked-out'

export interface EndingReachability {
  ending: EndingNode
  status: ReachabilityStatus
  /** Required quests not yet done, in dependency order. */
  outstanding: QuestNode[]
  /** Total quests in the chain, done or not. Zero means nothing to prepare. */
  chainLength: number
  minCost: number
  maxCost: number
  segmentsLeft: number
  /**
   * Latest point at which this ending is still affordable at worst-case cost,
   * as absolute segments spent. Null when it is already unreachable.
   */
  latestStartSegment: number | null
  latestStartDay: number | null
  /** Quests that closed this route, when status is 'locked-out'. */
  blockedBy: QuestNode[]
  /**
   * How many outstanding quests have no confirmed time cost. Above zero, the
   * costs below are a floor and the UI must say so.
   */
  unknownCostCount: number
}

export type QuestIndex = Map<string, QuestNode>

export function indexQuests(quests: QuestNode[]): QuestIndex {
  return new Map(quests.map((quest) => [quest.id, quest]))
}

/**
 * Walk prereqs to their roots. Depth-first with a visiting set, so a cycle in
 * the data — which is a mistake, but will happen — degrades to ignoring the
 * back edge rather than hanging the page.
 */
export function expandRequirements(rootIds: string[], index: QuestIndex): QuestNode[] {
  const resolved: QuestNode[] = []
  const done = new Set<string>()
  const visiting = new Set<string>()

  const visit = (id: string): void => {
    if (done.has(id) || visiting.has(id)) return
    const quest = index.get(id)
    if (!quest) return
    visiting.add(id)
    for (const prereqId of quest.prereqs) visit(prereqId)
    visiting.delete(id)
    done.add(id)
    resolved.push(quest)
  }

  for (const id of rootIds) visit(id)
  return resolved
}

export function checkEnding(
  ending: EndingNode,
  state: RunState,
  index: QuestIndex,
): EndingReachability {
  const segmentsLeft = segmentsRemaining(state.segmentsSpent)
  const completed = new Set(state.completedQuestIds)
  const required = expandRequirements(ending.requiredQuests, index)
  const requiredIds = new Set(required.map((quest) => quest.id))

  // A quest already done that permanently closes something still required
  // makes this route impossible regardless of the clock.
  const blockedBy = state.completedQuestIds
    .map((id) => index.get(id))
    .filter((quest): quest is QuestNode => Boolean(quest))
    .filter((quest) => quest.excludes.some((excludedId) => requiredIds.has(excludedId)))

  const outstanding = required.filter((quest) => !completed.has(quest.id))
  const minCost = outstanding.reduce((total, quest) => total + quest.timeMin, 0)
  const maxCost = outstanding.reduce((total, quest) => total + quest.timeMax, 0)
  const unknownCostCount = outstanding.filter((quest) => !quest.costKnown).length

  // "Time Runs Out" is what happens when you overrun, so it is never barred.
  if (ending.isFailure) {
    return {
      ending,
      status: 'reachable',
      outstanding,
      chainLength: required.length,
      minCost,
      maxCost,
      segmentsLeft,
      latestStartSegment: TOTAL_SEGMENTS,
      latestStartDay: null,
      blockedBy: [],
      unknownCostCount,
    }
  }

  const latestStartSegment = maxCost <= TOTAL_SEGMENTS ? TOTAL_SEGMENTS - maxCost : null
  const latestStartDay =
    latestStartSegment === null ? null : clockAt(latestStartSegment).day

  let status: ReachabilityStatus
  if (blockedBy.length > 0) status = 'locked-out'
  // An ending with no chain at all is decided at the finale — it was never
  // "achieved", there was simply nothing to do.
  else if (outstanding.length === 0) status = required.length > 0 ? 'achieved' : 'reachable'
  else if (maxCost <= segmentsLeft) status = 'reachable'
  else if (minCost <= segmentsLeft) status = 'tight'
  else status = 'out-of-time'

  return {
    ending,
    status,
    outstanding,
    chainLength: required.length,
    minCost,
    maxCost,
    segmentsLeft,
    latestStartSegment,
    latestStartDay,
    blockedBy,
    unknownCostCount,
  }
}

/** Order results so the player sees what is still on the table first. */
const STATUS_ORDER: Record<ReachabilityStatus, number> = {
  achieved: 0,
  reachable: 1,
  tight: 2,
  'out-of-time': 3,
  'locked-out': 4,
}

export function checkRun(
  endings: EndingNode[],
  quests: QuestNode[],
  state: RunState,
): EndingReachability[] {
  const index = indexQuests(quests)
  return endings
    .map((ending) => checkEnding(ending, state, index))
    .sort((a, b) => {
      const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
      if (byStatus !== 0) return byStatus
      return a.maxCost - b.maxCost
    })
}

export const STATUS_LABELS: Record<ReachabilityStatus, string> = {
  achieved: 'Already secured',
  reachable: 'Still reachable',
  tight: 'Tight — no room for detours',
  'out-of-time': 'Out of time',
  'locked-out': 'Locked out',
}

/** Statuses that still count as "on the table" when tallying a run. */
const OPEN: ReachabilityStatus[] = ['achieved', 'reachable', 'tight']

export interface RunOutlook {
  /** Endings still winnable, excluding the failure state. */
  openCount: number
  /** Endings that could ever be won, excluding the failure state. */
  totalCount: number
  /** Of the open ones, those with no slack left. */
  tightCount: number
  lostCount: number
  results: EndingReachability[]
}

/**
 * The headline a player actually wants: how many endings are still on the
 * table, out of how many.
 *
 * "Time Runs Out" is excluded from both sides of that count. It is reached by
 * failing rather than choosing, so including it would mean the tally never
 * drops below one and a doomed run would still read "you can reach 1 of 7".
 */
export function summariseRun(results: EndingReachability[]): RunOutlook {
  const winnable = results.filter((result) => !result.ending.isFailure)
  const open = winnable.filter((result) => OPEN.includes(result.status))
  return {
    openCount: open.length,
    totalCount: winnable.length,
    tightCount: open.filter((result) => result.status === 'tight').length,
    lostCount: winnable.length - open.length,
    results,
  }
}

/**
 * The ending whose deadline bites first — what a mid-run player should be
 * worrying about.
 *
 * Endings with nothing outstanding are never urgent, however little time is
 * left: several are decided at the finale and need no preparation, so "needs 0
 * more quests" would be advice about nothing. Tight beats merely reachable,
 * and the failure state is never a goal.
 */
export function mostUrgentEnding(results: EndingReachability[]): EndingReachability | null {
  const candidates = results.filter(
    (result) => !result.ending.isFailure && result.outstanding.length > 0,
  )
  return (
    candidates.find((result) => result.status === 'tight') ??
    candidates.find((result) => result.status === 'reachable') ??
    null
  )
}

/**
 * Of everything still outstanding, the quests that can be started *right now*
 * — prerequisites met, and playable in the phase the player is currently in.
 *
 * Chains that are already lost contribute nothing: sending someone to grind a
 * quest for an ending they can no longer reach is worse than saying nothing.
 * A quest wanted by more than one ending appears once.
 */
export function questsAvailableNow(
  results: EndingReachability[],
  completedQuestIds: string[],
  phase: 'day' | 'night',
): QuestNode[] {
  const done = new Set(completedQuestIds)
  const wanted = new Map<string, QuestNode>()
  for (const result of results) {
    if (!OPEN.includes(result.status) || result.ending.isFailure) continue
    for (const quest of result.outstanding) {
      if (!quest.prereqs.every((id) => done.has(id))) continue
      if (quest.phase !== 'either' && quest.phase !== phase) continue
      wanted.set(quest.id, quest)
    }
  }
  return [...wanted.values()]
}

import { describe, expect, it } from 'vitest'
import { checkRun, expandRequirements, indexQuests, type EndingNode, type QuestNode } from './reachability'
import { TOTAL_SEGMENTS, segmentsSpentAt } from './segments'

const quest = (id: string, over: Partial<QuestNode> = {}): QuestNode => ({
  id,
  slug: id,
  title: id,
  timeMin: 4,
  timeMax: 4,
  phase: 'either',
  costKnown: true,
  prereqs: [],
  excludes: [],
  ...over,
})

const ending = (id: string, over: Partial<EndingNode> = {}): EndingNode => ({
  id,
  slug: id,
  title: id,
  gate: 'ally',
  requiredQuests: [],
  isFailure: false,
  ...over,
})

describe('expandRequirements', () => {
  it('walks prereqs transitively and returns them before their dependants', () => {
    const quests = [
      quest('a'),
      quest('b', { prereqs: ['a'] }),
      quest('c', { prereqs: ['b'] }),
    ]
    const resolved = expandRequirements(['c'], indexQuests(quests))
    expect(resolved.map((q) => q.id)).toEqual(['a', 'b', 'c'])
  })

  it('does not hang on a cycle in the data', () => {
    const quests = [quest('a', { prereqs: ['b'] }), quest('b', { prereqs: ['a'] })]
    const resolved = expandRequirements(['a'], indexQuests(quests))
    expect(resolved.map((q) => q.id).sort()).toEqual(['a', 'b'])
  })

  it('ignores references to quests that do not exist', () => {
    const resolved = expandRequirements(['ghost'], indexQuests([quest('a')]))
    expect(resolved).toEqual([])
  })

  it('counts a shared prerequisite once', () => {
    const quests = [
      quest('root'),
      quest('x', { prereqs: ['root'] }),
      quest('y', { prereqs: ['root'] }),
    ]
    const resolved = expandRequirements(['x', 'y'], indexQuests(quests))
    expect(resolved.filter((q) => q.id === 'root')).toHaveLength(1)
  })
})

describe('checkRun', () => {
  const chain = [
    quest('q1', { timeMin: 10, timeMax: 20 }),
    quest('q2', { timeMin: 10, timeMax: 20, prereqs: ['q1'] }),
  ]
  const patricide = ending('patricide', { requiredQuests: ['q2'] })

  it('reports an ending as reachable when the worst case still fits', () => {
    const [result] = checkRun([patricide], chain, { segmentsSpent: 0, completedQuestIds: [] })
    expect(result.status).toBe('reachable')
    expect(result.minCost).toBe(20)
    expect(result.maxCost).toBe(40)
    expect(result.outstanding.map((q) => q.id)).toEqual(['q1', 'q2'])
  })

  it('flags tight when only the best case fits', () => {
    // 25 left: the 20-segment best case fits, the 40-segment worst case does not.
    const [result] = checkRun([patricide], chain, {
      segmentsSpent: TOTAL_SEGMENTS - 25,
      completedQuestIds: [],
    })
    expect(result.status).toBe('tight')
  })

  it('reports out of time when even the best case does not fit', () => {
    const [result] = checkRun([patricide], chain, {
      segmentsSpent: TOTAL_SEGMENTS - 5,
      completedQuestIds: [],
    })
    expect(result.status).toBe('out-of-time')
  })

  it('discounts work already done', () => {
    const [result] = checkRun([patricide], chain, { segmentsSpent: 20, completedQuestIds: ['q1'] })
    expect(result.outstanding.map((q) => q.id)).toEqual(['q2'])
    expect(result.maxCost).toBe(20)
  })

  it('reports achieved once the whole chain is complete', () => {
    const [result] = checkRun([patricide], chain, {
      segmentsSpent: 40,
      completedQuestIds: ['q1', 'q2'],
    })
    expect(result.status).toBe('achieved')
    expect(result.outstanding).toEqual([])
  })

  it('locks an ending out when a completed quest excluded part of its chain', () => {
    const quests = [...chain, quest('betrayal', { excludes: ['q2'] })]
    const [result] = checkRun([patricide], quests, {
      segmentsSpent: 10,
      completedQuestIds: ['betrayal'],
    })
    expect(result.status).toBe('locked-out')
    expect(result.blockedBy.map((q) => q.id)).toEqual(['betrayal'])
  })

  it('keeps an ending locked out no matter how much time is left', () => {
    const quests = [...chain, quest('betrayal', { excludes: ['q1'] })]
    const [result] = checkRun([patricide], quests, {
      segmentsSpent: 0,
      completedQuestIds: ['betrayal'],
    })
    expect(result.status).toBe('locked-out')
  })

  it('never bars the failure ending, since overrunning is how you get it', () => {
    const timeout = ending('time-runs-out', { gate: 'clock', isFailure: true, requiredQuests: [] })
    const [result] = checkRun([timeout], chain, {
      segmentsSpent: TOTAL_SEGMENTS,
      completedQuestIds: [],
    })
    expect(result.status).toBe('reachable')
  })

  it('gives the last day an ending can still be started', () => {
    // Worst case 40 segments, so it must begin by segment 440 — day 28.
    const [result] = checkRun([patricide], chain, { segmentsSpent: 0, completedQuestIds: [] })
    expect(result.latestStartSegment).toBe(TOTAL_SEGMENTS - 40)
    expect(result.latestStartDay).toBe(28)
  })

  it('sorts what is still possible above what is not', () => {
    const cheap = ending('cheap', { requiredQuests: ['q1'] })
    const results = checkRun([patricide, cheap], chain, {
      segmentsSpent: TOTAL_SEGMENTS - 25,
      completedQuestIds: [],
    })
    expect(results.map((r) => r.ending.id)).toEqual(['cheap', 'patricide'])
    expect(results[0].status).toBe('reachable')
  })

  it('counts outstanding quests whose cost nobody has confirmed', () => {
    const quests = [
      quest('known', { timeMin: 6, timeMax: 6 }),
      quest('guess', { timeMin: 0, timeMax: 0, costKnown: false, prereqs: ['known'] }),
    ]
    const target = ending('target', { requiredQuests: ['guess'] })
    const [result] = checkRun([target], quests, { segmentsSpent: 0, completedQuestIds: [] })
    expect(result.unknownCostCount).toBe(1)
    // The known cost still counts, so the total is a floor rather than zero.
    expect(result.maxCost).toBe(6)
  })

  it('stops counting an unknown cost once that quest is done', () => {
    const quests = [quest('guess', { timeMin: 0, timeMax: 0, costKnown: false })]
    const target = ending('target', { requiredQuests: ['guess'] })
    const [result] = checkRun([target], quests, { segmentsSpent: 0, completedQuestIds: ['guess'] })
    expect(result.unknownCostCount).toBe(0)
    expect(result.status).toBe('achieved')
  })

  it('treats a day-17 position as 256 segments spent', () => {
    const spent = segmentsSpentAt({ day: 17, phase: 'day' })
    expect(spent).toBe(256)
    const [result] = checkRun([patricide], chain, { segmentsSpent: spent, completedQuestIds: [] })
    expect(result.segmentsLeft).toBe(224)
    expect(result.status).toBe('reachable')
  })
})

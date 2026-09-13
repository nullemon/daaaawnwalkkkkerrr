import { describe, expect, it } from 'vitest'
import {
  checkRun,
  expandRequirements,
  indexQuests,
  mostUrgentEnding,
  questsAvailableNow,
  summariseRun,
  type EndingNode,
  type QuestNode,
} from './reachability'
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

  it('does not call an ending with no chain "achieved" — there was nothing to do', () => {
    const finaleChoice = ending('folk-hero', { gate: 'choice', requiredQuests: [] })
    const [result] = checkRun([finaleChoice], chain, { segmentsSpent: 0, completedQuestIds: [] })
    expect(result.chainLength).toBe(0)
    expect(result.status).toBe('reachable')
  })

  it('still reports achieved when a real chain has been finished', () => {
    const [result] = checkRun([patricide], chain, {
      segmentsSpent: 40,
      completedQuestIds: ['q1', 'q2'],
    })
    expect(result.chainLength).toBe(2)
    expect(result.status).toBe('achieved')
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

describe('summariseRun', () => {
  it('counts only endings that can be won, and excludes the failure state', () => {
    const quests = [quest('a'), quest('b')]
    const endings = [
      ending('reachable', { requiredQuests: ['a'] }),
      ending('lost', { requiredQuests: ['b'] }),
      ending('timeout', { isFailure: true, gate: 'clock' }),
    ]
    // Deep enough into the run that a 4-segment chain no longer fits.
    const results = checkRun(endings, quests, {
      segmentsSpent: TOTAL_SEGMENTS - 1,
      completedQuestIds: ['a'],
    })
    const outlook = summariseRun(results)

    expect(outlook.totalCount).toBe(2)
    expect(outlook.openCount).toBe(1)
    expect(outlook.lostCount).toBe(1)
  })

  it('never lets the failure state prop up the tally of a doomed run', () => {
    const quests = [quest('a')]
    const endings = [
      ending('lost', { requiredQuests: ['a'] }),
      ending('timeout', { isFailure: true, gate: 'clock' }),
    ]
    const outlook = summariseRun(
      checkRun(endings, quests, { segmentsSpent: TOTAL_SEGMENTS - 1, completedQuestIds: [] }),
    )
    expect(outlook.openCount).toBe(0)
  })
})

describe('questsAvailableNow', () => {
  const graph = () => {
    const quests = [
      quest('open'),
      quest('blocked', { prereqs: ['open'] }),
      quest('nightonly', { phase: 'night' }),
    ]
    const endings = [ending('e', { requiredQuests: ['blocked', 'nightonly'] })]
    return { quests, endings }
  }

  it('offers only quests whose prerequisites are met and whose phase matches', () => {
    const { quests, endings } = graph()
    const results = checkRun(endings, quests, { segmentsSpent: 0, completedQuestIds: [] })
    const ready = questsAvailableNow(results, [], 'day')
    expect(ready.map((q) => q.id)).toEqual(['open'])
  })

  it('offers the night quest once the clock is in that phase', () => {
    const { quests, endings } = graph()
    const results = checkRun(endings, quests, { segmentsSpent: 0, completedQuestIds: [] })
    const ready = questsAvailableNow(results, [], 'night')
    expect(ready.map((q) => q.id)).toContain('nightonly')
  })

  it('suggests nothing for a chain that can no longer be afforded', () => {
    const { quests, endings } = graph()
    const results = checkRun(endings, quests, {
      segmentsSpent: TOTAL_SEGMENTS - 1,
      completedQuestIds: [],
    })
    expect(questsAvailableNow(results, [], 'day')).toEqual([])
  })

  it('lists a quest once even when two endings both want it', () => {
    const quests = [quest('shared')]
    const endings = [
      ending('one', { requiredQuests: ['shared'] }),
      ending('two', { requiredQuests: ['shared'] }),
    ]
    const results = checkRun(endings, quests, { segmentsSpent: 0, completedQuestIds: [] })
    expect(questsAvailableNow(results, [], 'day')).toHaveLength(1)
  })
})

describe('mostUrgentEnding', () => {
  it('never nominates an ending that needs no preparation', () => {
    const quests = [quest('a')]
    const endings = [
      // Decided at the finale: reachable, but there is nothing to go and do.
      ending('finale', { gate: 'choice', requiredQuests: [] }),
      ending('chain', { requiredQuests: ['a'] }),
    ]
    const results = checkRun(endings, quests, { segmentsSpent: 0, completedQuestIds: [] })
    expect(mostUrgentEnding(results)?.ending.id).toBe('chain')
  })

  it('returns null when nothing outstanding remains', () => {
    const quests = [quest('a')]
    const endings = [ending('finale', { gate: 'choice', requiredQuests: [] })]
    const results = checkRun(endings, quests, { segmentsSpent: 0, completedQuestIds: [] })
    expect(mostUrgentEnding(results)).toBeNull()
  })

  it('never nominates the failure state', () => {
    const quests = [quest('a')]
    const endings = [ending('timeout', { isFailure: true, gate: 'clock', requiredQuests: ['a'] })]
    const results = checkRun(endings, quests, { segmentsSpent: 0, completedQuestIds: [] })
    expect(mostUrgentEnding(results)).toBeNull()
  })
})

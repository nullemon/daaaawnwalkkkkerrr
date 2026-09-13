import { describe, expect, it } from 'vitest'
import { indexQuests, type QuestNode } from './reachability'
import { unlockPlan } from './unlock'

const quest = (id: string, over: Partial<QuestNode> = {}): QuestNode => ({
  id,
  slug: id,
  title: id.toUpperCase(),
  timeMin: 2,
  timeMax: 2,
  phase: 'either',
  costKnown: true,
  prereqs: [],
  excludes: [],
  ...over,
})

// a → b → c, and d locks out b.
const GRAPH = indexQuests([
  quest('a'),
  quest('b', { prereqs: ['a'], timeMin: 3, timeMax: 5 }),
  quest('c', { prereqs: ['b'] }),
  quest('d', { excludes: ['b'] }),
  quest('e', { prereqs: ['a'], costKnown: false, timeMin: 0, timeMax: 0 }),
  quest('f', { prereqs: ['b', 'e'] }),
])

describe('the unlock path', () => {
  it('walks the chain to its root, in the order you have to do it', () => {
    const plan = unlockPlan('c', GRAPH, [])!
    expect(plan.steps.map((s) => s.quest.id)).toEqual(['a', 'b', 'c'])
  })

  it('puts the target last so the list reads as steps towards it', () => {
    expect(unlockPlan('f', GRAPH, [])!.steps.at(-1)!.quest.id).toBe('f')
  })

  it('says a quest with no prerequisites is a chain of one', () => {
    const plan = unlockPlan('a', GRAPH, [])!
    expect(plan.steps).toHaveLength(1)
    expect(plan.next?.id).toBe('a')
  })

  it('ticks off what the run has already done and names what is next', () => {
    const plan = unlockPlan('c', GRAPH, ['a'])!
    expect(plan.doneCount).toBe(1)
    expect(plan.steps.map((s) => s.done)).toEqual([true, false, false])
    expect(plan.next?.id).toBe('b')
  })

  it('knows when the target itself is finished', () => {
    const plan = unlockPlan('c', GRAPH, ['a', 'b', 'c'])!
    expect(plan.achieved).toBe(true)
    expect(plan.next).toBeNull()
    expect(plan.remainingMin).toBe(0)
  })

  it('totals only what is left, not what is already behind you', () => {
    const plan = unlockPlan('c', GRAPH, ['a'])!
    expect(plan.remainingMin).toBe(3 + 2)
    expect(plan.remainingMax).toBe(5 + 2)
  })

  it('counts unknown costs instead of treating them as free', () => {
    const plan = unlockPlan('f', GRAPH, [])!
    // a(2) + b(3..5) + f(2) are known; e is not and must not add zero silently.
    expect(plan.remainingMin).toBe(2 + 3 + 2)
    expect(plan.unknownCount).toBe(1)
  })

  it('reports a completed quest that has permanently closed the route', () => {
    const plan = unlockPlan('c', GRAPH, ['d'])!
    expect(plan.lockedBy?.id).toBe('d')
  })

  it('does not cry lock-out over an exclusion that misses the chain', () => {
    expect(unlockPlan('a', GRAPH, ['d'])!.lockedBy).toBeNull()
  })

  it('returns nothing for a quest that is not in the graph', () => {
    expect(unlockPlan('nope', GRAPH, [])).toBeNull()
  })
})

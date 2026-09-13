import { getAll } from './payload'
import type { EndingNode, QuestNode } from './reachability'
import type { Ending, Quest } from '@/payload-types'

/**
 * Adapts stored records into the plain shapes the solver works on. Keeping the
 * solver free of Payload types is what lets it be unit-tested without a
 * database, and what lets the run checker ship the same logic to the browser.
 */

const idOf = (value: unknown): string =>
  value && typeof value === 'object' && 'id' in value
    ? String((value as { id: string | number }).id)
    : String(value)

export const toQuestNode = (quest: Quest): QuestNode => ({
  id: String(quest.id),
  slug: quest.slug,
  title: quest.title,
  timeMin: quest.time?.known ? (quest.time?.min ?? 0) : 0,
  timeMax: quest.time?.known ? (quest.time?.max ?? 0) : 0,
  phase: (quest.phase ?? 'either') as QuestNode['phase'],
  costKnown: Boolean(quest.time?.known),
  prereqs: (quest.prereqs ?? []).map(idOf),
  excludes: (quest.excludes ?? []).map(idOf),
})

export const toEndingNode = (ending: Ending): EndingNode => ({
  id: String(ending.id),
  slug: ending.slug,
  title: ending.title,
  gate: (ending.gate ?? 'choice') as EndingNode['gate'],
  requiredQuests: (ending.requiredQuests ?? []).map(idOf),
  isFailure: Boolean(ending.isFailure),
})

/** Everything the run checker needs, in one build-time read. */
export async function getRunGraph(): Promise<{ quests: QuestNode[]; endings: EndingNode[] }> {
  const [quests, endings] = await Promise.all([
    getAll<Quest>('quests', { depth: 1, sort: 'title' }),
    getAll<Ending>('endings', { depth: 1, sort: 'title' }),
  ])
  return {
    quests: quests.map(toQuestNode),
    endings: endings.map(toEndingNode),
  }
}

import type { Item } from '@/payload-types'

/**
 * How an item is obtained, in words.
 *
 * Shared by the index and the item page so the two can never describe the same
 * item differently — the index says "Quest reward" in its Where column and the
 * page has to agree.
 *
 * The field exists because most items have no single region and never will: a
 * herb that grows across the map is not missing a location, and a reward handed
 * over at the end of a questline never had one. See docs/ASSETS.md's sibling
 * rule in docs/DATA.md — an empty field must mean "nobody published this", so
 * anything that has a real answer needs somewhere to put it.
 */
export const ACQUISITION_LABEL: Record<string, string> = {
  world: 'Fixed location',
  'quest-reward': 'Quest reward',
  merchant: 'Merchant',
  drop: 'Enemy drop',
  gathered: 'Across the map',
  crafted: 'Crafted',
}

/** A fuller phrasing for the item's own page, where there is room for one. */
export const ACQUISITION_SENTENCE: Record<string, string> = {
  world: 'Found at a fixed spot in the world.',
  'quest-reward': 'Handed over for finishing a quest, so it has no world location.',
  merchant: 'Bought from a merchant rather than found.',
  drop: 'Taken from something you kill.',
  gathered: 'Gathered across the map rather than in one place.',
  crafted: 'Made rather than found.',
}

export const acquisitionLabel = (item: Pick<Item, 'acquisition'>): string | undefined =>
  item.acquisition ? ACQUISITION_LABEL[item.acquisition] : undefined

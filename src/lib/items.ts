import type { Item } from '@/payload-types'
import { labelGroup, type Ui } from './ui-registry'

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
 *
 * The wording lives in the interface-text registry as `acquisition.*` (the
 * column) and `acquisition-why.*` (the fuller sentence on the item's own
 * page), so it is editable in the admin and declared once.
 *
 * `ui` is optional and every page passes it. It stays optional because
 * resolving an override is async and this is called from places that are not —
 * without it the caller gets the registry default, which is the wording that
 * shipped, rather than nothing.
 */
export const acquisitionLabel = (
  item: Pick<Item, 'acquisition'>,
  ui?: Ui,
): string | undefined => {
  if (!item.acquisition) return undefined
  return ui ? ui.label('acquisition', item.acquisition) : labelGroup('acquisition')[item.acquisition]
}

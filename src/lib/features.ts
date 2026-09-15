import { notFound } from 'next/navigation'
import { getGame } from './payload'
import type { Game } from '@/payload-types'

export type Feature = NonNullable<Game['features']>[number]

/**
 * A bespoke tool belongs to the game that has it switched on.
 *
 * Without this a tool page prerenders for every wiki, because the route lives
 * under `[game]` and nothing said otherwise. Nothing links to those copies and
 * they are in no sitemap, so they are not an SEO problem — they are a
 * correctness one. A reader who guesses the URL on a wiki with no run planner
 * gets an empty tool that looks broken, where a 404 would have told them the
 * truth.
 *
 * The feature name is typed against the options Payload generates for the
 * field, so a tool gated on a feature that does not exist will not compile.
 */
export const requireFeature = async (slug: string, feature: Feature): Promise<Game> => {
  const game = await getGame(slug)
  if (!game || !(game.features ?? []).includes(feature)) notFound()
  return game
}

import { getAll, getPublishedGames } from './payload'
import type { GameScopedCollection } from './tenancy'

/**
 * Every (game, slug) pair for a collection — the static params for a detail
 * page under `[game]/<section>/[slug]`.
 *
 * ## Why this generates both segments
 *
 * Next.js documents two ways to fill a route with more than one dynamic
 * segment: bottom up, where the deepest page returns the whole set, and top
 * down, where a parent generates its segment and the child is then called once
 * per parent value with those params passed in.
 *
 * Top down is the tidier of the two and it is what this started as. It does
 * not work. The child *is* called, once per game, with the right game in
 * `params`, and it returns the right slugs — and Next then prerenders none of
 * them. No error, no warning: the build succeeds and every one of the four
 * hundred record pages is simply absent, which showed up only as a page count
 * that had dropped from roughly four hundred to a hundred and eighty-five.
 *
 * So: bottom up. The parent layout keeps its own `generateStaticParams`, which
 * is what fills `[game]` for the index pages that have no deeper segment, and
 * every detail page calls this instead of trusting the composition.
 *
 * ## Cost
 *
 * One extra query per game per collection at build time. Nothing at runtime —
 * these pages are static.
 */
export const gameSlugParams = async (
  collection: GameScopedCollection,
): Promise<{ game: string; slug: string }[]> => {
  const games = await getPublishedGames()
  const params: { game: string; slug: string }[] = []

  for (const game of games) {
    const docs = await getAll(collection, { game: game.slug, depth: 0 })
    params.push(...docs.map((doc) => ({ game: game.slug, slug: doc.slug })))
  }

  return params
}

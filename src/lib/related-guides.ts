import { gameWords, overlap, terms } from './terms'

/**
 * What goes in the "More guides" rail beside an article.
 *
 * ## What it used to be
 *
 * `getAll('guides', { sort: '-published', limit: 7 })`, minus this one. Every
 * article on a wiki therefore showed the same six, and the guide-dates work
 * sharpened it rather than fixing it: `published` is an editor's field now, so
 * the sixty-one guides that carry one sort to the front and the other three
 * hundred and fifty follow in database order. Six links that are identical on
 * four hundred pages are not navigation — they are the same advert, and the
 * one place a reader looks for "what else is there about this".
 *
 * ## What decides it now
 *
 * The words the two titles share, once the game's own name is discounted —
 * `lib/terms.ts`, the same rule and the same code as the hub's query matcher
 * and the topic generator, for the reason recorded there. A guide about Anca
 * pulls the romance and companion guides; the achievements guide pulls the
 * rarity and completion ones.
 *
 * `targetQuery` counts as well as the title, because it is the question the
 * guide was written to answer and two guides answering neighbouring questions
 * are related even when their headlines share no vocabulary.
 *
 * ## The rules that keep it honest
 *
 * **A zero score is no relation, not a weak one.** Nothing with no shared word
 * is ever presented as related. When that leaves fewer than the rail wants,
 * the remainder is filled from the newest guides by their own date and the two
 * groups keep their order — related first. A rail of four related links is
 * better than six where two are there to make up the number, but a rail that
 * empties out on a wiki whose titles happen not to overlap is worse than
 * either, and the newest guides are at least an honest offer.
 *
 * **Deterministic.** Every page here is prerendered, so anything that depends
 * on wall-clock order or on the database's own row order produces a different
 * rail on each build with nothing to explain it. Ties break on score, then
 * date, then title — total, and reproducible from the data alone.
 */

export type GuideLike = {
  id: number | string
  title: string
  slug: string
  targetQuery?: string | null
  /** The guide's own date, from `guideLastModified`. Absent is normal. */
  date?: string | null
}

/** The current guide never appears in its own rail, whatever it scores. */
const withoutSelf = <T extends GuideLike>(all: readonly T[], current: GuideLike): T[] =>
  all.filter((guide) => guide.slug !== current.slug)

/**
 * Newest first, then alphabetical, then by slug.
 *
 * The slug is the one that looks redundant and is not: two guides can share a
 * date and a title — the same page written for two wikis, or two generated
 * ones that collide — and a comparator returning 0 leaves a stable sort
 * holding whatever order the database handed over. Every page here is
 * prerendered, so that is a rail that changes between builds with nothing to
 * explain it. A slug is unique per wiki, so this is a total order.
 */
const byDateThenTitle = (left: GuideLike, right: GuideLike): number => {
  const a = left.date ?? ''
  const b = right.date ?? ''
  if (a !== b) return b.localeCompare(a)
  return left.title.localeCompare(right.title) || left.slug.localeCompare(right.slug)
}

/**
 * The guides most worth offering beside this one.
 *
 * `names` is every spelling of the game's own name to discount — the store
 * title and the short title at least. Passing none is allowed and is simply a
 * worse rail, not an error.
 */
export const relatedGuides = <T extends GuideLike>(
  current: GuideLike,
  all: readonly T[],
  names: readonly string[] = [],
  limit = 6,
): T[] => {
  const discount = gameWords(names)
  const mine = [...terms(current.title), ...terms(current.targetQuery ?? '')]

  const candidates = withoutSelf(all, current)

  const scored = candidates
    .map((guide) => ({
      guide,
      score: overlap(mine, [...terms(guide.title), ...terms(guide.targetQuery ?? '')], discount),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) =>
      right.score - left.score || byDateThenTitle(left.guide, right.guide),
    )
    .map((entry) => entry.guide)

  if (scored.length >= limit) return scored.slice(0, limit)

  const taken = new Set(scored.map((guide) => guide.slug))
  const newest = candidates.filter((guide) => !taken.has(guide.slug)).sort(byDateThenTitle)

  return [...scored, ...newest].slice(0, limit)
}

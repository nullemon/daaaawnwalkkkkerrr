import type { Game } from '@/payload-types'

/**
 * Reading a wiki's own editable copy off its Game record.
 *
 * Thin on purpose: every accessor here returns the stored row or `undefined`,
 * and the *decision* about what to show when it is `undefined` belongs at the
 * call site, next to the sentence being replaced. Putting the fallbacks here
 * would mean one file holding every default sentence on the network again —
 * which is the thing being fixed.
 *
 * See `src/fields/gameCopy.ts` for the fields themselves and `src/lib/copy.ts`
 * for `copy()`, which is how these are almost always consumed:
 *
 *     const row = sectionRow(game, 'quests')
 *     const heading = copy(row?.heading, 'Quests', { game: name, count })
 */

type GameLike = Partial<Game> | null | undefined

export type SectionRow = NonNullable<Game['sectionCopy']>[number]
export type CalloutRow = NonNullable<Game['callouts']>[number]
export type GuideGroupRow = NonNullable<Game['guideGroups']>[number]

/** The copy row for one section index, if an editor has written one. */
export const sectionRow = (game: GameLike, section: string): SectionRow | undefined =>
  (game?.sectionCopy ?? []).find((row) => row.section === section)

/**
 * The callout for one place, if an editor has written one.
 *
 * Note the three-way result, which the two-way `pick` cannot express: no row
 * means "show the built-in note", a row with `hide` ticked means "show
 * nothing", and a row with text means "show this". The middle case is the one
 * that matters — most of these callouts state a Dawnwalker mechanic, and the
 * right thing for a wiki whose game has no such mechanic is an empty space,
 * not a rewrite.
 */
export const calloutFor = (game: GameLike, where: string): CalloutRow | undefined =>
  (game?.callouts ?? []).find((row) => row.where === where)

export const guideGroups = (game: GameLike): GuideGroupRow[] => game?.guideGroups ?? []

export const homeCopy = (game: GameLike): NonNullable<Game['homeCopy']> => game?.homeCopy ?? {}
export const aboutCopy = (game: GameLike): NonNullable<Game['aboutPage']> => game?.aboutPage ?? {}
export const toolCopy = (game: GameLike): NonNullable<Game['toolCopy']> => game?.toolCopy ?? {}
export const briefingCopy = (game: GameLike): NonNullable<Game['briefing']> => game?.briefing ?? {}

/**
 * Whether a guide belongs in a group.
 *
 * The built-in grouping matched on hardcoded slug lists, one of which was ten
 * Dawnwalker region slugs applied to every wiki in the network. `matchRegions`
 * replaces that list with a question the records can answer — is this
 * `<something>-guide` where `<something>` is one of *this* wiki's regions —
 * so a new region files its guide without anybody editing anything.
 */
export const guideMatches = (
  group: GuideGroupRow,
  slug: string,
  regionSlugs: ReadonlySet<string>,
): boolean => {
  const listed = (group.slugs ?? '')
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean)
  if (listed.includes(slug)) return true
  if (group.endsWith && slug.endsWith(group.endsWith)) return true
  if (group.contains && slug.includes(group.contains)) return true
  if (group.matchRegions && slug.endsWith('-guide') && regionSlugs.has(slug.replace(/-guide$/, ''))) {
    return true
  }
  return false
}

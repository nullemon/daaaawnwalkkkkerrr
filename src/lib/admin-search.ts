/**
 * What the admin's search box looks in, and what it calls each thing.
 *
 * ## Why a search view exists at all
 *
 * Payload gives every collection a list view with its own search box, which is
 * the right tool when you already know the answer is a quest. It is the wrong
 * one for the question an owner actually arrives with — *"where is the Anca
 * page"* — because answering it means picking the collection first, and on a
 * network of 2,000 records across sixteen collections plus 918 company and
 * person profiles, picking the collection first is the hard half.
 *
 * So: one box, every collection, grouped results.
 *
 * ## The list is explicit, and that is the point
 *
 * Not derived from the Payload config. Three of the collections here are not
 * game-scoped and two of them are not content at all, and a derived list would
 * quietly start searching `analytics-events` (one row per page view, no title)
 * or `remote-log` the day one of those is added. Searching everything is how a
 * search box becomes useless rather than how it becomes thorough.
 *
 * Each entry says which field holds the human name, because `authors`,
 * `companies` and `people` call it `name` and the sixteen game-scoped
 * collections call it `title` — the same split `getNames` already handles, and
 * the same one that made three contributor lists come back in insertion order
 * when a sort was applied to a column that did not exist.
 *
 * No I/O and no Payload types, so the shape is unit-testable and this module
 * can be read by the nav link as well as the view.
 */

export type SearchTarget = {
  /** The collection slug, which is also its segment in an admin URL. */
  slug: string
  /** What an editor calls it, singular and plural. */
  label: string
  /**
   * The field holding the human-readable name — each collection's own
   * `useAsTitle`, because that is already the answer to "what does an editor
   * call this row" and a second opinion would drift from it.
   *
   * `title` on the sixteen game-scoped ones, `name` on the three directories,
   * `alt` on media, `excerpt` on comments, `summary` on corrections. The split
   * is the same one that made three contributor lists come back in insertion
   * order when a sort was applied to a column that did not exist.
   */
  field: string
  /**
   * Whether a result should say which wiki it belongs to.
   *
   * True for the thirteen game-scoped collections, where "Kyoto" is ambiguous
   * across eight wikis and the answer is useless without the wiki's name.
   * False for the three that are network-wide, where naming a game would be a
   * claim that a company or a person belongs to one — the exact reasoning that
   * keeps `companies` and `people` out of `GAME_SCOPED`.
   */
  scoped: boolean
}

export const SEARCH_TARGETS: readonly SearchTarget[] = [
  { slug: 'guides', label: 'Guides', field: 'title', scoped: true },
  { slug: 'quests', label: 'Quests', field: 'title', scoped: true },
  { slug: 'characters', label: 'Characters', field: 'title', scoped: true },
  { slug: 'enemies', label: 'Enemies', field: 'title', scoped: true },
  { slug: 'items', label: 'Items', field: 'title', scoped: true },
  { slug: 'regions', label: 'Regions', field: 'title', scoped: true },
  { slug: 'factions', label: 'Factions', field: 'title', scoped: true },
  { slug: 'mechanics', label: 'Mechanics', field: 'title', scoped: true },
  { slug: 'achievements', label: 'Achievements', field: 'title', scoped: true },
  { slug: 'perks', label: 'Perks', field: 'title', scoped: true },
  { slug: 'builds', label: 'Builds', field: 'title', scoped: true },
  { slug: 'endings', label: 'Endings', field: 'title', scoped: true },
  { slug: 'courts', label: 'Courts', field: 'title', scoped: true },
  { slug: 'court-activities', label: 'Court activities', field: 'title', scoped: true },
  { slug: 'skill-trees', label: 'Skill trees', field: 'title', scoped: true },
  { slug: 'maps', label: 'Maps', field: 'title', scoped: true },
  { slug: 'games', label: 'Wikis', field: 'title', scoped: false },
  { slug: 'companies', label: 'Studios and publishers', field: 'name', scoped: false },
  { slug: 'people', label: 'People', field: 'name', scoped: false },
  { slug: 'authors', label: 'Contributors', field: 'name', scoped: false },
  { slug: 'media', label: 'Images', field: 'alt', scoped: false },
  { slug: 'comments', label: 'Comments', field: 'excerpt', scoped: false },
  { slug: 'corrections', label: 'Corrections', field: 'summary', scoped: false },
]

/**
 * How many rows one collection may contribute.
 *
 * A search for "the" would otherwise return two thousand rows in one group and
 * bury the other twenty-two. The view says when a group was cut, because a
 * truncated list that does not admit it is the `find({ limit: 2000 })` mistake
 * — a denominator wrong in the reassuring direction.
 */
export const PER_COLLECTION = 8

/** Nothing shorter than this is worth a query across twenty-three collections. */
export const MIN_QUERY = 2

/** Trimmed, and collapsed — a pasted title often arrives with a line break in it. */
export const cleanQuery = (value: string | null | undefined): string =>
  (value ?? '').replace(/\s+/g, ' ').trim()

export const isSearchable = (value: string | null | undefined): boolean =>
  cleanQuery(value).length >= MIN_QUERY

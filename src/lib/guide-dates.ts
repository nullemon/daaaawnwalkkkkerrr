/**
 * What dates a guide can honestly state, and where each one comes from.
 *
 * ## The problem this file is the answer to
 *
 * A guide is an article, and an article with no date is a page a reader cannot
 * place and a crawler cannot age. Four candidate dates are lying around, and
 * three of them are false:
 *
 *   - **`updatedAt`** moves whenever a seeder rewrites a row. Every generator
 *     upserts every guide on every run, so all 410 rows carry the same
 *     `updatedAt` — the afternoon somebody last ran the pipeline. Published as
 *     a modification date it says four hundred articles were revised on a day
 *     nobody read one.
 *   - **`createdAt`** looks safer and is worse. The database is reproducible
 *     from seed by design — `pnpm db:reset` drops it and builds it again — so
 *     `createdAt` is the date of the last *rebuild*. Every guide on the network
 *     would claim to have been written this afternoon.
 *   - **A spread derived from the slug.** This file used to hash the slug into
 *     an offset and scatter the guides across the previous thirty days, so the
 *     dates at least looked like an editorial schedule. That is the worst of
 *     the three, because it is the only one *designed* to be believed: a
 *     plausible date under a headline is indistinguishable from a real one,
 *     and "Never invent a fact" has no exception for dates that make a sitemap
 *     look healthier. `seededPublishedAt` is still exported below, but only so
 *     the fabrications it wrote can be recognised and removed — see the note
 *     on it.
 *
 * The fourth is real, is already on the record, and is already printed on the
 * page.
 *
 * ## The date that is true: when the sources were read
 *
 * Every generated guide is a compilation of harvested material, and every
 * harvest is a committed file in `src/seed/raw/` carrying the day it was
 * fetched. The generators copy that day onto each citation as
 * `sources[].retrieved`, and the guide page prints it in the citation list. So
 * the record already knows, per source, the day somebody actually read the
 * page being cited. 409 of the 410 guides carry at least one.
 *
 * That date is worth more than the three above on every count:
 *
 *   - **It is a fact.** A harvester read that URL on that day, and the file
 *     that says so is in the repository.
 *   - **It survives a rebuild.** It comes out of committed JSON, not off the
 *     clock, so `pnpm db:reset` reproduces it exactly. A date that moves every
 *     time the database is rebuilt churns the sitemap's `lastmod` and
 *     re-publishes a page somebody bookmarked.
 *   - **It varies for a real reason.** The harvests ran on different days, so
 *     the dates differ because the work happened on different days — not
 *     because a hash function spread them out.
 *   - **It is what a reader of a compiled reference page actually wants**: not
 *     "when did this go up" but "how stale is this". It is labelled "last
 *     checked" on the page for that reason, and it agrees with the citation
 *     list three inches below it.
 *
 * So `updated` — the visible "last checked", the `dateModified` in the Article
 * markup, the `<lastmod>` in the sitemap and the item date in the feeds — is
 * the most recent `retrieved` across the guide's own citations, unless an
 * editor has stated one by hand, in which case theirs wins.
 *
 * ## And the date that stays unknown: publication
 *
 * There is no honest publication date for a generated guide. Nothing was
 * published on any particular day: the page came into being when a generator
 * ran, and it will come into being again, identically, the next time one does.
 * Deriving one from the sources would be the hash spread in a better suit — a
 * number computed from something real is not thereby a fact about something
 * else.
 *
 * So `published` is an editor's field and nothing else writes it. Blank means
 * blank: no "Published" row on the page, no `datePublished` in the markup, no
 * fallback to a row timestamp. Unknown is not zero, and a date is one of the
 * few things on a page a reader will believe without checking.
 *
 * Kept free of Payload imports so it can be unit-tested without a database,
 * and so the page, the sitemap, the feeds and the seeders all read one
 * implementation.
 */

/**
 * A day, as Payload stores a day-only date and as schema.org wants one.
 *
 * Everything here compares and returns `YYYY-MM-DD` strings. That is not
 * laziness about time zones — it is the only form in which these dates are
 * true. A harvest file says `2026-09-17` and nothing more; rendering that as
 * an instant would invent a time of day, and comparing two of them as instants
 * would make the answer depend on the reader's offset.
 */
const day = (value: string | Date | null | undefined): string | undefined => {
  if (!value) return undefined
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return undefined
  return date.toISOString().slice(0, 10)
}

/** One entry in a record's `sources` array, as much of it as this file reads. */
export type CitedSource = { retrieved?: string | Date | null } | null | undefined

/**
 * The most recent day any of these sources was read, or nothing.
 *
 * Lexicographic comparison, which is exact for `YYYY-MM-DD` and avoids
 * parsing four hundred rows' worth of dates into `Date` objects to find a
 * maximum.
 */
export const sourcesLastRead = (
  sources: readonly CitedSource[] | null | undefined,
): string | undefined => {
  let latest: string | undefined
  for (const source of sources ?? []) {
    const when = day(source?.retrieved)
    if (when && (latest === undefined || when > latest)) latest = when
  }
  return latest
}

/** As much of a guide as the dates need. Structural on purpose, not Payload's. */
export type GuideForDates = {
  published?: string | Date | null
  updated?: string | Date | null
  sources?: readonly CitedSource[] | null
}

export type GuideDates = {
  /** Only ever an editor's. Absent means no publication date is claimed. */
  published?: string
  /** "Last checked". */
  updated?: string
  /**
   * Where `updated` came from, so a caller can say so rather than implying an
   * editorial review that did not happen.
   *
   *   editorial  somebody typed it into the Provenance tab
   *   sources    the latest day one of this page's citations was read
   *   none       the page has neither, and states no date at all
   */
  basis: 'editorial' | 'sources' | 'none'
}

/**
 * Every date this guide is entitled to state.
 *
 * The one subtlety is the last branch. A page cannot have been checked before
 * it was published, and `dateModified` earlier than `datePublished` is
 * malformed structured data — so where an editor has set a publication date
 * later than the newest citation, the sources date is not offered as a
 * modification date. It is still true that those sources were read then; it is
 * just not an answer to "when did this last change".
 */
export const guideDates = (guide: GuideForDates): GuideDates => {
  const published = day(guide.published)

  const stated = day(guide.updated)
  if (stated) return { published, updated: stated, basis: 'editorial' }

  const read = sourcesLastRead(guide.sources)
  if (read && (published === undefined || read >= published)) {
    return { published, updated: read, basis: 'sources' }
  }

  return { published, basis: 'none' }
}

/**
 * The one date a sitemap or a feed wants: when this page last changed.
 *
 * Undefined rather than a fallback. `<lastmod>` is the single field crawlers
 * actually read out of a sitemap, and Google's stated position is that it
 * stops trusting one that is obviously synthetic — so an omitted `<lastmod>`
 * on the handful of pages that genuinely have no date costs nothing, while a
 * row timestamp on all four hundred costs the field's credibility for the
 * whole host.
 */
export const guideLastModified = (guide: GuideForDates): string | undefined => {
  const dates = guideDates(guide)
  return dates.updated ?? dates.published
}

// --- the fabrication this file used to produce ----------------------------

/**
 * The publication date the old rule wrote: a hash of the slug, offset back
 * from a fixed day.
 *
 * **Nothing should call this to write a date.** It is kept for one purpose —
 * recognising the rows it already wrote, so `pnpm seed:publish` can clear them
 * and `pnpm check:launch` can count any that are left. The value is
 * reproducible, which is the only reason a fabrication written weeks ago can
 * be identified now without a flag beside it; a "this is a placeholder"
 * checkbox is a thing somebody has to remember to untick, and this repository
 * already has thirty-six rows proving nobody does.
 *
 * Moving `SEEDED_WINDOW_END` breaks that recognition and strands whatever is
 * still in the database. Leave it where it is.
 */
export const SEEDED_WINDOW_END = '2026-09-18'

/** How wide the old window was. */
export const SEEDED_WINDOW_DAYS = 30

/**
 * FNV-1a, 32-bit. Four lines, no dependencies, an even spread over thirty
 * buckets for short kebab-case strings. Not a security primitive.
 */
const hash = (value: string): number => {
  let h = 0x811c9dc5
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

const MS_PER_DAY = 86_400_000

/**
 * The value the old rule would have written for this slug.
 *
 * Recognition only. See the block comment above — writing this to a record is
 * the fabrication, not the fix.
 */
export const seededPublishedAt = (slug: string): string => {
  const end = Date.parse(`${SEEDED_WINDOW_END}T00:00:00.000Z`)
  const offset = hash(slug) % SEEDED_WINDOW_DAYS
  return new Date(end - offset * MS_PER_DAY).toISOString()
}

/**
 * Is this guide still carrying a date the old rule fabricated?
 *
 * Compared on the calendar day rather than on the exact string: Payload's
 * day-only picker stores midnight UTC, but a value that has been through an
 * admin save, an API round trip or a time zone can come back with a time on
 * it, and a check that answers "edited" because of a millisecond quietly stops
 * counting the thing it exists to count.
 *
 * An empty date is **not** seeded. It is undated, which is now the ordinary
 * state of a generated guide rather than a finding.
 */
export const isSeededPublishedAt = (
  slug: string,
  value: string | Date | null | undefined,
): boolean => {
  if (!value) return false
  const stored = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(stored.getTime())) return false
  return stored.toISOString().slice(0, 10) === seededPublishedAt(slug).slice(0, 10)
}

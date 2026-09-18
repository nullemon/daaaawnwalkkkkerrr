/**
 * The publication date a guide carries until somebody writes a real one.
 *
 * ## Why a guide needs a field at all
 *
 * A guide is an article, and an article with no date is a page a reader
 * cannot place and a crawler cannot age. Payload stamps `createdAt` and
 * `updatedAt` on every row and neither of them can be published here:
 *
 *   - `updatedAt` moves whenever a seeder rewrites a row. `pnpm seed:topics`
 *     upserts every generated guide on every run, so publishing `updatedAt`
 *     would tell a reader the page was revised on a day nobody looked at it.
 *   - `createdAt` looks safer and is worse. The database is reproducible from
 *     seed by design — `pnpm db:reset` drops it and builds it again — so
 *     `createdAt` is the date of the last *rebuild*, not of publication. Every
 *     guide on the network would claim to have been published this afternoon.
 *
 * So the date is its own field, and this module supplies the scaffolding value
 * for the ones nobody has dated by hand yet.
 *
 * ## Why the value is derived rather than stored at random
 *
 * The owner asked for the dates to be spread across the last thirty days
 * rather than all landing on one afternoon, and said he would correct them as
 * he goes. That makes the seeded value scaffolding in the same sense as the
 * thirty-six placeholder contributors: a stand-in he intends to replace.
 *
 * `Math.random()` or "today minus N" would reshuffle every date on every
 * rebuild, and this project rebuilds from seed constantly. A guide whose date
 * moves each time somebody runs `pnpm db:reset` is worse than one with no date
 * at all: the sitemap's `lastmod` churns, and a reader who bookmarks a page
 * sees it re-publish itself. So the offset is a hash of the slug and the
 * window ends on a fixed day written down here — same guide, same date,
 * forever, on any machine.
 *
 * ## Why that also makes the check self-clearing
 *
 * Because the value is reproducible, "is this date still the seeded one?" is
 * answerable without storing a flag beside it. That matters: a "this is a
 * placeholder" checkbox is a thing somebody has to remember to untick, and
 * this repository already has thirty-six rows proving nobody does. Edit the
 * date in the admin and it stops matching; `pnpm check:launch` stops counting
 * it. Nothing to tick.
 *
 * Kept free of Payload imports so it can be unit-tested without a database,
 * and so the audit, the seeder and the admin all read one implementation.
 */

/**
 * The last day of the window.
 *
 * A constant, not `new Date()`. The whole point is that the same guide gets
 * the same date on every rebuild; anchoring the window to "now" would move all
 * of them by a day every day, which is the churn this exists to prevent.
 *
 * Moving this line re-dates every guide that is still carrying a seeded value.
 * That is the only thing that should ever move them, and it should be a
 * deliberate edit rather than a side effect of the clock.
 */
export const SEEDED_WINDOW_END = '2026-09-18'

/** How wide the window is. The owner asked for thirty days. */
export const SEEDED_WINDOW_DAYS = 30

/**
 * FNV-1a, 32-bit.
 *
 * Any stable hash would do; this one is four lines, has no dependencies and
 * gives an even spread over thirty buckets for the short kebab-case strings
 * these slugs actually are. It is not a security primitive and is not used as
 * one.
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
 * The seeded publication date for a guide, as Payload stores a day-only date:
 * midnight UTC, ISO.
 *
 * Hashed on the slug alone rather than on `game/slug`. Two wikis that both
 * have a `regions-known` therefore share a date, which is invisible — they are
 * different sites — and it keeps the audit's read down to two columns at
 * `depth: 0` instead of a populated `game` relationship on four hundred rows.
 */
export const seededPublishedAt = (slug: string): string => {
  const end = Date.parse(`${SEEDED_WINDOW_END}T00:00:00.000Z`)
  const offset = hash(slug) % SEEDED_WINDOW_DAYS
  return new Date(end - offset * MS_PER_DAY).toISOString()
}

/**
 * Is this guide still carrying the value the seeder put there?
 *
 * Compared on the calendar day rather than on the exact string. Payload's
 * day-only picker stores midnight UTC, but a value that has been through an
 * admin save, an API round trip or a timezone can come back with a time on it,
 * and a check that answers "edited" because of a millisecond is a check that
 * quietly stops counting the thing it was written to count.
 *
 * An empty date is **not** seeded — it is undated, which is a different
 * finding and deliberately not this one's business.
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

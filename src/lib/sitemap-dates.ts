/**
 * Demo mode for `<lastmod>`: a spread of unique dates instead of real ones.
 *
 *   SITEMAP_DEMO_DATES=off   in `.env`, to turn it back off
 *
 * ## What this does, plainly
 *
 * It fabricates the dates in the sitemap. Every URL gets its own, spread
 * across a recent window, so a sitemap reads like a site somebody has been
 * working on continuously rather than one built from four harvest days. That
 * is what it is for and there is no way to word it that makes it something
 * else, so it says so here rather than being discovered later.
 *
 * ## Why it exists anyway
 *
 * The owner asked for it, for a demo. A sitemap whose 532 entries carry six
 * distinct dates is accurate and looks like a site nobody maintains, and the
 * thing being shown is what the network looks like in use.
 *
 * ## The costs, stated once
 *
 * **Google's position is that it stops trusting a `lastmod` it can see is
 * synthetic**, and `lastmod` is the only field in a sitemap it reads at all.
 * So this can cost the field's credibility for the whole host — which is the
 * opposite of what it is switched on to buy. It is worth it for a demo and it
 * is not worth it for a live site.
 *
 * **It is the thing `guide-dates.ts` was written to remove.** Guide dates used
 * to be a hash of the slug spread over thirty days, and the finding that
 * replaced them put it best: a hash spread is worse than one shared date
 * precisely *because* it is the only option designed to be believed. Turning
 * this on re-creates that, in one place, on purpose, behind a switch.
 *
 * `pnpm check:launch` reports it as an action for as long as it is on, so it
 * cannot be shipped by having been forgotten.
 *
 * ## Deterministic, not random
 *
 * "Random" would mean two fetches of the same sitemap disagreeing about when
 * a page changed, which is a thing a crawler can notice in one day and is
 * worse than any fixed date. The offset is a hash of the URL, so the dates are
 * stable across fetches, stable across rebuilds, and unique per page.
 *
 * No I/O and no Payload types: this is arithmetic over a string, and it is
 * unit-tested against both of the properties above.
 */

/** Days back from the build the spread covers. */
const WINDOW_DAYS = 45

/**
 * FNV-1a, 32-bit. Any stable hash would do; this one is four lines, has no
 * dependency, and is the same shape `src/lib/art.ts` uses to pick a band.
 */
const hash = (value: string): number => {
  let out = 0x811c9dc5
  for (let i = 0; i < value.length; i += 1) {
    out ^= value.charCodeAt(i)
    out = Math.imul(out, 0x01000193)
  }
  return out >>> 0
}

/** Is demo mode on? Anything but an explicit `off` means yes. */
export const demoDatesOn = (value: string | undefined = process.env.SITEMAP_DEMO_DATES): boolean =>
  (value ?? '').trim().toLowerCase() !== 'off'

/**
 * A date for one URL: its own, stable, and inside the window.
 *
 * Minutes as well as days, because 3,194 pages over 45 days is 71 a day and a
 * sitemap where seventy entries share a timestamp to the second is a spread
 * that gives itself away. The hash supplies both from one value: the low bits
 * pick the minute of the day, the rest pick the day.
 */
export const spreadDate = (url: string, now: Date, windowDays = WINDOW_DAYS): Date => {
  const seed = hash(url)
  const daysBack = seed % windowDays
  const minuteOfDay = (seed >>> 8) % 1440

  const out = new Date(now)
  out.setUTCDate(out.getUTCDate() - daysBack)
  out.setUTCHours(Math.floor(minuteOfDay / 60), minuteOfDay % 60, seed % 60, 0)

  /*
    A page modified in the future.

    The minute of the day is chosen independently of the day, so a URL that
    hashes to `daysBack === 0` and to a minute later than the current one lands
    after `now` — about half of the 1-in-45 that land on today, which on 3,194
    pages is thirty-odd entries telling a crawler a page will be edited this
    evening. One day back is the whole fix and it costs nothing: the window is
    45 days wide and this moves an entry inside it.
  */
  if (out.getTime() > now.getTime()) out.setUTCDate(out.getUTCDate() - 1)

  return out
}

/**
 * What a sitemap entry should carry, given the real answer.
 *
 * Demo mode replaces it; otherwise the real date is passed straight through,
 * including its absence — a page with no dated citation carries no `lastmod`
 * at all, which is a legal answer in a sitemap and a true one.
 */
export const lastmodFor = (
  url: string,
  real: Date | string | undefined | null,
  now: Date,
  demo = demoDatesOn(),
): Date | undefined => {
  if (demo) return spreadDate(url, now)
  if (!real) return undefined
  const date = real instanceof Date ? real : new Date(real)
  return Number.isFinite(date.getTime()) ? date : undefined
}

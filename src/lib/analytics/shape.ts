/**
 * The time windows, the dimensions, and the two numbers — with the caveats
 * attached to the things they are caveats about.
 *
 * Every constant here is imported by both the reading side and the admin view,
 * so a window the query layer supports and the picker does not offer (or the
 * other way round) is impossible rather than merely unlikely. The same
 * reasoning as `lib/tenancy.ts`: one list, three readers, no way to disagree.
 *
 * No Payload types and no I/O, so the whole thing is unit-testable.
 */

/* -------------------------------------------------------------------------- */
/* Retention                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * How long a single page view is kept as its own row.
 *
 * Sixty-two days is two calendar months plus a margin, which is the longest
 * window anybody asks a filtered question about — "mobile readers in the
 * Philippines on the Onimusha wiki last month" is a real question, "…in March
 * of last year" is not. Past that the rows are summarised and deleted.
 *
 * This is the number that keeps a thirty-day query cheap. It cannot table-scan
 * a year of raw rows because a year of raw rows does not exist: the table holds
 * at most sixty-two days, the query is a range on an indexed `created_at`, and
 * the work is proportional to the window rather than to the site's lifetime.
 *
 * Rollups are kept indefinitely. A day of this network's traffic collapses to
 * a few hundred rollup rows, so a decade of them is smaller than a week of raw.
 */
export const RAW_RETENTION_DAYS = 62

/* -------------------------------------------------------------------------- */
/* Windows                                                                    */
/* -------------------------------------------------------------------------- */

export type WindowId = '1h' | '24h' | '7d' | '30d' | '90d' | '12m' | 'all'

/** How the time series is bucketed, and how many ISO characters that is. */
export type Bucket = 'minute' | 'hour' | 'day' | 'month'

export const BUCKET_CHARS: Record<Bucket, number> = {
  minute: 16, // 2026-09-18T14:05
  hour: 13, //   2026-09-18T14
  day: 10, //    2026-09-18
  month: 7, //   2026-09
}

/**
 * A window is either a number of hours back from now, or a number of whole UTC
 * days ending with today.
 *
 * **The day-aligned form is not cosmetic — it is what makes the long windows
 * cheap and exact at the same time.** A rollup is per UTC day, so a window that
 * started at 14:32 twenty-nine days ago could only ever be answered by reading
 * individual page views; a window that starts at a midnight is a sum of days
 * that have already been counted.
 *
 * Measured, not assumed. At 300,000 rows across 62 days, the fifteen aggregate
 * queries a 30-day window needs cost 13.7 seconds against raw page views and
 * 7ms against rollups — because a `GROUP BY` on any column that is not in the
 * index has to fetch every row in the window, and thirteen of them fetch it
 * thirteen times. See the note on exactness in `query.ts`: for a multi-day
 * window the two answers are the same number, so this is a change of cost and
 * not a change of meaning.
 */
export type WindowSpec = {
  id: WindowId
  label: string
  /** Hours back from this moment. Set on the sub-day windows only. */
  hours?: number
  /** Whole UTC days ending today, or null for everything there is. */
  days?: number | null
  bucket: Bucket
}

const HOUR = 3_600_000
const DAY = 24 * HOUR

export const WINDOWS: readonly WindowSpec[] = [
  { id: '1h', label: 'Last hour', hours: 1, bucket: 'minute' },
  { id: '24h', label: 'Last 24 hours', hours: 24, bucket: 'hour' },
  /*
    Seven whole days including today, not "168 hours ago until now". The two
    differ by part of a day and the second cannot use a rollup at all — and
    "last 7 days" is what a person means by the first.
  */
  { id: '7d', label: 'Last 7 days', days: 7, bucket: 'day' },
  { id: '30d', label: 'Last 30 days', days: 30, bucket: 'day' },
  { id: '90d', label: 'Last 90 days', days: 90, bucket: 'day' },
  { id: '12m', label: 'Last 12 months', days: 365, bucket: 'month' },
  { id: 'all', label: 'All time', days: null, bucket: 'month' },
]

export const windowSpec = (id: string | null | undefined): WindowSpec =>
  WINDOWS.find((w) => w.id === id) ?? WINDOWS[1]

export type Range = {
  spec: WindowSpec
  /** Inclusive ISO lower bound. The epoch for 'all'. */
  from: string
  /** Exclusive ISO upper bound - "now", so a partial bucket is partial rather than missing. */
  to: string
  /**
   * Whether every row this window needs is still in the raw table.
   *
   * This decides whether a filter can be honoured: filtering needs the rows
   * themselves, and past retention there are none. The admin says which table
   * answered rather than presenting both as the same kind of number.
   */
  withinRaw: boolean
  /**
   * Whether this window is a whole number of UTC days ending today.
   *
   * True means the rollups can answer it exactly. False means it has to be
   * read from individual page views, which is correct and costs what the note
   * above measured.
   */
  dayAligned: boolean
  /** The first and last UTC day this window touches, as rollup keys. */
  firstDay: string
  lastDay: string
  /**
   * Whether this window crosses a UTC midnight.
   *
   * The visitor key rotates daily, so a distinct count is exact inside one day
   * and a ceiling across two - somebody who reads at 23:50 and again at 00:10
   * is two keys. This is the flag, rather than "is the window longer than a
   * day", because a one-hour window straddling midnight has the same problem
   * and would otherwise be labelled exact when it is not.
   */
  spansDays: boolean
}

/**
 * The window as two ISO strings, plus the two day keys it spans.
 *
 * Everything is UTC and the admin says so. A local-midnight boundary would
 * make "last 30 days" mean something different depending on who is reading,
 * and the rollup key would stop lining up with the raw rows it came from -
 * which is the kind of drift that produces two numbers for one question.
 *
 * `now` is a parameter so the tests can pin a clock.
 */
export const rangeFor = (id: string | null | undefined, now: Date = new Date()): Range => {
  const spec = windowSpec(id)
  const to = now.toISOString()
  const today = to.slice(0, 10)

  const from =
    spec.hours !== undefined
      ? new Date(now.getTime() - spec.hours * HOUR).toISOString()
      : spec.days === null || spec.days === undefined
        ? new Date(0).toISOString()
        : `${new Date(Date.parse(`${today}T00:00:00.000Z`) - (spec.days - 1) * DAY)
            .toISOString()
            .slice(0, 10)}T00:00:00.000Z`

  const retentionStart = now.getTime() - RAW_RETENTION_DAYS * DAY

  return {
    spec,
    from,
    to,
    withinRaw: Date.parse(from) >= retentionStart,
    dayAligned: spec.hours === undefined,
    firstDay: from.slice(0, 10),
    lastDay: today,
    spansDays: from.slice(0, 10) !== today,
  }
}

/** The UTC day a moment falls in, as the rollup key. */
export const dayKey = (at: Date): string => at.toISOString().slice(0, 10)

/* -------------------------------------------------------------------------- */
/* Dimensions                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The breakdowns, and the single place a dimension name is turned into a
 * column name.
 *
 * This map is the injection guard as well as the label list. Nothing anywhere
 * interpolates a caller-supplied string into SQL; a dimension is looked up
 * here and the *column constant* is what reaches the query, so a value that is
 * not a key of this object cannot reach the database in any form.
 */
export type DimensionId =
  | 'site'
  | 'host'
  | 'path'
  | 'section'
  | 'channel'
  | 'source'
  | 'campaign'
  | 'device'
  | 'browser'
  | 'os'
  | 'country'

export type Dimension = {
  id: DimensionId
  column: string
  label: string
  /** Shown under the heading. Says what the number is and what it is not. */
  note: string
}

export const DIMENSIONS: readonly Dimension[] = [
  {
    id: 'site',
    column: 'site',
    label: 'Wiki',
    note: 'Which site in the network the page belongs to, read from the host the request arrived on.',
  },
  {
    id: 'host',
    column: 'host',
    label: 'Host',
    note: 'The exact hostname, so a wiki reached through the apex and through its own subdomain are told apart.',
  },
  { id: 'path', column: 'path', label: 'Page', note: 'Path only. Query strings are never stored.' },
  {
    id: 'section',
    column: 'section',
    label: 'Section',
    note: 'The first path segment — quests, guides, characters — so a wiki can be read by area rather than page by page.',
  },
  {
    id: 'channel',
    column: 'channel',
    label: 'How they arrived',
    note: 'Derived from the referrer the browser sent. “Direct” means it sent none, which is not the same as nowhere.',
  },
  {
    id: 'source',
    column: 'source',
    label: 'Source',
    note: 'The referring host, or the campaign tag when there was no referrer. Host only — never a full URL.',
  },
  {
    id: 'campaign',
    column: 'campaign',
    label: 'Campaign',
    note: 'The utm_campaign tag on the URL, when there was one.',
  },
  {
    id: 'device',
    column: 'device',
    label: 'Device',
    note: 'Read from the user-agent, which is a claim the browser makes rather than anything observed.',
  },
  {
    id: 'browser',
    column: 'browser',
    label: 'Browser',
    note: 'Family only, from the user-agent. No version — that is a fingerprinting bit and answers nothing.',
  },
  { id: 'os', column: 'os', label: 'Operating system', note: 'Family only, from the user-agent.' },
  {
    id: 'country',
    column: 'country',
    label: 'Country',
    note: 'From the hosting platform’s own header. There is no geo database here, so where the platform does not supply one the answer is “unknown” — which is not zero and not a guess.',
  },
]

export const dimension = (id: string): Dimension | undefined =>
  DIMENSIONS.find((d) => d.id === id)

/**
 * The country value used when nothing supplied one.
 *
 * A literal rather than null, so it appears in the breakdown as a row with a
 * count instead of vanishing. "Unknown is not zero" is a rule this repository
 * already states about segment costs, and a blank cell reads as zero to
 * everybody who has ever looked at a dashboard.
 */
export const UNKNOWN_COUNTRY = 'unknown'

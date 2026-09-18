import type { Payload } from 'payload'
import { ensureDayRolled, type SqlClient } from './maintain'
import {
  BUCKET_CHARS,
  DIMENSIONS,
  RAW_RETENTION_DAYS,
  dimension,
  rangeFor,
  type DimensionId,
  type Range,
  type WindowId,
} from './shape'

/**
 * Reading the numbers back — in SQL, because the alternative is reading the
 * rows.
 *
 * ## Why this talks to the database directly
 *
 * Payload's query API can filter and count; it cannot `GROUP BY`. Answering
 * "the ten busiest pages last month" through `find()` means pulling every row
 * in the window into node and tallying it there, which is the same mistake the
 * navigation made when it loaded every row of thirteen collections to take a
 * `.length` — it worked, it was invisible, and it was most of why the build
 * was slow. Aggregation belongs where the index is.
 *
 * `payload.db.client` is the libSQL client the adapter already holds, so this
 * adds no dependency and no second connection, and it is the same client in
 * development (a local file) and in production (Turso).
 *
 * ## Nothing a caller sends reaches the SQL as text
 *
 * Every column name comes from the `DIMENSIONS` table in `shape.ts` and is
 * looked up, never interpolated; every value is a bound parameter. A dimension
 * that is not a key of that list cannot reach the database in any form, which
 * is the injection guard and the reason the list is a list.
 *
 * ## Which table answers, and why it is a cost decision rather than a quality one
 *
 * **Measured first.** At 300,000 page views across 62 days — a busier network
 * than this one is — the fifteen aggregates a 30-day window needs cost:
 *
 *     read from individual page views    13,723 ms
 *     read from daily rollups                 7 ms
 *
 * The reason is in the second measurement below it: `count(*)` over the same
 * window takes 22ms because it never leaves the index, and a `GROUP BY` on any
 * column that is not in the index takes about a second because it has to fetch
 * every row — and thirteen breakdowns fetch them thirteen times.
 *
 * The rollup answer is **the same number**, not a cheaper approximation of it.
 * The visitor key has the UTC date inside it, so a key belongs to exactly one
 * day; the distinct readers of thirty days are therefore exactly the sum of
 * thirty daily distinct counts, and page views obviously sum. This is the
 * whole reason the key was designed that way — see `request.ts`, where it is
 * a privacy decision, and `maintain.ts`, where it turns out to be this.
 *
 * So the routing is:
 *
 *   - **Sub-day window** (last hour, last 24 hours) — raw. A rollup has no
 *     sub-day resolution, and these windows are small enough to be fast.
 *   - **Any window with a filter on it, inside the raw retention** — raw. A
 *     rollup is one-dimensional, and "mobile readers in the Philippines" needs
 *     the rows. This is the slow path and it is a deliberate narrow question.
 *   - **Everything else** — rollups, after making sure today's is current.
 *
 * A filter on a window *past* the retention cannot be honoured at all, and the
 * report says so rather than quietly returning the unfiltered number. That
 * last part is the whole point: a dashboard that silently ignores a filter is
 * the exact failure this repository keeps finding — nothing errors, the figure
 * looks right, and it is the reassuring one.
 */

const clientOf = (payload: Payload): SqlClient => {
  const client = (payload.db as unknown as { client?: SqlClient }).client
  if (!client?.execute) {
    /*
      Thrown rather than returning empty. The one thing a dashboard must never
      do is report zero because it could not ask — every caller of this module
      turns the throw into a message that says the number is unknown.
    */
    throw new Error('the database adapter exposes no SQL client')
  }
  return client
}

const num = (value: unknown): number => (typeof value === 'number' ? value : Number(value ?? 0))
const str = (value: unknown): string => (value === null || value === undefined ? '' : String(value))

/** How stale today's rollup may be before the view re-rolls it. */
const TODAY_FRESHNESS_MS = 120_000

/* -------------------------------------------------------------------------- */
/* Filters                                                                    */
/* -------------------------------------------------------------------------- */

export type Filter = { dim: DimensionId; value: string }

/**
 * A filter list, from whatever arrived in the query string.
 *
 * Unknown keys are dropped here and the admin renders exactly what this
 * returns, so anything dropped visibly disappears from the chip row rather
 * than silently failing to apply.
 */
export const parseFilters = (params: URLSearchParams): Filter[] => {
  const filters: Filter[] = []
  for (const dim of DIMENSIONS) {
    const value = params.get(`f_${dim.id}`)
    if (value !== null && value !== '') filters.push({ dim: dim.id, value: value.slice(0, 512) })
  }
  return filters
}

/** `AND host = ? AND device = ?` and the values to bind, or nothing at all. */
const filterSql = (filters: Filter[]): { sql: string; args: string[] } => {
  const parts: string[] = []
  const args: string[] = []
  for (const filter of filters) {
    const dim = dimension(filter.dim)
    if (!dim) continue
    parts.push(` and "${dim.column}" = ?`)
    args.push(filter.value)
  }
  return { sql: parts.join(''), args }
}

/* -------------------------------------------------------------------------- */
/* The report                                                                 */
/* -------------------------------------------------------------------------- */

export type Cell = { value: string; views: number; readers: number }

export type Report = {
  range: Range
  /** Which table answered. Decides whether the filters meant anything. */
  source: 'raw' | 'rollups'
  /** Set when a filter was asked for and could not be applied. */
  filtersIgnored: boolean
  totals: { views: number; readers: number; pages: number }
  /** Exact within one UTC day; a ceiling across several. See request.ts. */
  readersAreCeiling: boolean
  series: { bucket: string; views: number; readers: number }[]
  breakdowns: { dim: DimensionId; cells: Cell[] }[]
  bots: { seen: number; excluded: number; byRule: { id: string; views: number }[] }
  /** The oldest and newest day present in the rollup table, or null if it has never run. */
  rollupsFrom: string | null
  rollupsThrough: string | null
  /**
   * Days inside this window that have page views on disk and no summary.
   *
   * Not "the window starts before the oldest rollup", which was the first
   * version of this check and cried wolf on every install: a window reaching
   * back to before the site had any traffic is complete, because there is
   * nothing there to be missing. What matters is whether a day that *does*
   * have rows was left out of the summaries — that is a real gap, the figures
   * are silently short by it, and a partial total presented as a total is the
   * reassuring wrong number this whole project is written against.
   *
   * Only ever populated on the rollup path; the raw path reads the rows.
   */
  rollupsMissingDays: string[]
  filters: Filter[]
  /** Printed rather than implied, the way the audit pass prints "190 counts, 74ms". */
  cost: { queries: number; ms: number }
}

type Body = Omit<
  Report,
  | 'range'
  | 'source'
  | 'rollupsFrom'
  | 'rollupsThrough'
  | 'rollupsMissingDays'
  | 'filters'
  | 'filtersIgnored'
  | 'cost'
> & { queries: number }

const TOP = 15

const rawReport = async (sql: SqlClient, range: Range, filters: Filter[]): Promise<Body> => {
  const where = filterSql(filters)
  /* Readers only. Every figure below excludes the rows a bot rule matched;
     the bot numbers are counted separately and reported as a fraction. */
  const base = `from analytics_events where bot_rule is null and created_at >= ? and created_at < ?${where.sql}`
  const bind = [range.from, range.to, ...where.args]

  const totals = await sql.execute({
    sql: `select count(*) as views, count(distinct visitor) as readers, count(distinct path) as pages ${base}`,
    args: bind,
  })

  const chars = BUCKET_CHARS[range.spec.bucket]
  const series = await sql.execute({
    sql: `select substr(created_at, 1, ${chars}) as bucket, count(*) as views, count(distinct visitor) as readers ${base} group by 1 order by 1`,
    args: bind,
  })

  const breakdowns: { dim: DimensionId; cells: Cell[] }[] = []
  for (const dim of DIMENSIONS) {
    const result = await sql.execute({
      sql: `select coalesce("${dim.column}", '') as value, count(*) as views, count(distinct visitor) as readers ${base} group by 1 order by views desc limit ${TOP}`,
      args: bind,
    })
    breakdowns.push({
      dim: dim.id,
      cells: result.rows.map((row) => ({
        value: str(row.value) || '(none)',
        views: num(row.views),
        readers: num(row.readers),
      })),
    })
  }

  /*
    The excluded fraction, over the same window and the same filters. Reported
    because a bot filter nobody can see the size of is a bot filter nobody can
    check — and because on this network, which invites crawlers, the owner has
    a real interest in how much of the traffic they are.
  */
  const bots = await sql.execute({
    sql: `select bot_rule as id, count(*) as views from analytics_events where bot_rule is not null and created_at >= ? and created_at < ?${where.sql} group by 1 order by views desc`,
    args: bind,
  })

  const excluded = bots.rows.reduce((sum, row) => sum + num(row.views), 0)
  const views = num(totals.rows[0]?.views)

  return {
    totals: { views, readers: num(totals.rows[0]?.readers), pages: num(totals.rows[0]?.pages) },
    readersAreCeiling: range.spansDays,
    series: series.rows.map((row) => ({
      bucket: str(row.bucket),
      views: num(row.views),
      readers: num(row.readers),
    })),
    breakdowns,
    bots: {
      seen: views + excluded,
      excluded,
      byRule: bots.rows.map((row) => ({ id: str(row.id), views: num(row.views) })),
    },
    queries: 3 + DIMENSIONS.length,
  }
}

const rollupReport = async (sql: SqlClient, range: Range): Promise<Body> => {
  const days = [range.firstDay, range.lastDay]

  const totals = await sql.execute({
    sql: `select sum(views) as views, sum(readers) as readers from analytics_daily where dim = 'total' and day >= ? and day <= ?`,
    args: days,
  })

  /*
    Distinct paths, not a sum. Two days that each saw the same forty pages saw
    forty pages, not eighty — which is the one figure in this report that does
    not compose the way views and readers do, and the reason it is its own
    query rather than another column on the one above.
  */
  const pages = await sql.execute({
    sql: `select count(distinct value) as pages from analytics_daily where dim = 'path' and day >= ? and day <= ?`,
    args: days,
  })

  const chars = Math.min(BUCKET_CHARS[range.spec.bucket], 10)
  const series = await sql.execute({
    sql: `select substr(day, 1, ${chars}) as bucket, sum(views) as views, sum(readers) as readers from analytics_daily where dim = 'total' and day >= ? and day <= ? group by 1 order by 1`,
    args: days,
  })

  const breakdowns: { dim: DimensionId; cells: Cell[] }[] = []
  for (const dim of DIMENSIONS) {
    const result = await sql.execute({
      sql: `select value, sum(views) as views, sum(readers) as readers from analytics_daily where dim = ? and day >= ? and day <= ? group by value order by views desc limit ${TOP}`,
      args: [dim.id, ...days],
    })
    breakdowns.push({
      dim: dim.id,
      cells: result.rows.map((row) => ({
        value: str(row.value) || '(none)',
        views: num(row.views),
        readers: num(row.readers),
      })),
    })
  }

  const bots = await sql.execute({
    sql: `select value as id, sum(views) as views from analytics_daily where dim = 'bot' and day >= ? and day <= ? group by value order by views desc`,
    args: days,
  })

  const excluded = bots.rows.reduce((sum, row) => sum + num(row.views), 0)
  const views = num(totals.rows[0]?.views)

  return {
    totals: { views, readers: num(totals.rows[0]?.readers), pages: num(pages.rows[0]?.pages) },
    readersAreCeiling: range.spansDays,
    series: series.rows.map((row) => ({
      bucket: str(row.bucket),
      views: num(row.views),
      readers: num(row.readers),
    })),
    breakdowns,
    bots: {
      seen: views + excluded,
      excluded,
      byRule: bots.rows.map((row) => ({ id: str(row.id), views: num(row.views) })),
    },
    queries: 4 + DIMENSIONS.length,
  }
}

/**
 * The whole report for one window and one filter set.
 *
 * Throws on a database failure rather than returning zeros. The caller in
 * `components/admin/analytics-snapshot.ts` turns that into a message on screen
 * — "these numbers could not be read" is a different statement from "these
 * numbers are zero", and only one of them is ever true by accident.
 */
export const readReport = async (
  payload: Payload,
  options: { window?: WindowId | string | null; filters?: Filter[]; now?: Date } = {},
): Promise<Report> => {
  const started = Date.now()
  const sql = clientOf(payload)
  const range = rangeFor(options.window, options.now ?? new Date())
  const filters = options.filters ?? []

  /* Raw when the rollups cannot answer the question: a sub-day window has no
     rollup to read, and a filtered one needs a second dimension the rollups
     do not carry. */
  const needsRows = !range.dayAligned || filters.length > 0
  const source: Report['source'] = needsRows && range.withinRaw ? 'raw' : 'rollups'
  const filtersIgnored = filters.length > 0 && source === 'rollups'

  if (source === 'rollups') {
    /* Today is still happening, so the last day of every long window is
       incomplete until this runs. At most once every two minutes. */
    await ensureDayRolled(sql, range.lastDay, TODAY_FRESHNESS_MS)
  }

  const span = await sql.execute({
    sql: `select min(day) as first, max(day) as last from analytics_daily`,
    args: [],
  })
  const rollupsFrom = str(span.rows[0]?.first) || null
  const rollupsThrough = str(span.rows[0]?.last) || null

  /*
    Which days in this window have rows but no summary.

    Both halves are answered from an index — `substr` of `created_at` never
    leaves it, which is the 22ms case rather than the one-second case — so
    asking outright costs less than keeping a watermark that can be wrong.
    `maintain.ts` has the story of the watermark that was.
  */
  let rollupsMissingDays: string[] = []
  if (source === 'rollups') {
    const [rawDays, rolledDays] = await Promise.all([
      sql.execute({
        sql: `select distinct substr(created_at, 1, 10) as day from analytics_events where created_at >= ? and created_at < ? order by 1`,
        args: [range.from, range.to],
      }),
      sql.execute({
        sql: `select distinct day from analytics_daily where day >= ? and day <= ?`,
        args: [range.firstDay, range.lastDay],
      }),
    ])
    const rolled = new Set(rolledDays.rows.map((row) => str(row.day)))
    rollupsMissingDays = rawDays.rows
      .map((row) => str(row.day))
      .filter((day) => !rolled.has(day))
  }

  const body =
    source === 'raw' ? await rawReport(sql, range, filters) : await rollupReport(sql, range)

  const { queries, ...rest } = body
  return {
    ...rest,
    range,
    source,
    filtersIgnored,
    rollupsFrom,
    rollupsThrough,
    rollupsMissingDays,
    // Filters that did not apply are still shown, so the chip row and the
    // sentence explaining why they did nothing are about the same list.
    filters,
    cost: { queries: queries + 1 + (source === 'rollups' ? 2 : 0), ms: Date.now() - started },
  }
}

/**
 * The distinct values of one dimension, for a filter picker.
 *
 * Read from the raw table over the retention window rather than from rollups,
 * because a picker offering a value that no filterable window contains would
 * offer a filter that always returns nothing.
 */
export const facetValues = async (
  payload: Payload,
  dim: DimensionId,
  now: Date = new Date(),
): Promise<string[]> => {
  const column = dimension(dim)?.column
  if (!column) return []
  const sql = clientOf(payload)
  const from = new Date(now.getTime() - RAW_RETENTION_DAYS * 86_400_000).toISOString()
  const result = await sql.execute({
    sql: `select "${column}" as value, count(*) as views from analytics_events where bot_rule is null and created_at >= ? group by 1 order by views desc limit 60`,
    args: [from],
  })
  return result.rows.map((row) => str(row.value)).filter(Boolean)
}

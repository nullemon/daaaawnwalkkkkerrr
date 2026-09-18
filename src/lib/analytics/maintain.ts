import type { Payload } from 'payload'
import { client } from '@/lib/payload'
import { DIMENSIONS, RAW_RETENTION_DAYS, dayKey } from './shape'

/**
 * Summarise yesterday, then throw yesterday away.
 *
 * ## The shape of the problem
 *
 * One row per page view is the right thing for a filtered question and the
 * wrong thing to keep for a decade. Ten hosts and nineteen hundred pages will
 * eventually be a table nobody wants to `GROUP BY`, and "it will be fine"
 * about data volume is a decision nobody made.
 *
 * So: raw rows live `RAW_RETENTION_DAYS` and are summarised into
 * `analytics_daily` before they go. The rollup row count depends on how many
 * *distinct values* a day had, not on how many hits — so a day collapses to a
 * few hundred rows however busy it was, and the history is effectively free.
 *
 * ## Why a day is deleted and rewritten rather than upserted
 *
 * A path that was in yesterday's top list and is not in today's recomputation
 * would, under an upsert, keep its old row forever — a page that stops being
 * read would stay in the table at the count it had when it stopped. Deleting
 * the day first makes the pass idempotent in the strong sense: whatever it
 * writes is the whole truth about that day, and running it twice, or after a
 * correction, cannot leave a fragment of an older answer behind.
 *
 * ## Rollups are not an approximation, and that is not an accident
 *
 * The visitor key has the UTC date inside it, so a key is unique to a day by
 * construction. That means the distinct readers of a week are exactly the sum
 * of the distinct readers of its seven days — there is no reader who could
 * appear in two of those counts as the same value. Page views obviously sum.
 *
 * So for a window that is a whole number of UTC days, a rollup answers the
 * same number the raw rows would, and the only thing lost is the ability to
 * combine two dimensions in one question. That is what makes the fast path
 * honest rather than a trade: see `query.ts`, which routes on exactly this.
 *
 * ## Why two caps
 *
 * See `VALUE_CAP` and `TIGHT_CAP` below. Anything past the cap becomes one
 * `(other · N more)` row rather than vanishing, so the visible rows plus that
 * one still add up to the total — a tail that disappears is an afternoon
 * somebody spends on the difference.
 *
 * ## When this runs
 *
 * `pnpm analytics:roll` runs it deliberately and is what belongs in a
 * scheduler. `/api/hit` also runs it after the response, at most once an hour
 * per process, because a maintenance pass that only ever runs by hand is a
 * pass that is missing the first time somebody needs the history — which is
 * the lesson `seed:topics` and `seed:cite` taught when they were left out of
 * the `db:reset` chain and the only symptom was fewer guides than last time.
 *
 * And `ensureDayRolled` runs when the analytics view is opened, so today is
 * never more than a few minutes stale on the screen somebody is watching.
 */

type Row = Record<string, unknown>
export type SqlClient = {
  execute: (args: { sql: string; args: unknown[] }) => Promise<{ rows: Row[] }>
}

const sqlOf = (payload: Payload): SqlClient => {
  const found = (payload.db as unknown as { client?: SqlClient }).client
  if (!found?.execute) throw new Error('the database adapter exposes no SQL client')
  return found
}

const num = (value: unknown): number => (typeof value === 'number' ? value : Number(value ?? 0))
const str = (value: unknown): string => (value === null || value === undefined ? '' : String(value))

/**
 * How many distinct values of one dimension are kept per day before the rest
 * becomes one `(other)` row.
 *
 * Two numbers, because the two risks are different.
 *
 * `path` is bounded by the site itself - about 1,930 real pages - so the
 * general cap is set above that and effectively never fires for it. Capping
 * pages at a couple of hundred would throw away the long tail, and the long
 * tail of a wiki is most of a wiki: the question "which of the thin pages is
 * anybody actually reading" is one of the few this data can answer, and a cap
 * would answer it wrongly and silently.
 *
 * `source` and `campaign` are supplied by whoever links to us, so their
 * cardinality has no bound at all - referrer spam is a real thing and it would
 * otherwise write a rollup row per forged host per day, forever. Those are
 * capped tightly.
 *
 * The safety cap still exists for everything else because a path *can* be
 * unbounded in one case: a scanner walking made-up URLs. Those arrive as 404s
 * with a bot rule and are rolled under `bot` rather than under `path`, but a
 * scanner with a convincing user-agent would not be, and one day of that
 * should cost one `(other)` row rather than fifty thousand.
 */
const VALUE_CAP = 2_000
const TIGHT_CAP = 250

/** The dimensions whose tail has no bound but whoever is linking to us. */
const CAPPED = new Set(['source', 'campaign'])

const DAY_MS = 86_400_000

const nextDay = (day: string): string =>
  new Date(Date.parse(`${day}T00:00:00.000Z`) + DAY_MS).toISOString().slice(0, 10)

type Tally = { dim: string; value: string; views: number; readers: number }

/**
 * Everything worth keeping about one UTC day.
 *
 * The bounds are ISO strings compared as text, which works because Payload
 * stores dates as `YYYY-MM-DDTHH:MM:SS.sssZ` — fixed width, UTC, and therefore
 * lexicographically ordered. It is also why the range can use the index on
 * `created_at` rather than a function of it.
 */
const tallyDay = async (sql: SqlClient, day: string): Promise<Tally[]> => {
  const from = `${day}T00:00:00.000Z`
  const to = `${nextDay(day)}T00:00:00.000Z`
  const bounds = [from, to]
  const readers = `count(*) as views, count(distinct visitor) as readers`
  const tallies: Tally[] = []

  const totals = await sql.execute({
    sql: `select ${readers} from analytics_events where bot_rule is null and created_at >= ? and created_at < ?`,
    args: bounds,
  })
  tallies.push({
    dim: 'total',
    value: '',
    views: num(totals.rows[0]?.views),
    readers: num(totals.rows[0]?.readers),
  })

  for (const dimension of DIMENSIONS) {
    const result = await sql.execute({
      /* The column name comes from the DIMENSIONS table and is never a caller's
         string — the same guard, for the same reason, as in query.ts. */
      sql: `select coalesce("${dimension.column}", '') as value, ${readers} from analytics_events where bot_rule is null and created_at >= ? and created_at < ? group by 1 order by views desc`,
      args: bounds,
    })

    const rows = result.rows.map((row) => ({
      value: str(row.value),
      views: num(row.views),
      readers: num(row.readers),
    }))

    const cap = CAPPED.has(dimension.id) ? TIGHT_CAP : VALUE_CAP
    for (const row of rows.slice(0, cap)) tallies.push({ dim: dimension.id, ...row })

    const tail = rows.slice(cap)
    if (tail.length > 0) {
      tallies.push({
        dim: dimension.id,
        // Named rather than dropped. A tail that vanishes makes the visible
        // rows add up to less than the total, and somebody eventually spends an
        // afternoon on the difference.
        value: `(other · ${tail.length.toLocaleString('en-GB')} more)`,
        views: tail.reduce((sum, row) => sum + row.views, 0),
        readers: tail.reduce((sum, row) => sum + row.readers, 0),
      })
    }
  }

  const bots = await sql.execute({
    sql: `select coalesce(bot_rule, '') as value, ${readers} from analytics_events where bot_rule is not null and created_at >= ? and created_at < ? group by 1 order by views desc`,
    args: bounds,
  })
  for (const row of bots.rows) {
    tallies.push({
      dim: 'bot',
      value: str(row.value),
      views: num(row.views),
      readers: num(row.readers),
    })
  }

  return tallies
}

/** Rewrite one day's rollups. See the note above on why this deletes first. */
export const rollDay = async (sql: SqlClient, day: string): Promise<number> => {
  const tallies = await tallyDay(sql, day)
  await sql.execute({ sql: `delete from analytics_daily where day = ?`, args: [day] })
  if (tallies.length === 0) return 0

  /* Batched, because one statement per row is a thousand round trips for a day
     that fits comfortably in one. 200 rows a statement keeps the bound
     parameter count well under SQLite's limit with room to spare. */
  const CHUNK = 200
  for (let index = 0; index < tallies.length; index += CHUNK) {
    const slice = tallies.slice(index, index + CHUNK)
    const placeholders = slice.map(() => '(?, ?, ?, ?, ?)').join(', ')
    await sql.execute({
      sql: `insert into analytics_daily (day, dim, value, views, readers) values ${placeholders}`,
      args: slice.flatMap((tally) => [day, tally.dim, tally.value, tally.views, tally.readers]),
    })
  }
  return tallies.length
}

export type MaintenanceReport = {
  daysRolled: string[]
  rollupRows: number
  rawDeleted: number
  ms: number
}

/**
 * Roll every day that needs it, then delete what is past retention.
 *
 * ## Which days need it, and the watermark that does not work
 *
 * The obvious rule is "start from the newest rolled day". It is wrong here,
 * and it failed the first time it was measured: `ensureDayRolled` writes
 * *today's* rollup whenever somebody opens the analytics screen, which makes
 * the newest rolled day today, which makes a watermark-based pass believe
 * everything before today is already done. Sixty-one days of history would
 * have been deleted at the retention boundary having never been summarised —
 * silently, with the pass reporting success, which is this repository's whole
 * catalogue of bugs in one sentence.
 *
 * So the pass asks both questions instead: which days have raw rows, and which
 * days already have rollups. It rolls the difference, plus today, which is
 * always re-rolled because it is still happening.
 *
 * ## Order
 *
 * Deleting raw rows happens last and only for days strictly older than the
 * retention boundary, so a failure halfway through can lose a rollup — which
 * the next run recomputes from rows that are still there — and can never lose
 * a row that has not been summarised.
 */
export const runMaintenance = async (payload: Payload, now = new Date()): Promise<MaintenanceReport> => {
  const started = Date.now()
  const sql = sqlOf(payload)

  const today = dayKey(now)

  /*
    Every day that has page views. `substr` of an indexed column is answered
    from the index without touching a row — 22ms over 300,000 rows when this
    was measured — which is what makes asking the question outright cheaper
    than keeping a watermark that can be wrong.
  */
  const rawDays = await sql.execute({
    sql: `select distinct substr(created_at, 1, 10) as day from analytics_events order by 1`,
    args: [],
  })
  if (rawDays.rows.length === 0) {
    return { daysRolled: [], rollupRows: 0, rawDeleted: 0, ms: Date.now() - started }
  }

  const done = await sql.execute({ sql: `select distinct day from analytics_daily`, args: [] })
  const alreadyRolled = new Set(done.rows.map((row) => str(row.day)))

  const wanted = rawDays.rows
    .map((row) => str(row.day))
    .filter((day) => day === today || !alreadyRolled.has(day))
    /* Bounded rather than open. A row with an impossible date — a clock that
       jumped, a clumsy import — would otherwise make this pass unbounded. */
    .slice(0, RAW_RETENTION_DAYS + 2)

  const daysRolled: string[] = []
  let rollupRows = 0
  for (const day of wanted) {
    rollupRows += await rollDay(sql, day)
    daysRolled.push(day)
  }

  const boundary = new Date(now.getTime() - RAW_RETENTION_DAYS * DAY_MS).toISOString()
  const before = await sql.execute({
    sql: `select count(*) as rows from analytics_events where created_at < ?`,
    args: [boundary],
  })
  const rawDeleted = num(before.rows[0]?.rows)
  if (rawDeleted > 0) {
    await sql.execute({ sql: `delete from analytics_events where created_at < ?`, args: [boundary] })
  }

  return { daysRolled, rollupRows, rawDeleted, ms: Date.now() - started }
}

/* -------------------------------------------------------------------------- */
/* Keeping today current for whoever is watching                              */
/* -------------------------------------------------------------------------- */

const freshness = new Map<string, number>()
let rolling: Promise<void> | null = null

/**
 * Re-roll today if its rollup is older than `maxAgeMs`.
 *
 * The long windows read rollups, and the last day in every one of them is
 * today — which is still happening. Without this, opening "last 30 days" would
 * show a figure that stopped moving whenever the hourly pass last ran, and an
 * owner watching a launch would reload and reload and see the same number.
 *
 * The cost is one day's aggregates, which is one thirtieth of what reading the
 * window from raw rows would have cost, paid at most once per `maxAgeMs`
 * rather than on every render.
 *
 * Failures are swallowed on purpose. A stale rollup is a number a few minutes
 * behind; a thrown error here would be the whole screen, and the screen is the
 * point. The report says when the rollups were last written, so "behind" is
 * visible rather than silent.
 */
export const ensureDayRolled = async (
  sql: SqlClient,
  day: string,
  maxAgeMs: number,
): Promise<void> => {
  const last = freshness.get(day) ?? 0
  if (Date.now() - last < maxAgeMs) return
  if (rolling) return rolling

  rolling = (async () => {
    try {
      await rollDay(sql, day)
      freshness.set(day, Date.now())
      /* One key per day, and days do not accumulate quickly — but a process
         alive for a year would otherwise hold 365 of them for no reason. */
      if (freshness.size > 5) {
        for (const key of [...freshness.keys()].sort().slice(0, freshness.size - 5)) {
          freshness.delete(key)
        }
      }
    } catch (error) {
      console.error('analytics: could not roll today', error)
    } finally {
      rolling = null
    }
  })()

  return rolling
}

/* -------------------------------------------------------------------------- */
/* The hourly kick from /api/hit                                              */
/* -------------------------------------------------------------------------- */

let lastRun = 0
let inflight: Promise<void> | null = null
const HOURLY = 3_600_000

/**
 * Run the pass at most once an hour per process, and never twice at once.
 *
 * In memory, so it resets on deploy and two instances behind a load balancer
 * mean two clocks — which costs nothing here, because the pass is idempotent
 * and two of them produce the same rollups. Said rather than implied, the same
 * way the rate limiter's limits are.
 */
export const maintainAnalytics = async (): Promise<void> => {
  const now = Date.now()
  if (now - lastRun < HOURLY) return
  if (inflight) return inflight

  lastRun = now
  inflight = (async () => {
    try {
      const payload = await client()
      const report = await runMaintenance(payload)
      if (report.daysRolled.length > 0 || report.rawDeleted > 0) {
        payload.logger.info(
          `analytics: rolled ${report.daysRolled.length} day(s) into ${report.rollupRows} rows, deleted ${report.rawDeleted} raw row(s) past ${RAW_RETENTION_DAYS} days, ${report.ms}ms`,
        )
      }
    } catch (error) {
      /*
        Logged, never thrown. This runs after the response to a reader's page
        view; a failure here must not become anything the reader can see, and
        the next hit an hour from now tries again.
      */
      console.error('analytics: maintenance pass failed', error)
    } finally {
      inflight = null
    }
  })()

  return inflight
}

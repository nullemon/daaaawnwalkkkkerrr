import type { Payload } from 'payload'
import { readReport, type Filter, type Report } from '@/lib/analytics/query'

/**
 * One reading of the analytics, cached for a moment and never thrown.
 *
 * ## Why it cannot throw
 *
 * The same reason `audit-snapshot.ts` cannot: an admin panel whose owner
 * cannot use it because one screen's query failed is a worse outcome than a
 * screen that says it could not read the numbers. So the failure is a value,
 * it carries the message, and the view renders it.
 *
 * What it must never do is fall back to zero. "Nobody read the site this week"
 * because a `GROUP BY` failed is exactly the shape of every bug in this
 * project's gotchas list — nothing errors, the figure looks plausible, and the
 * wrong one is the reassuring one.
 *
 * ## Why it is cached at all, and only briefly
 *
 * The pass is fifteen aggregate queries over one window. That is cheap and it
 * is not free, and the admin re-renders this view on every filter click — a
 * reader adding three filters would otherwise pay for the same window four
 * times. Twenty seconds covers a burst of clicking and is short enough that
 * the owner watching a launch sees new numbers when they reload, which is the
 * whole reason anybody opens a 1-hour window.
 *
 * The key includes the filters, because two different questions are two
 * different answers and a cache that ignored them would be the "silently
 * returns the unfiltered number" failure the query layer takes such care to
 * avoid.
 */

export type AnalyticsFailure = { ok: false; message: string }
export type AnalyticsReading = { ok: true; report: Report }
export type AnalyticsResult = AnalyticsFailure | AnalyticsReading

const TTL_MS = 20_000

const cache = new Map<string, { at: number; reading: AnalyticsReading }>()
const inflight = new Map<string, Promise<AnalyticsResult>>()

const keyFor = (window: string, filters: Filter[]): string =>
  `${window}|${filters.map((f) => `${f.dim}=${f.value}`).sort().join('&')}`

export const readAnalytics = async (
  payload: Payload,
  window: string,
  filters: Filter[],
): Promise<AnalyticsResult> => {
  const key = keyFor(window, filters)

  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.reading

  const running = inflight.get(key)
  if (running) return running

  const promise = (async (): Promise<AnalyticsResult> => {
    try {
      const report = await readReport(payload, { window, filters })
      const reading: AnalyticsReading = { ok: true, report }
      /*
        Bounded. The key includes a filter value the caller supplies, so an
        unbounded map here would be a memory leak keyed by something a person
        with an admin login controls the supply of. Twenty entries is more
        windows and filter combinations than anybody holds in their head.
      */
      if (cache.size > 20) cache.clear()
      cache.set(key, { at: Date.now(), reading })
      return reading
    } catch (error) {
      /*
        Deliberately not cached — the same decision audit-snapshot.ts makes. A
        failure that sticks for twenty seconds turns one bad query into a
        screen that stays broken after the cause is gone, with no way to ask it
        to try again.
      */
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'the aggregate queries did not complete',
      }
    } finally {
      inflight.delete(key)
    }
  })()

  inflight.set(key, promise)
  return promise
}

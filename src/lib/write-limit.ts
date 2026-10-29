import { APIError } from 'payload'
import { clientIp } from './analytics/request'

/**
 * A ceiling on the public write endpoints Payload exposes whether or not a
 * form links to them.
 *
 * Four collections accept a `create` from anybody — `comments`, `corrections`,
 * `requests` and `players` — and `players` also answers `forgot-password`,
 * which sends an email per call. Each is a REST route a script can hit in a
 * loop. The moderation screen, the pending status and the email digest all
 * hold up under that, but they hold up by filling: a queue of ten thousand
 * comments is still a queue somebody has to clear, and a reset mail per
 * request is a mail relay somebody else gets to rate-limit for us.
 *
 * This is the same fixed window `/api/hit` and `/api/rate` keep, for the same
 * reasons stated there, and shared across those four collections so that the
 * rule exists once. The per-address allowance is deliberately generous — a
 * reader filing three corrections in a minute is a good reader — and the
 * process ceiling is the half that does the work against a forged address.
 *
 * In memory, so it resets on deploy and is per process. A floor on protection
 * rather than a guarantee, and documented as such rather than implied.
 */

const WINDOW_MS = 60_000

type Window = { count: number; resetAt: number }

export type WriteLimit = {
  /** Per address, per minute. */
  perAddress: number
  /** For the whole process, per minute. */
  perProcess: number
}

export const DEFAULT_WRITE_LIMIT: WriteLimit = { perAddress: 10, perProcess: 600 }

type Limiter = {
  /** True if the request should be refused. */
  limited: (address: string, now?: number) => boolean
}

/** One limiter, with its own buckets; exported so a test can build a fresh one. */
export const createLimiter = (limit: WriteLimit = DEFAULT_WRITE_LIMIT): Limiter => {
  const buckets = new Map<string, Window>()
  let processWindow: Window = { count: 0, resetAt: 0 }

  return {
    limited: (address, now = Date.now()) => {
      if (now >= processWindow.resetAt) processWindow = { count: 0, resetAt: now + WINDOW_MS }
      if (processWindow.count >= limit.perProcess) return true

      // Sweep before growing: the keys are attacker-supplied, so an unbounded
      // map here would make the limiter the denial of service.
      if (buckets.size > 10_000) {
        for (const [key, window] of buckets) if (now >= window.resetAt) buckets.delete(key)
      }

      const current = buckets.get(address)
      if (!current || now >= current.resetAt) {
        buckets.set(address, { count: 1, resetAt: now + WINDOW_MS })
        processWindow.count += 1
        return false
      }
      if (current.count >= limit.perAddress) return true
      current.count += 1
      processWindow.count += 1
      return false
    },
  }
}

/** The operations this guards: anonymous writes, and the one that sends mail. */
const GUARDED = new Set(['create', 'forgotPassword'])

type HookArg = {
  operation: string
  req: { headers: { get: (name: string) => string | null }; user?: unknown }
}

/**
 * A `beforeOperation` hook for a collection the public may write to.
 *
 * Signed-in editors are never limited — they are the ones clearing the queue,
 * and an editor is already behind a password and the login attempt limit.
 * Everybody else is keyed by address and refused with a 429 past the window,
 * which Payload's REST layer returns as such and the forms on the site show
 * as their ordinary failure message.
 */
export const limitPublicWrites = (limit: WriteLimit = DEFAULT_WRITE_LIMIT, limiter = createLimiter(limit)) =>
  async ({ operation, req }: HookArg): Promise<void> => {
    if (!GUARDED.has(operation)) return
    if ((req.user as { collection?: string } | null | undefined)?.collection === 'users') return
    const address = clientIp((name) => req.headers.get(name))
    if (limiter.limited(address)) {
      throw new APIError('Too many submissions from this address. Please wait a minute and try again.', 429)
    }
  }

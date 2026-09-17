import { getPayload } from 'payload'
import config from '@payload-config'
import { auditBlockedGaps, auditNetwork, type AuditSnapshot, type Finding } from '@/lib/audit'

/**
 * One audit pass, shared by the nav badges and the dashboard.
 *
 * ## Why this is cached at all
 *
 * The pass is 190 count queries — 128 of them the per-wiki record totals the
 * dashboard table has always needed — and it runs about 75ms warm on the local
 * file. That is fine once per page and wrong twice: the nav renders on *every*
 * admin screen, and the dashboard renders alongside it, so an uncached pass
 * would run twice on the one screen that needs it and once more on every
 * screen that does not.
 *
 * Two layers, because they catch different things:
 *
 *   - `inflight` collapses the nav and the dashboard asking at the same
 *     moment into one pass. They are separate server components in one
 *     request, so nothing above them dedupes.
 *   - `cached` covers the next thirty seconds, which is what makes clicking
 *     around the admin cost nothing.
 *
 * Thirty seconds and not five minutes because these numbers are what the
 * owner just changed something to fix. A badge that still says 36 after the
 * thirty-sixth contributor was filled in is a badge that taught them to
 * distrust it; a reload a moment later tells the truth.
 *
 * ## Why it cannot throw
 *
 * An admin panel whose owner cannot log in because a dashboard widget's count
 * query failed is a worse outcome than a missing badge, by a long way. So the
 * failure is a value, carrying the message, and every caller renders it. What
 * it must never do is fall back to zero: "nothing needs you" because a query
 * threw is the exact shape of every bug in this project's gotchas list.
 */

export type AuditFailure = { ok: false; message: string }
export type AuditReading = { ok: true; snapshot: AuditSnapshot; blocked: Finding[] }
export type AuditResult = AuditReading | AuditFailure

const TTL_MS = 30_000

let cached: { at: number; reading: AuditReading } | null = null
let inflight: Promise<AuditResult> | null = null

const compute = async (): Promise<AuditResult> => {
  try {
    const payload = await getPayload({ config })
    const [snapshot, blocked] = await Promise.all([
      auditNetwork(payload),
      auditBlockedGaps(payload),
    ])
    const reading: AuditReading = { ok: true, snapshot, blocked }
    cached = { at: Date.now(), reading }
    return reading
  } catch (error) {
    /*
      Deliberately not cached. A failure that sticks for thirty seconds turns
      one bad query into a dashboard that stays broken after the cause is
      gone, and the owner has no way to ask it to try again.
    */
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'the count queries did not complete',
    }
  }
}

export const readAudit = async (): Promise<AuditResult> => {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.reading
  if (!inflight) {
    inflight = compute().finally(() => {
      inflight = null
    })
  }
  return inflight
}

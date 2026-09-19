import { describe, expect, it } from 'vitest'
import { CLAIM_TTL_MS, MAX_CODE_ATTEMPTS, MINUTE } from './policy'
import {
  SESSION_STATUSES,
  TERMINAL,
  isTerminal,
  readSession,
  recordCodeFailure,
  statusReason,
  timeLeft,
  type SessionRow,
} from './session'

const NOW = Date.parse('2026-09-18T12:00:00.000Z')
const at = (offsetMs: number) => new Date(NOW + offsetMs).toISOString()

/**
 * Both directions on every state, which is the point of the module being pure.
 *
 * A session is a credential for a live public site, so "it opens when it
 * should" is half a test: the other half is that each individual failure
 * closes it, on its own, with the others satisfied.
 */

const openSession: SessionRow = {
  status: 'open',
  expiresAt: at(30 * MINUTE),
  lastUsedAt: at(-MINUTE),
  idleMs: 15 * MINUTE,
}

describe('an open session', () => {
  it('is usable when everything is in order', () => {
    const reading = readSession(openSession, NOW)
    expect(reading.usable).toBe(true)
    expect(reading.status).toBe('open')
    expect(reading.becomes).toBeNull()
  })

  it('is closed by its expiry alone', () => {
    const reading = readSession({ ...openSession, expiresAt: at(-1) }, NOW)
    expect(reading.usable).toBe(false)
    expect(reading.becomes).toBe('expired')
  })

  it('is closed by the idle timeout alone', () => {
    const reading = readSession({ ...openSession, lastUsedAt: at(-16 * MINUTE) }, NOW)
    expect(reading.usable).toBe(false)
    expect(reading.becomes).toBe('expired')
    expect(reading.reason).toMatch(/15 minutes/)
  })

  it('is closed by a missing expiry rather than living for ever', () => {
    // Absence is not a permissive default — the same rule as `time.known:
    // false`. A row that reached `open` with no deadline is a bug, and the
    // safe reading of a bug in a credential is that it is dead.
    expect(readSession({ ...openSession, expiresAt: null }, NOW).usable).toBe(false)
    expect(readSession({ ...openSession, expiresAt: 'not a date' }, NOW).usable).toBe(false)
  })

  it('survives having never been used, when no idle clock has started', () => {
    const reading = readSession({ ...openSession, lastUsedAt: null }, NOW)
    expect(reading.usable).toBe(true)
  })

  it('ignores an idle timeout of zero rather than treating it as instant', () => {
    const reading = readSession({ ...openSession, idleMs: 0, lastUsedAt: at(-MINUTE) }, NOW)
    expect(reading.usable).toBe(true)
  })
})

describe('a pending session', () => {
  const pending: SessionRow = { status: 'pending', pairingExpiresAt: at(5 * MINUTE) }

  it('is never usable, however fresh', () => {
    const reading = readSession(pending, NOW)
    expect(reading.usable).toBe(false)
    expect(reading.status).toBe('pending')
    expect(reading.becomes).toBeNull()
  })

  it('expires when nobody approves it', () => {
    const reading = readSession({ ...pending, pairingExpiresAt: at(-1) }, NOW)
    expect(reading.status).toBe('expired')
    expect(reading.becomes).toBe('expired')
  })
})

describe('an approved session', () => {
  it('may be collected inside the claim window', () => {
    const reading = readSession({ status: 'approved', approvedAt: at(-MINUTE) }, NOW)
    expect(reading.status).toBe('approved')
    expect(reading.usable).toBe(false)
    expect(reading.becomes).toBeNull()
  })

  it('expires if the terminal never collects it', () => {
    const reading = readSession({ status: 'approved', approvedAt: at(-CLAIM_TTL_MS - 1) }, NOW)
    expect(reading.status).toBe('expired')
    expect(reading.becomes).toBe('expired')
  })

  it('expires if it somehow has no approval time', () => {
    expect(readSession({ status: 'approved' }, NOW).status).toBe('expired')
  })
})

describe('terminal states', () => {
  it('are never usable and never transition', () => {
    for (const status of TERMINAL) {
      const reading = readSession({ status, expiresAt: at(MINUTE) }, NOW)
      expect(reading.usable, status).toBe(false)
      expect(reading.becomes, status).toBeNull()
      expect(reading.status, status).toBe(status)
      expect(reading.reason.length, status).toBeGreaterThan(0)
    }
  })

  it('include revoked, so a revoked session cannot be re-read as open', () => {
    // The one property revocation has to have: a token that outlives the
    // decision to end it is not a revocation.
    expect(isTerminal('revoked')).toBe(true)
    expect(readSession({ status: 'revoked', expiresAt: at(60 * MINUTE) }, NOW).usable).toBe(false)
  })

  it('leave every status with a sentence somebody can act on', () => {
    for (const status of SESSION_STATUSES) expect(statusReason(status).length).toBeGreaterThan(10)
  })
})

describe('wrong codes', () => {
  it('count down and then lock, permanently', () => {
    for (let already = 0; already < MAX_CODE_ATTEMPTS - 1; already += 1) {
      const attempt = recordCodeFailure(already)
      expect(attempt.ok).toBe(false)
      if (attempt.ok === false) {
        expect(attempt.locked).toBe(false)
        expect(attempt.attemptsLeft).toBe(MAX_CODE_ATTEMPTS - already - 1)
      }
    }
    const last = recordCodeFailure(MAX_CODE_ATTEMPTS - 1)
    expect(last.ok).toBe(false)
    if (last.ok === false) {
      expect(last.locked).toBe(true)
      expect(last.attemptsLeft).toBe(0)
    }
  })

  it('stay locked past the limit rather than wrapping round to allowed', () => {
    const past = recordCodeFailure(MAX_CODE_ATTEMPTS + 10)
    expect(past.ok).toBe(false)
    if (past.ok === false) expect(past.locked).toBe(true)
  })
})

describe('the countdown on the screen', () => {
  it('reads in seconds, then minutes, then says expired', () => {
    expect(timeLeft(at(30_000), NOW)).toBe('30 seconds')
    expect(timeLeft(at(4 * MINUTE), NOW)).toBe('4 minutes')
    expect(timeLeft(at(-1), NOW)).toBe('expired')
  })

  it('says so when there is no deadline, rather than rendering a blank', () => {
    expect(timeLeft(null, NOW)).toMatch(/no deadline/)
  })
})

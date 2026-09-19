import { CLAIM_TTL_MS, MAX_CODE_ATTEMPTS } from './policy'

/**
 * What a session row means at a given moment, decided without a database.
 *
 * Everything about a remote session that could go wrong is a clock comparison
 * or a status transition, and both are the kind of logic that is correct in
 * the branch somebody tested and wrong in the one they did not. So it is a
 * pure function over a plain object, the routes call it and render its answer,
 * and the unit test walks every state.
 *
 * The shape below is the subset of the `remote-sessions` row this needs. It is
 * deliberately not the generated Payload type: this module is imported by the
 * admin view, by three routes and by the test, and coupling it to a type that
 * is rewritten on every schema change would mean a failing test every time an
 * unrelated field moved.
 */

export const SESSION_STATUSES = [
  'pending',
  'approved',
  'open',
  'denied',
  'locked',
  'expired',
  'revoked',
  'closed',
] as const

export type SessionStatus = (typeof SESSION_STATUSES)[number]

/**
 * A status nothing transitions out of.
 *
 * A session that could be re-opened would be a token that outlives the
 * decision to end it, which is the one property revocation has to have.
 */
export const TERMINAL: readonly SessionStatus[] = ['denied', 'locked', 'expired', 'revoked', 'closed']

export const isTerminal = (status: SessionStatus): boolean => TERMINAL.includes(status)

export type SessionRow = {
  status: SessionStatus
  /** ISO string. When the pending request stops being approvable. */
  pairingExpiresAt?: string | null
  /** ISO string. Set at approval; the deadline for collecting the token. */
  approvedAt?: string | null
  /** ISO string. When the open session dies however busy it is. */
  expiresAt?: string | null
  /** ISO string. Last operation. Absent means the token was never used. */
  lastUsedAt?: string | null
  /** Milliseconds of quiet before an open session closes itself. */
  idleMs?: number | null
  codeAttempts?: number | null
}

/**
 * The reading: whether the session may be used right now, and if not, why in a
 * sentence somebody can act on.
 *
 * `becomes` is the status the row should be moved to if this reading is acted
 * on. It exists so that expiry is written down rather than merely observed —
 * a session that reads as expired on every request but stays `open` in the
 * database is a session the admin screen reports as live for ever.
 */
export type Reading = {
  usable: boolean
  status: SessionStatus
  becomes: SessionStatus | null
  reason: string
}

const ms = (value: string | null | undefined): number | null => {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

/**
 * A missing deadline is treated as expired, not as forever.
 *
 * This is the same rule as `time.known: false` elsewhere in this project:
 * absence is not a permissive default. A row that somehow reached `open` with
 * no `expiresAt` is a bug, and the safe reading of a bug in a credential is
 * that the credential is dead.
 */
const past = (deadline: number | null, now: number): boolean => deadline === null || now >= deadline

export const readSession = (row: SessionRow, now: number = Date.now()): Reading => {
  const status = row.status

  if (isTerminal(status)) {
    return {
      usable: false,
      status,
      becomes: null,
      reason: REASON[status],
    }
  }

  if (status === 'pending') {
    if (past(ms(row.pairingExpiresAt), now)) {
      return {
        usable: false,
        status: 'expired',
        becomes: 'expired',
        reason: 'Nobody approved this within ten minutes. Run `pnpm remote connect` again.',
      }
    }
    return { usable: false, status, becomes: null, reason: REASON.pending }
  }

  if (status === 'approved') {
    const claimBy = ms(row.approvedAt)
    if (claimBy === null || now >= claimBy + CLAIM_TTL_MS) {
      return {
        usable: false,
        status: 'expired',
        becomes: 'expired',
        reason: 'Approved, but the terminal never collected it. Run `pnpm remote connect` again.',
      }
    }
    return { usable: false, status, becomes: null, reason: REASON.approved }
  }

  // status === 'open'
  if (past(ms(row.expiresAt), now)) {
    return {
      usable: false,
      status: 'expired',
      becomes: 'expired',
      reason: 'The session reached its expiry. Run `pnpm remote connect` again.',
    }
  }

  const idle = row.idleMs ?? null
  const last = ms(row.lastUsedAt)
  if (idle !== null && idle > 0 && last !== null && now >= last + idle) {
    return {
      usable: false,
      status: 'expired',
      becomes: 'expired',
      reason: `Nothing happened on this session for ${Math.round(idle / 60_000)} minutes, so it closed.`,
    }
  }

  return { usable: true, status: 'open', becomes: null, reason: REASON.open }
}

const REASON: Record<SessionStatus, string> = {
  pending: 'Waiting for approval in the admin.',
  approved: 'Approved in the admin. The terminal has not collected its token yet.',
  open: 'This session is open and may be used.',
  denied: 'This session was refused in the admin.',
  locked: `The code was typed wrong ${MAX_CODE_ATTEMPTS} times, so this session is locked. Start a new one.`,
  expired: 'This session has expired. Run `pnpm remote connect` again.',
  revoked: 'This session was revoked in the admin, or its device was disabled.',
  closed: 'This session was closed from the terminal.',
}

export const statusReason = (status: SessionStatus): string => REASON[status]

/* -------------------------------------------------------------------------- */
/* Approval                                                                   */
/* -------------------------------------------------------------------------- */

export type ApprovalAttempt =
  | { ok: true }
  | { ok: false; locked: boolean; attemptsLeft: number; reason: string }

/**
 * What a wrong code does.
 *
 * The code is displayed on the very screen the box is on, so this is not the
 * defence that matters — but it is the only place in the whole design where a
 * code is ever submitted, and therefore the only place a guessing attack could
 * exist. Leaving it unlimited would be leaving a hole for a later change to
 * fall into, which is how most of the entries in this project's gotchas list
 * happened.
 *
 * A locked session is terminal. It is not unlocked by waiting, because the
 * cost of starting again is one command and the cost of a lockout that lifts
 * itself is that it was never a lockout.
 */
export const recordCodeFailure = (attemptsSoFar: number): ApprovalAttempt => {
  const attempts = attemptsSoFar + 1
  const left = MAX_CODE_ATTEMPTS - attempts
  if (left <= 0) {
    return {
      ok: false,
      locked: true,
      attemptsLeft: 0,
      reason: REASON.locked,
    }
  }
  return {
    ok: false,
    locked: false,
    attemptsLeft: left,
    reason: `That is not the code on this session. ${left} attempt${left === 1 ? '' : 's'} left before it locks.`,
  }
}

/* -------------------------------------------------------------------------- */
/* Presentation                                                               */
/* -------------------------------------------------------------------------- */

/** "4 minutes", "38 seconds", "expired" — for the admin's countdown. */
export const timeLeft = (deadline: string | null | undefined, now: number = Date.now()): string => {
  const at = ms(deadline)
  if (at === null) return 'no deadline recorded'
  const left = at - now
  if (left <= 0) return 'expired'
  if (left < 90_000) return `${Math.round(left / 1000)} seconds`
  return `${Math.round(left / 60_000)} minutes`
}


/**
 * What a remote session is allowed to be, allowed to touch, and how long it
 * lasts. No imports, no I/O, so every rule in here is a unit test away.
 *
 * The important half of this file is the part that says no. A session that can
 * edit `users` can create an editor account; one that can edit `remote-devices`
 * can approve its own next device; one that can edit `remote-log` can delete
 * the record of what it did. None of those is a setting, because a setting
 * that could turn them off would be the hole — see `docs/REMOTE.md`.
 */

/* -------------------------------------------------------------------------- */
/* Timings                                                                    */
/* -------------------------------------------------------------------------- */

export const MINUTE = 60_000

/** How long a pairing request waits for a human before it expires. */
export const PAIRING_TTL_MS = 10 * MINUTE

/**
 * How long an approved session may sit before the CLI collects its token.
 *
 * Separate from the pairing window because it is a different risk: a pending
 * session grants nothing, an approved one is a decision waiting to be picked
 * up. If the terminal that asked has gone away, the approval should not still
 * be collectable an hour later.
 */
export const CLAIM_TTL_MS = 10 * MINUTE

/** Default session lifetime, and the ceiling the owner cannot raise past. */
export const DEFAULT_SESSION_MS = 60 * MINUTE
export const MAX_SESSION_MS = 12 * 60 * MINUTE

/** A session with nothing happening on it closes itself. */
export const DEFAULT_IDLE_MS = 15 * MINUTE

/** How far a signed request's timestamp may be from the server's clock. */
export const CLOCK_SKEW_MS = 2 * MINUTE

/** Wrong codes typed into the admin's confirm box before the session locks. */
export const MAX_CODE_ATTEMPTS = 5

/**
 * Clamp a lifetime the owner typed into the admin.
 *
 * A blank field is the default rather than zero — "unknown is not zero" is the
 * rule this project states about segment costs, and a lifetime of zero minutes
 * would render the feature broken with nothing saying why.
 */
export const sessionLifetimeMs = (minutes: number | null | undefined): number => {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) {
    return DEFAULT_SESSION_MS
  }
  return Math.min(Math.round(minutes) * MINUTE, MAX_SESSION_MS)
}

export const idleTimeoutMs = (minutes: number | null | undefined): number => {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) {
    return DEFAULT_IDLE_MS
  }
  return Math.min(Math.round(minutes) * MINUTE, MAX_SESSION_MS)
}

/* -------------------------------------------------------------------------- */
/* Capabilities                                                               */
/* -------------------------------------------------------------------------- */

/**
 * What one session may do, chosen per session at the moment it is approved.
 *
 * This replaced a single three-step scope, and the reason is the owner's:
 * "I can select what you can add like new pages or delete and perms in each
 * session". A ladder cannot express that. "Create pages, but never delete" is
 * two rungs apart on a ladder and one tick apart here, and a session scoped to
 * the job in hand is the difference between a credential that can do what is
 * needed and one that can do everything above it as well.
 *
 * Five, deliberately coarse. A capability per collection would be a permission
 * system, and this project already has one — the approving editor's own
 * account, which every operation runs as. These are the verbs; who may point
 * them at which wiki is still `isEditorForGame`'s answer.
 *
 * `read` is one capability rather than `list` and `get` separately: a session
 * that may list records may fetch the ones it listed, and splitting them would
 * be a box on the approval screen nobody could give a reason for ticking one
 * way.
 */
export const CAPABILITIES = ['read', 'create', 'update', 'publish', 'delete'] as const
export type Capability = (typeof CAPABILITIES)[number]

export const CAPABILITY_LABEL: Record<Capability, string> = {
  read: 'Read — list records and fetch one',
  create: 'Create — add records that did not exist',
  update: 'Update — change the fields of a record',
  publish: 'Publish — take a draft live',
  delete: 'Delete — remove a record. Cannot be undone from here',
}

/** The order the boxes are shown in, widening left to right. */
const RANK_OF: Record<Capability, number> = { read: 0, create: 1, update: 2, publish: 3, delete: 4 }

/*
  `whoami` and `close` are session operations rather than record ones: they name
  no collection, so the collection allow-list does not apply to them and the
  handler answers them before it looks for one. They need **no** capability,
  because ending your own session must never be the thing a narrow grant
  prevents — a session you cannot close is a credential you cannot put down,
  and a session that cannot say what it is allowed to do is one whose refusals
  nobody can explain.
*/
export const OPS = ['whoami', 'close', 'list', 'get', 'create', 'update', 'publish', 'delete'] as const
export type Op = (typeof OPS)[number]

const OP_CAPABILITY: Record<Op, Capability | null> = {
  whoami: null,
  close: null,
  list: 'read',
  get: 'read',
  create: 'create',
  update: 'update',
  publish: 'publish',
  delete: 'delete',
}

export const isOp = (value: unknown): value is Op =>
  typeof value === 'string' && (OPS as readonly string[]).includes(value)

export const isCapability = (value: unknown): value is Capability =>
  typeof value === 'string' && (CAPABILITIES as readonly string[]).includes(value)

/** Which capability an operation needs, or null for the two session verbs. */
export const capabilityFor = (op: Op): Capability | null => OP_CAPABILITY[op]

/** Canonical order, no duplicates. Two grants of the same set compare equal. */
export const orderCapabilities = (values: readonly Capability[]): Capability[] =>
  [...new Set(values)].sort((left, right) => RANK_OF[left] - RANK_OF[right])

/**
 * Read a capability list off the wire, keeping what is known and **naming**
 * what is not.
 *
 * The unknown half is returned rather than dropped, and the callers refuse on
 * it. That is the Antar 4 rule from CLAUDE.md pointed at ourselves: a filter
 * written to stop bad input throws away good input just as silently, and a CLI
 * that typed `--can creat,delete` and was quietly granted deletion alone would
 * be a narrower grant than either side intended with nothing saying so.
 */
export const parseCapabilities = (
  value: unknown,
): { capabilities: Capability[]; unknown: string[] } => {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : []
  const capabilities: Capability[] = []
  const unknown: string[] = []
  for (const entry of raw) {
    const name = typeof entry === 'string' ? entry.trim().toLowerCase() : ''
    if (!name) continue
    if (isCapability(name)) capabilities.push(name)
    else unknown.push(name.slice(0, 40))
  }
  return { capabilities: orderCapabilities(capabilities), unknown: [...new Set(unknown)] }
}

/**
 * Whether a session holding this grant may perform this operation.
 *
 * **Default-deny, and the default is what a missing grant means.** A session
 * row with no capabilities — one written before this field existed, one whose
 * column failed to read, one somebody edited — can do nothing but say who it
 * is and close itself. The alternative is a grant that widens when a value
 * goes missing, which is the shape of every privilege bug this project has a
 * note about.
 */
export const sessionCan = (granted: readonly Capability[] | null | undefined, op: Op): boolean => {
  const needed = OP_CAPABILITY[op]
  if (needed === null) return true
  if (!granted || granted.length === 0) return false
  return granted.includes(needed)
}

/* -------------------------------------------------------------------------- */
/* Presets                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Named bundles, for the terminal to ask with and the approval form to start
 * from. They are a **shorthand for a set of capabilities and nothing else** —
 * no check anywhere reads a preset, so there is exactly one thing that decides
 * whether an operation is allowed.
 */
export const SCOPES = ['read', 'write', 'full'] as const
export type Scope = (typeof SCOPES)[number]

export const SCOPE_LABEL: Record<Scope, string> = {
  read: 'Read only — list and fetch records, change nothing',
  write: 'Write — create, update and publish. No deletions',
  full: 'Full — write, and delete records',
}

const PRESET: Record<Scope, Capability[]> = {
  read: ['read'],
  write: ['read', 'create', 'update', 'publish'],
  full: ['read', 'create', 'update', 'publish', 'delete'],
}

export const isScope = (value: unknown): value is Scope =>
  typeof value === 'string' && (SCOPES as readonly string[]).includes(value)

export const capabilitiesForScope = (scope: Scope): Capability[] => [...PRESET[scope]]

/**
 * A grant, named — as one of the three presets if it happens to be one, and as
 * `custom` otherwise.
 *
 * For display only, in a table column where five capability names would not
 * fit. Anything that has to *decide* something reads the list.
 */
export const presetName = (granted: readonly Capability[]): Scope | 'custom' => {
  const ordered = orderCapabilities([...granted]).join(',')
  for (const scope of SCOPES) if (orderCapabilities(PRESET[scope]).join(',') === ordered) return scope
  return 'custom'
}

/**
 * The capabilities actually granted: the intersection of what the terminal
 * asked for and what the owner ticked.
 *
 * The narrower of the two on every axis, which is the same rule the old scope
 * ladder had and the reason it is kept. An approver who ticks `delete` on a
 * session that asked only to create does not get a deleting session — the
 * request field on the approval screen says what the terminal intends to do,
 * and quietly widening it would make that line a lie. A terminal that asked
 * for everything and was granted two boxes gets two.
 */
export const grantedCapabilities = (
  requested: readonly Capability[],
  approved: readonly Capability[],
): Capability[] => orderCapabilities(requested.filter((capability) => approved.includes(capability)))

/** "create, update and publish", or "nothing" — for a sentence, not a check. */
export const describeCapabilities = (granted: readonly Capability[]): string => {
  const ordered = orderCapabilities([...granted])
  if (ordered.length === 0) return 'nothing'
  if (ordered.length === 1) return ordered[0]
  return `${ordered.slice(0, -1).join(', ')} and ${ordered[ordered.length - 1]}`
}

/**
 * Why an operation was refused, in a sentence the CLI can print.
 *
 * It names what the session *does* hold as well as what it is missing. A
 * refusal that says only "not allowed" sends somebody to re-read a document;
 * one that says "this session was approved to read and update, not to delete"
 * tells them to ask for another session, which is the whole of what to do next.
 */
export const capabilityRefusal = (granted: readonly Capability[], op: Op): string => {
  const needed = OP_CAPABILITY[op]
  if (needed === null) return ''
  return `This session was not approved to ${needed}. It may ${describeCapabilities(granted)}. Approving another session is \`pnpm remote connect\` and one tick in the admin.`
}

/* -------------------------------------------------------------------------- */
/* Collections                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Collections no remote session may touch, at any scope, approved by anybody.
 *
 * Each of these is a way for a session to outlive or widen the decision that
 * created it:
 *
 *   users            — create an editor account, or promote one
 *   players          — reader accounts, including their password hashes
 *   remote-devices   — approve the next device, which is approving itself
 *   remote-sessions  — approve or extend a session, same thing
 *   remote-log       — edit the record of what it did
 *
 * Not configurable. A checkbox in the admin that turned this off would be a
 * checkbox that turns off the audit trail, and anybody who reached the admin
 * to tick it would already be able to do all of this by hand — which is the
 * point: these operations belong in a browser, where a human is present.
 */
export const DENIED_COLLECTIONS = new Set([
  'users',
  'players',
  'remote-devices',
  'remote-sessions',
  'remote-log',
])

/**
 * Is this collection reachable by a remote session?
 *
 * `allowed` is the owner's list from the Remote control global. Empty means
 * "everything not denied" — the useful default for a one-person network, and
 * the same shape `users.games` already uses for "this editor is not
 * restricted". A list with entries is an allow-list and nothing outside it is
 * reachable.
 */
export const collectionAllowed = (
  collection: string,
  allowed: readonly string[] | null | undefined,
): boolean => {
  if (!collection || DENIED_COLLECTIONS.has(collection)) return false
  if (!allowed || allowed.length === 0) return true
  return allowed.includes(collection)
}

/**
 * Why a collection was refused, in a sentence the CLI can print.
 *
 * Two refusals that look identical to a caller are two refusals somebody will
 * misdiagnose. A denied collection is permanent and a collection outside the
 * allow-list is a setting, and the difference is the whole of what to do next.
 */
export const collectionRefusal = (
  collection: string,
  allowed: readonly string[] | null | undefined,
): string | null => {
  if (!collection) return 'No collection named.'
  if (DENIED_COLLECTIONS.has(collection)) {
    return `"${collection}" can never be written by a remote session. Accounts, devices, sessions and the remote log are browser-only, on purpose.`
  }
  if (allowed && allowed.length > 0 && !allowed.includes(collection)) {
    return `"${collection}" is not in the remote allow-list (Remote control → Collections in the admin).`
  }
  return null
}

/* -------------------------------------------------------------------------- */
/* The two switches                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The environment half of "off by default".
 *
 * A deployment with no `REMOTE_CONTROL_SECRET` has no remote control, and its
 * routes answer 404 rather than 403 — a 403 tells an attacker the feature
 * exists and is one setting away, and there is nothing to gain from saying so.
 *
 * Thirty-two characters because a short one would be a value somebody typed
 * rather than generated, and this variable's whole job is to be impossible to
 * arrive at by accident.
 */
export const MIN_SECRET_LENGTH = 32

export const remoteSecret = (env: Record<string, string | undefined> = process.env): string | null => {
  const value = (env.REMOTE_CONTROL_SECRET ?? '').trim()
  return value.length >= MIN_SECRET_LENGTH ? value : null
}

export type EnabledCheck = { ok: true } | { ok: false; status: 404 | 403; message: string }

/**
 * Both switches, in the order their answers may be revealed.
 *
 * The environment one first and as a 404, so a deployment that has never
 * opted in leaks nothing. The admin one second and as a 403 with a sentence,
 * because at that point the owner has already set the secret and the only
 * person hitting this is them, wondering why.
 */
export const remoteAvailable = (
  settings: { enabled?: boolean | null } | null,
  env: Record<string, string | undefined> = process.env,
): EnabledCheck => {
  if (!remoteSecret(env)) {
    return {
      ok: false,
      status: 404,
      message: 'Remote control is not configured on this deployment.',
    }
  }
  if (!settings?.enabled) {
    return {
      ok: false,
      status: 403,
      message:
        'Remote control is switched off. In the admin: Network → Remote control → "Remote sessions are enabled".',
    }
  }
  return { ok: true }
}

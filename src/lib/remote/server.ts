import { NextResponse } from 'next/server'
import type { Payload, TypedUser } from 'payload'
import { client } from '../payload'
import { fingerprint, hashToken, tokenMatches } from './credentials'
import {
  CLOCK_SKEW_MS,
  collectionRefusal,
  idleTimeoutMs,
  parseCapabilities,
  remoteAvailable,
  remoteSecret,
  sessionLifetimeMs,
  type Capability,
} from './policy'
import { readSession, type SessionRow, type SessionStatus } from './session'
import { checkSignature } from './signing'

/**
 * The request-side glue: the only module under `lib/remote` that touches a
 * database or a Response.
 *
 * Everything else in this folder is a pure function with a unit test, which is
 * the split that made the rest of it testable — and this file is deliberately
 * thin for the same reason. It looks things up, writes things down, and asks
 * the pure modules what any of it means.
 *
 * Nothing here is exported to a client component. `next/server` and `payload`
 * both belong to the server, and an admin screen that imported this by
 * accident would fail to bundle in a way that is confusing rather than
 * instructive.
 */

/* -------------------------------------------------------------------------- */
/* Replies                                                                    */
/* -------------------------------------------------------------------------- */

export const fail = (status: number, error: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ ok: false, error, ...extra }, { status })

/**
 * The answer a deployment that has not opted in gives.
 *
 * A bare 404 with no body, because anything else — a JSON error, a distinctive
 * header — tells somebody probing that the route exists and is one environment
 * variable from existing properly. There is nothing to gain from saying so.
 */
export const notHere = () => new NextResponse('Not found', { status: 404 })

/* -------------------------------------------------------------------------- */
/* The address a request came from                                            */
/* -------------------------------------------------------------------------- */

/**
 * The first entry in `x-forwarded-for`, not the last.
 *
 * Same reasoning as `/api/rate`: the header is appended to by each hop, so the
 * leftmost value is the client and the rightmost is our own edge. Taking the
 * last would show every pairing request as coming from our own proxy, which on
 * the approval screen — where the IP is one of three things the owner is asked
 * to recognise — would be worse than showing nothing.
 *
 * It is client-supplied and therefore forgeable. That is why it is displayed
 * rather than trusted: nothing in this feature decides anything on it.
 */
export const clientIp = (headers: Headers): string => {
  const forwarded = headers.get('x-forwarded-for')
  const first = forwarded?.split(',')[0]?.trim()
  if (first) return first
  return headers.get('x-real-ip')?.trim() || 'unknown'
}

/* -------------------------------------------------------------------------- */
/* Rate limiting                                                              */
/* -------------------------------------------------------------------------- */

/**
 * In memory, per process, fixed windows. The same trade `/api/rate` records:
 * no dependency and no shared store, at the cost of a limit that resets on
 * deploy and multiplies by the number of instances. A floor on protection, not
 * a guarantee.
 *
 * The buckets are swept before a new key is added, because a cache keyed on a
 * value the caller supplies an unbounded number of is the rate limiter
 * becoming the denial of service.
 */
const WINDOW_MS = 60_000
const buckets = new Map<string, { count: number; resetAt: number }>()

export const rateLimited = (key: string, limit: number, now: number = Date.now()): boolean => {
  if (buckets.size > 5_000) {
    for (const [name, window] of buckets) if (now >= window.resetAt) buckets.delete(name)
  }
  const current = buckets.get(key)
  if (!current || now >= current.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return false
  }
  if (current.count >= limit) return true
  current.count += 1
  return false
}

/* -------------------------------------------------------------------------- */
/* The two switches, plus the settings behind them                            */
/* -------------------------------------------------------------------------- */

export type RemoteSettings = {
  enabled?: boolean | null
  sessionMinutes?: number | null
  idleMinutes?: number | null
  collections?: (string | null)[] | null
}

export type Context = {
  payload: Payload
  settings: RemoteSettings
  secret: string
  /** Which collections a session may write. Empty means "everything not denied". */
  allowed: string[]
  lifetimeMs: number
  idleMs: number
}

/**
 * Is remote control available at all, and what are its settings?
 *
 * Returns a `Response` when the answer is no, so every route's first two lines
 * are the same and the order the two switches are revealed in is decided once.
 */
export const remoteContext = async (): Promise<Context | NextResponse> => {
  const secret = remoteSecret()
  if (!secret) return notHere()

  const payload = await client()
  const settings = (await payload.findGlobal({
    slug: 'remote-access',
    depth: 0,
  })) as RemoteSettings

  const available = remoteAvailable(settings)
  if (!available.ok) {
    return available.status === 404 ? notHere() : fail(403, available.message)
  }

  return {
    payload,
    settings,
    secret,
    allowed: (settings.collections ?? []).filter((value): value is string => Boolean(value)),
    lifetimeMs: sessionLifetimeMs(settings.sessionMinutes),
    idleMs: idleTimeoutMs(settings.idleMinutes),
  }
}

export const isResponse = (value: unknown): value is NextResponse => value instanceof NextResponse

/* -------------------------------------------------------------------------- */
/* Signature, then device                                                     */
/* -------------------------------------------------------------------------- */

export type DeviceRow = {
  id: number | string
  label: string
  enabled?: boolean | null
  publicKey: string
  fingerprint: string
}

/**
 * Read the body once, as text, and keep it.
 *
 * The signature covers a hash of the raw bytes, so parsing first and
 * re-serialising to check would compare a JSON round-trip against what was
 * actually sent — which agrees almost always and disagrees on exactly the
 * inputs somebody is attacking with.
 */
export const readSigned = async (
  request: Request,
  path: string,
): Promise<{ ok: true; body: string; json: unknown; publicKey: string } | NextResponse> => {
  const body = await request.text()
  const signature = checkSignature(request.headers, request.method, path, body)
  if (!signature.ok) return fail(401, signature.reason)

  let json: unknown = {}
  if (body.length > 0) {
    try {
      json = JSON.parse(body)
    } catch {
      return fail(400, 'Expected a JSON body.')
    }
  }
  return { ok: true, body, json, publicKey: signature.publicKey }
}

/** The device row for a verified public key, or null if it is not registered. */
export const findDevice = async (
  payload: Payload,
  publicKey: string,
): Promise<DeviceRow | null> => {
  const found = await payload.find({
    collection: 'remote-devices',
    where: { publicKey: { equals: publicKey } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return (found.docs[0] as DeviceRow | undefined) ?? null
}

/**
 * Register a key nobody has seen before, disabled.
 *
 * This is the one unauthenticated write in the feature. It exists so the owner
 * does not have to copy a base64 key out of a terminal and into a form — a
 * step whose only purpose would be to create the row this creates for them,
 * and which they would get wrong at least once.
 *
 * Nothing is granted by the row existing. `enabled` is off, every check reads
 * `enabled`, and the route that calls this refuses the session in the same
 * breath.
 */
export const registerDevice = async (
  payload: Payload,
  publicKey: string,
  label: string,
  ip: string,
): Promise<DeviceRow> => {
  const created = await payload.create({
    collection: 'remote-devices',
    data: {
      label: label.slice(0, 80) || 'Unnamed device',
      enabled: false,
      publicKey,
      fingerprint: fingerprint(publicKey),
      firstSeenIp: ip,
      lastSeenIp: ip,
      lastSeenAt: new Date().toISOString(),
    },
    overrideAccess: true,
  })
  return created as unknown as DeviceRow
}

export const touchDevice = async (payload: Payload, device: DeviceRow, ip: string): Promise<void> => {
  await payload.update({
    collection: 'remote-devices',
    id: device.id as number,
    data: { lastSeenIp: ip, lastSeenAt: new Date().toISOString() },
    overrideAccess: true,
  })
}

/* -------------------------------------------------------------------------- */
/* Sessions                                                                   */
/* -------------------------------------------------------------------------- */

export type SessionDoc = SessionRow & {
  id: number | string
  code: string
  device: number | string
  /*
    The grant, and the only permission field any check reads. The other two are
    the record of how it was arrived at — see `policy.ts`. Payload types a
    `hasMany` select as an array that may hold nulls, so the reader on the way
    in is `parseCapabilities`, which is default-deny about anything it cannot
    place.
  */
  capabilities?: (Capability | null)[] | null
  requestedCapabilities?: (Capability | null)[] | null
  approvedCapabilities?: (Capability | null)[] | null
  tokenHash?: string | null
  approvedBy?: number | string | null
  writes?: number | null
  reads?: number | null
  ip?: string | null
  agent?: string | null
}

/**
 * What this session may do, read back off the row.
 *
 * One reader, used by the operation route and by the admin screen, so a value
 * the database hands back in an unexpected shape — a null in the array, a
 * capability name that no longer exists after a rename — is interpreted the
 * same way in both places. `parseCapabilities` keeps only what it recognises,
 * and `sessionCan` refuses on an empty list, so every unexpected shape lands
 * on default-deny rather than on whatever the caller happened to assume.
 */
export const heldCapabilities = (session: Pick<SessionDoc, 'capabilities'>): Capability[] =>
  parseCapabilities(session.capabilities ?? []).capabilities

export const setSessionStatus = async (
  payload: Payload,
  id: number | string,
  status: SessionStatus,
  reason: string,
): Promise<void> => {
  await payload.update({
    collection: 'remote-sessions',
    id: id as number,
    data: { status, endedReason: reason },
    overrideAccess: true,
  })
}

/**
 * The session a bearer token names, having checked everything about it.
 *
 * The lookup is by hash, so a token that is not in the table costs one indexed
 * query and reveals nothing — and the hash is still compared in constant time,
 * because a lookup that returns a row is not the same as a match.
 *
 * Expiry is **written back**, not merely observed. A session that reads as
 * expired on every request while staying `open` in the database is a session
 * the admin screen reports as live for ever, which is the quiet kind of wrong
 * this project keeps finding.
 */
export const openSessionFor = async (
  context: Context,
  request: Request,
): Promise<{ session: SessionDoc; device: DeviceRow; user: TypedUser } | NextResponse> => {
  const header = request.headers.get('authorization') ?? ''
  const token = header.startsWith('Remote ') ? header.slice('Remote '.length).trim() : ''
  if (!token) return fail(401, 'No session. Run `pnpm remote connect`.')

  const { payload, secret } = context
  const found = await payload.find({
    collection: 'remote-sessions',
    where: { tokenHash: { equals: hashToken(token, secret) } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  const session = found.docs[0] as SessionDoc | undefined
  if (!session || !session.tokenHash || !tokenMatches(token, session.tokenHash, secret)) {
    return fail(401, 'That session is not known to this site. Run `pnpm remote connect`.')
  }

  const reading = readSession(session)
  if (!reading.usable) {
    if (reading.becomes) await setSessionStatus(payload, session.id, reading.becomes, reading.reason)
    return fail(401, reading.reason, { status: reading.status })
  }

  const device = (await payload.findByID({
    collection: 'remote-devices',
    id: session.device as number,
    depth: 0,
    overrideAccess: true,
    disableErrors: true,
  })) as DeviceRow | null

  if (!device || !device.enabled) {
    await setSessionStatus(payload, session.id, 'revoked', 'The device was disabled in the admin.')
    return fail(401, 'The device this session belongs to has been disabled.')
  }

  /*
    The account the session runs as. Every operation goes through Payload with
    `overrideAccess: false` and this user, so the session inherits exactly the
    approving editor's permissions — an editor assigned to one wiki cannot
    reach another through a session they approved.

    An approver whose account has since been deleted ends the session rather
    than falling back to an override. "The user is gone, so skip the checks" is
    the shape of every privilege bug.
  */
  const user = session.approvedBy
    ? ((await payload.findByID({
        collection: 'users',
        id: session.approvedBy as number,
        depth: 0,
        overrideAccess: true,
        disableErrors: true,
      })) as TypedUser | null)
    : null

  if (!user) {
    await setSessionStatus(payload, session.id, 'revoked', 'The approving account no longer exists.')
    return fail(401, 'The editor account that approved this session no longer exists.')
  }

  return { session, device, user: { ...user, collection: 'users' } as TypedUser }
}

/* -------------------------------------------------------------------------- */
/* The log                                                                    */
/* -------------------------------------------------------------------------- */

export type LogEntry = {
  session: SessionDoc
  device: DeviceRow
  user: TypedUser
  op: string
  collection: string
  docId?: string | number | null
  slug?: string | null
  game?: string | null
  summary: string
  changed?: Record<string, unknown> | null
  /**
   * What the session was permitted to do when it made this request.
   *
   * Written on every row, including refusals, because "what else could it have
   * done" is the second question anybody asks of a trail and a table of
   * operations cannot answer it.
   */
  granted?: readonly Capability[] | null
  ip: string
  outcome: 'ok' | 'refused' | 'failed'
  detail?: string | null
}

/**
 * Write the trail row.
 *
 * Deliberately **not** wrapped in a try/catch that swallows. A failure to log
 * is a failure of the operation, because a trail written on a best-effort
 * basis has holes exactly where the interesting requests are — and the caller
 * turns a throw here into a 500 that says the write did not happen, which is
 * the truthful answer when it did not get recorded.
 */
export const logRemote = async (payload: Payload, entry: LogEntry): Promise<void> => {
  await payload.create({
    collection: 'remote-log',
    data: {
      session: entry.session.id as number,
      device: entry.device.id as number,
      actor: (entry.user as { id?: number }).id,
      op: entry.op,
      targetCollection: entry.collection,
      docId: entry.docId === null || entry.docId === undefined ? undefined : String(entry.docId),
      slug: entry.slug ?? undefined,
      game: entry.game ?? undefined,
      summary: entry.summary.slice(0, 300),
      changed: entry.changed ?? undefined,
      /* "nothing" rather than an empty string: a blank cell reads as a field
         nobody filled in, and this one is a finding. */
      granted: entry.granted ? entry.granted.join(', ') || 'nothing' : undefined,
      ip: entry.ip,
      outcome: entry.outcome,
      detail: entry.detail?.slice(0, 300),
    },
    overrideAccess: true,
  })
}

/**
 * The fields an operation set, and their values where a value is short.
 *
 * Not the whole document: the document is in its own collection, with
 * Payload's versions where a collection has them, and duplicating it here
 * would double the database for the sake of a diff the record already carries.
 * Long strings and rich text become a length so the row still says something
 * changed and how much.
 */
export const summariseChange = (data: Record<string, unknown>): Record<string, unknown> => {
  const changed: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) changed[key] = null
    else if (typeof value === 'string') {
      changed[key] = value.length <= 120 ? value : `${value.length} characters`
    } else if (typeof value === 'number' || typeof value === 'boolean') changed[key] = value
    else if (Array.isArray(value)) changed[key] = `${value.length} entries`
    else changed[key] = `${Object.keys(value as object).length} keys`
  }
  return changed
}

export const refuseCollection = (collection: string, allowed: string[]): string | null =>
  collectionRefusal(collection, allowed)

export const SKEW_NOTE = `Signed requests are accepted within ${CLOCK_SKEW_MS / 1000} seconds of this server's clock.`

import type { CollectionSlug, Payload, TypedUser, Where } from 'payload'
import {
  capabilityRefusal,
  describeCapabilities,
  isOp,
  sessionCan,
  type Capability,
  type Op,
} from '@/lib/remote/policy'
import {
  clientIp,
  fail,
  heldCapabilities,
  isResponse,
  logRemote,
  openSessionFor,
  rateLimited,
  readSigned,
  refuseCollection,
  remoteContext,
  summariseChange,
  type Context,
  type DeviceRow,
  type SessionDoc,
} from '@/lib/remote/server'

/**
 * Everything a session actually does.
 *
 * One endpoint rather than a REST surface, because the interesting part is not
 * the verbs — Payload already has those — it is that every one of them passes
 * through the same four checks and lands in the same log. A second route with
 * its own copy of "is this session still open" is the two-implementations
 * failure this project keeps a list of, applied to authorisation.
 *
 * ## The four checks, in order
 *
 *   1. **The signature**, so a stolen bearer token alone is not enough. The
 *      device key has to sign this method, this path, this body, now.
 *   2. **The session**, by token hash: open, not expired, not idle, and its
 *      device still enabled. `openSessionFor` writes expiry back rather than
 *      merely noticing it.
 *   3. **The capability**, which is the intersection of what the terminal asked
 *      for and what the approver ticked at approval. Default-deny, and the
 *      default is what a missing grant means: a session with no capabilities
 *      can say who it is and close itself, and nothing else. The client names
 *      an operation and never a permission, so a request that asks nicely and
 *      one that does not are refused identically.
 *   4. **The collection**, against the owner's allow-list and against a
 *      denylist that is not a setting: `users`, `players`, `remote-devices`,
 *      `remote-sessions`, `remote-log`. A session that could write any of
 *      those could widen or outlive the decision that created it.
 *
 * ## Whose permissions these are
 *
 * Every Payload call below runs with `overrideAccess: false` and the editor who
 * approved the session. A remote session is therefore never more powerful than
 * that person: an editor assigned to one wiki cannot reach another through
 * one, because `isEditorForGame` is doing its ordinary job. "Super user" in the
 * owner's sense — writes to a live site from a terminal — without "super user"
 * in the sense that would make the access-control rules decorative.
 *
 * ## The log is not optional
 *
 * `logRemote` throws on failure and nothing catches it. A trail written on a
 * best-effort basis has holes exactly where the interesting requests are, so a
 * write that cannot be recorded is a write that is reported as having failed.
 * Refusals are logged too — an attempt to write something a session was not
 * allowed to write is the entry somebody will most want to find.
 */

export const dynamic = 'force-dynamic'

const PATH = '/api/remote/op'

const PER_SESSION_PER_MINUTE = 240

type Body = {
  op?: unknown
  collection?: unknown
  slug?: unknown
  game?: unknown
  data?: unknown
  limit?: unknown
  where?: unknown
}

/** Resolve a game slug to its id. Records are scoped by relationship, not by name. */
const gameIdFor = async (payload: Payload, slug: unknown): Promise<number | null | 'missing'> => {
  if (typeof slug !== 'string' || slug.length === 0) return null
  const found = await payload.find({
    collection: 'games',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const game = found.docs[0]
  return game ? (game.id as number) : 'missing'
}

const findOne = async (
  payload: Payload,
  user: TypedUser,
  collection: string,
  slug: string,
  gameId: number | null,
) => {
  const clauses: Where[] = [{ slug: { equals: slug } }]
  if (gameId !== null) clauses.push({ game: { equals: gameId } })
  const found = await payload.find({
    collection: collection as CollectionSlug,
    where: { and: clauses },
    limit: 1,
    depth: 0,
    overrideAccess: false,
    user,
  })
  return found.docs[0] ?? null
}

export async function POST(request: Request) {
  const context = await remoteContext()
  if (isResponse(context)) return context

  const signed = await readSigned(request, PATH)
  if (isResponse(signed)) return signed

  const held = await openSessionFor(context, request)
  if (isResponse(held)) return held
  const { session, device, user } = held

  /*
    The key that signed has to be the key the session belongs to. Without this
    an approved device could sign for another device's session — the token and
    the signature would each check out on their own, and the pair would mean
    nothing.
  */
  if (device.publicKey !== signed.publicKey) {
    return fail(401, 'This session belongs to a different device.')
  }

  if (rateLimited(`remote:op:${session.id}`, PER_SESSION_PER_MINUTE)) {
    return fail(429, 'Too many operations on this session just now.')
  }

  const body = (signed.json ?? {}) as Body
  if (!isOp(body.op)) return fail(400, 'Unknown operation.')
  const op: Op = body.op

  /*
    What this session was granted, read off the row rather than off anything
    the client sent.

    `heldCapabilities` keeps only names it recognises and `sessionCan` refuses
    on an empty list, so a row with no capabilities — one hand-edited, one
    whose column failed to read, one written before this field existed — can
    do nothing but `whoami` and `close`. The client has no say in any of it:
    the request names an operation, never a permission, so asking nicely and
    asking rudely are refused identically.
  */
  const granted = heldCapabilities(session)

  const ip = clientIp(request.headers)
  const { payload } = context

  if (!sessionCan(granted, op)) {
    await logRemote(payload, {
      session,
      device,
      user,
      op,
      collection: typeof body.collection === 'string' ? body.collection : '—',
      summary: `refused: ${op} was not granted to this session`,
      granted,
      ip,
      outcome: 'refused',
      detail: `Granted: ${describeCapabilities(granted)}.`,
    })
    return fail(403, capabilityRefusal(granted, op), { granted })
  }

  if (op === 'whoami') {
    return Response.json({
      ok: true,
      user: { email: (user as { email?: string }).email, role: (user as { role?: string }).role },
      session: {
        id: session.id,
        capabilities: granted,
        may: describeCapabilities(granted),
        expiresAt: session.expiresAt,
        writes: session.writes ?? 0,
        reads: session.reads ?? 0,
      },
      device: { label: device.label, fingerprint: device.fingerprint },
    })
  }

  if (op === 'close') {
    await payload.update({
      collection: 'remote-sessions',
      id: session.id as number,
      data: { status: 'closed', endedReason: 'Closed from the terminal.' },
      overrideAccess: true,
    })
    return Response.json({ ok: true, status: 'closed', writes: session.writes ?? 0, reads: session.reads ?? 0 })
  }

  const collection = typeof body.collection === 'string' ? body.collection : ''
  const refusal = refuseCollection(collection, context.allowed)
  if (refusal) {
    await logRemote(payload, {
      session,
      device,
      user,
      op,
      collection: collection || '—',
      summary: `refused: ${op} on ${collection || 'nothing'}`,
      granted,
      ip,
      outcome: 'refused',
      detail: refusal,
    })
    return fail(403, refusal)
  }

  const resolved = await gameIdFor(payload, body.game)
  if (resolved === 'missing') return fail(400, `No wiki with slug "${String(body.game)}".`)
  const gameId = resolved

  try {
    return await perform({ context, session, device, user, op, collection, gameId, body, ip, granted })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'the operation failed'
    /*
      A failure is logged before it is reported, and the log write is outside
      the catch — if the trail itself cannot be written, the 500 the caller
      gets is the honest one.
    */
    await logRemote(payload, {
      session,
      device,
      user,
      op,
      collection,
      slug: typeof body.slug === 'string' ? body.slug : null,
      game: typeof body.game === 'string' ? body.game : null,
      summary: `failed: ${op} ${collection}${typeof body.slug === 'string' ? `/${body.slug}` : ''}`,
      granted,
      ip,
      outcome: 'failed',
      detail,
    })
    return fail(400, detail)
  }
}

/* -------------------------------------------------------------------------- */

const perform = async (args: {
  context: Context
  session: SessionDoc
  device: DeviceRow
  user: TypedUser
  op: Op
  collection: string
  gameId: number | null
  body: Body
  ip: string
  granted: Capability[]
}): Promise<Response> => {
  const { context, session, device, user, op, collection, gameId, body, ip, granted } = args
  const { payload } = context
  const slug = typeof body.slug === 'string' ? body.slug : ''
  const game = typeof body.game === 'string' ? body.game : null

  /** Count a read on the session rather than writing a log row for it. */
  const countRead = async () => {
    await payload.update({
      collection: 'remote-sessions',
      id: session.id as number,
      data: { reads: (session.reads ?? 0) + 1, lastUsedAt: new Date().toISOString() },
      overrideAccess: true,
    })
  }

  const countWrite = async () => {
    await payload.update({
      collection: 'remote-sessions',
      id: session.id as number,
      data: { writes: (session.writes ?? 0) + 1, lastUsedAt: new Date().toISOString() },
      overrideAccess: true,
    })
  }

  if (op === 'list') {
    const clauses: Where[] = []
    if (gameId !== null) clauses.push({ game: { equals: gameId } })
    const limit = typeof body.limit === 'number' && body.limit > 0 ? Math.min(body.limit, 200) : 30
    const found = await payload.find({
      collection: collection as CollectionSlug,
      ...(clauses.length ? { where: { and: clauses } } : {}),
      limit,
      depth: 0,
      sort: '-updatedAt',
      overrideAccess: false,
      user,
    })
    await countRead()
    return Response.json({
      ok: true,
      total: found.totalDocs,
      docs: found.docs.map((doc) => {
        const row = doc as unknown as Record<string, unknown>
        return { id: row.id, slug: row.slug, title: row.title ?? row.name ?? null, _status: row._status ?? null }
      }),
    })
  }

  if (op === 'get') {
    if (!slug) return fail(400, 'Which record?')
    const doc = await findOne(payload, user, collection, slug, gameId)
    if (!doc) return fail(404, `Not found: ${collection}/${slug}`)
    await countRead()
    return Response.json({ ok: true, doc })
  }

  // --- Everything below changes something -----------------------------------

  if (op === 'create') {
    const data = (body.data ?? {}) as Record<string, unknown>
    if (typeof data !== 'object' || Array.isArray(data)) return fail(400, 'Expected an object in `data`.')
    const created = await payload.create({
      collection: collection as CollectionSlug,
      data: { ...data, ...(gameId !== null ? { game: gameId } : {}) } as never,
      overrideAccess: false,
      user,
    })
    const row = created as unknown as Record<string, unknown>
    await logRemote(payload, {
      session,
      device,
      user,
      op,
      collection,
      docId: row.id as number,
      slug: (row.slug as string) ?? null,
      game,
      summary: `created ${collection}/${row.slug ?? row.id}`,
      changed: summariseChange(data),
      granted,
      ip,
      outcome: 'ok',
    })
    await countWrite()
    return Response.json({ ok: true, id: row.id, slug: row.slug ?? null })
  }

  if (op === 'update' || op === 'publish') {
    if (!slug) return fail(400, 'Which record?')
    const existing = await findOne(payload, user, collection, slug, gameId)
    if (!existing) return fail(404, `Not found: ${collection}/${slug}`)

    /*
      `publish` is an update with one field, spelled out as its own operation
      because the thing it fixes is a whole entry in this project's gotchas
      list: Payload defaults a document it *creates* to `_status: 'draft'`, and
      335 guides were written, counted, verified and reported as finished while
      every one of them returned 404. A verb the CLI can type is the difference
      between remembering that and not.
    */
    const data =
      op === 'publish'
        ? { _status: 'published' }
        : ((body.data ?? {}) as Record<string, unknown>)

    if (typeof data !== 'object' || Array.isArray(data)) return fail(400, 'Expected an object in `data`.')
    if (Object.keys(data).length === 0) return fail(400, 'Nothing to change.')

    const row = existing as unknown as Record<string, unknown>
    await payload.update({
      collection: collection as CollectionSlug,
      id: row.id as number,
      data: data as never,
      overrideAccess: false,
      user,
    })
    await logRemote(payload, {
      session,
      device,
      user,
      op,
      collection,
      docId: row.id as number,
      slug,
      game,
      summary: op === 'publish' ? `published ${collection}/${slug}` : `updated ${collection}/${slug}`,
      changed: summariseChange(data),
      granted,
      ip,
      outcome: 'ok',
    })
    await countWrite()
    return Response.json({ ok: true, id: row.id, slug })
  }

  // op === 'delete'
  if (!slug) return fail(400, 'Which record?')
  const existing = await findOne(payload, user, collection, slug, gameId)
  if (!existing) return fail(404, `Not found: ${collection}/${slug}`)
  const row = existing as unknown as Record<string, unknown>
  await payload.delete({
    collection: collection as CollectionSlug,
    id: row.id as number,
    overrideAccess: false,
    user,
  })
  await logRemote(payload, {
    session,
    device,
    user,
    op,
    collection,
    docId: row.id as number,
    slug,
    game,
    summary: `deleted ${collection}/${slug}`,
    /*
      The whole record, for a delete and only for a delete. Everywhere else the
      document survives the operation and the log can point at it; here it does
      not, and a trail that says a page was deleted without saying what was on
      it has recorded the fact and lost the thing.
    */
    changed: summariseChange(row),
    ip,
    outcome: 'ok',
  })
  await countWrite()
  return Response.json({ ok: true, deleted: `${collection}/${slug}` })
}

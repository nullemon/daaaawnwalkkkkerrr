import type { TypedUser } from 'payload'
import { hashToken, newToken } from '@/lib/remote/credentials'
import { describeCapabilities, grantedCapabilities, parseCapabilities } from '@/lib/remote/policy'
import { readSession, statusReason } from '@/lib/remote/session'
import {
  clientIp,
  fail,
  findDevice,
  isResponse,
  logRemote,
  rateLimited,
  readSigned,
  remoteContext,
  setSessionStatus,
  type SessionDoc,
} from '@/lib/remote/server'

/**
 * The CLI's wait, and the one place a session token is ever created.
 *
 * ## Why approval mints nothing
 *
 * Clicking Approve in the admin flips a status and writes down who flipped it.
 * It does not create a token, because a token created in the browser would
 * have to reach the terminal somehow — through the database, through a page,
 * through a copy-paste — and every one of those is a place the credential
 * exists that it does not need to.
 *
 * Instead the token is minted here, when the machine that holds the device key
 * asks for it, handed back in one response, and stored only as an HMAC. The
 * browser never sees it and the database never holds it. This is the device
 * authorization grant's shape, and it is the reason the design can say the
 * sixteen-character code is not a credential and mean it.
 *
 * ## Single use
 *
 * Minting flips the session from `approved` to `open` in the same write. A
 * second poll therefore finds an `open` session and is told the token was
 * already collected — it does not get another one. That is what makes the
 * approval single-use: there is exactly one moment at which a token exists,
 * and it is a status transition rather than a flag somebody has to remember to
 * clear.
 */

export const dynamic = 'force-dynamic'

const PATH = '/api/remote/poll'

/* A poll every two seconds for ten minutes is 300, so this is generous on
   purpose — the limit is here to bound a stuck loop, not to pace the CLI. */
const PER_KEY_PER_MINUTE = 120

export async function POST(request: Request) {
  const context = await remoteContext()
  if (isResponse(context)) return context

  const signed = await readSigned(request, PATH)
  if (isResponse(signed)) return signed

  if (rateLimited(`remote:poll:${signed.publicKey}`, PER_KEY_PER_MINUTE)) {
    return fail(429, 'Polling too fast.')
  }

  const body = (signed.json ?? {}) as { session?: unknown }
  const id = body.session
  if (typeof id !== 'number' && typeof id !== 'string') {
    return fail(400, 'Which session?')
  }

  const { payload, secret, lifetimeMs, idleMs } = context

  const device = await findDevice(payload, signed.publicKey)
  if (!device || !device.enabled) {
    return fail(403, 'This device is not enabled.')
  }

  const session = (await payload.findByID({
    collection: 'remote-sessions',
    id: id as number,
    depth: 0,
    overrideAccess: true,
    disableErrors: true,
  })) as SessionDoc | null

  /*
    The session has to belong to the key that is asking. Without this check a
    device could poll — and collect the token for — a session approved for
    another device, which would make the approval screen's device name a
    decoration rather than a decision.
  */
  if (!session || String(session.device) !== String(device.id)) {
    return fail(404, 'No such session for this device.')
  }

  const reading = readSession(session)

  if (session.status === 'approved' && reading.status === 'approved') {
    const token = newToken()
    const now = Date.now()

    /*
      The grant, computed here and nowhere else: the intersection of what the
      terminal asked for and what the owner ticked. Both halves are on the row
      already, so this is a reading of a decision rather than a second decision
      — and it is taken at the moment the credential comes into existence,
      which is the moment it has to be fixed.
    */
    const granted = grantedCapabilities(
      parseCapabilities(session.requestedCapabilities ?? []).capabilities,
      parseCapabilities(session.approvedCapabilities ?? []).capabilities,
    )

    /*
      An empty intersection opens nothing.

      The approval form refuses this case already, so reaching it means the two
      lists were written some other way — a hand-edited row, a restored backup,
      a future caller. Default-deny says the answer is a dead session with a
      sentence, not an open one that refuses every operation it is asked for.
    */
    if (granted.length === 0) {
      await setSessionStatus(
        payload,
        session.id,
        'revoked',
        'Nothing was granted: what was approved and what was asked for do not overlap.',
      )
      return fail(
        403,
        'That session was approved for nothing it asked to do, so no token was minted. Run `pnpm remote connect` again and tick at least one box when approving it.',
      )
    }

    await payload.update({
      collection: 'remote-sessions',
      id: session.id as number,
      data: {
        status: 'open',
        capabilities: granted,
        tokenHash: hashToken(token, secret),
        expiresAt: new Date(now + lifetimeMs).toISOString(),
        idleMs,
        lastUsedAt: new Date(now).toISOString(),
        ip: clientIp(request.headers),
      },
      overrideAccess: true,
    })

    /*
      The grant is written to the trail as well as to the row.

      "What was this session allowed to do" is a question about a decision, and
      a log that only records operations can answer it only by inference — a
      session that could delete and did not reads exactly like one that could
      not. So the opening of a session is itself an entry, with the three lists
      in its detail, and every operation row afterwards repeats the grant it
      ran under.

      `logRemote` throws rather than swallowing, here as everywhere: a session
      whose opening could not be recorded is one that does not open.
    */
    const approver = session.approvedBy
      ? ((await payload.findByID({
          collection: 'users',
          id: session.approvedBy as number,
          depth: 0,
          overrideAccess: true,
          disableErrors: true,
        })) as TypedUser | null)
      : null

    await logRemote(payload, {
      session,
      device,
      user: approver ?? ({ id: undefined } as unknown as TypedUser),
      op: 'open',
      collection: '—',
      summary: `session opened, may ${describeCapabilities(granted)}`,
      granted,
      ip: clientIp(request.headers),
      outcome: 'ok',
      detail: `asked to ${describeCapabilities(
        parseCapabilities(session.requestedCapabilities ?? []).capabilities,
      )}; approved to ${describeCapabilities(
        parseCapabilities(session.approvedCapabilities ?? []).capabilities,
      )}`,
    })

    return Response.json({
      ok: true,
      status: 'open',
      token,
      capabilities: granted,
      may: describeCapabilities(granted),
      expiresAt: new Date(now + lifetimeMs).toISOString(),
      idleMinutes: Math.round(idleMs / 60_000),
    })
  }

  /*
    Anything the reading says has run out is written back before it is
    reported. A session that reads as expired on every poll but stays `pending`
    in the database is a row the admin offers to approve for ever.
  */
  if (reading.becomes) {
    await setSessionStatus(payload, session.id, reading.becomes, reading.reason)
  }

  return Response.json({
    ok: true,
    status: reading.status,
    reason: reading.status === 'open' ? 'The token for this session was already collected.' : reading.reason || statusReason(reading.status),
  })
}

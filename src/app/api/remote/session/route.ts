import { auditNetwork } from '@/lib/audit'
import { formatCode, newCode } from '@/lib/remote/credentials'
import { gateRefusal, remoteBlockers } from '@/lib/remote/gate'
import {
  CAPABILITIES,
  PAIRING_TTL_MS,
  SCOPES,
  SCOPE_LABEL,
  capabilitiesForScope,
  describeCapabilities,
  isScope,
  parseCapabilities,
  type Capability,
} from '@/lib/remote/policy'
import {
  clientIp,
  fail,
  findDevice,
  isResponse,
  rateLimited,
  readSigned,
  registerDevice,
  remoteContext,
  touchDevice,
} from '@/lib/remote/server'
import { adminUrl } from '@/lib/admin-path'

/**
 * Ask for a session. Nothing here grants one.
 *
 * What this route does is create a row a human has to look at. It checks, in
 * this order and for the reason given:
 *
 *   1. **The two switches.** No `REMOTE_CONTROL_SECRET` is a 404 with no body,
 *      so a deployment that never opted in leaks nothing about the feature
 *      existing. The admin's own switch is a 403 with a sentence, because by
 *      then the only person here is the owner wondering why.
 *   2. **The signature**, before any database work. An unsigned flood costs a
 *      header read.
 *   3. **The device.** An unknown key registers itself, disabled, and is
 *      refused — see `registerDevice`. A known key that is not enabled is
 *      refused the same way.
 *   4. **The audit gate.** `auditNetwork` is the one place this project decides
 *      whether something is missing, and `remoteBlockers` keeps the findings
 *      that are `blocking` *and* `owner`. This is the owner's "only works when
 *      we have entered all details", and it is deliberately not a second
 *      implementation of those checks — see `src/lib/remote/gate.ts`.
 *
 * The gate runs here and not on every operation. An audit pass is around 190
 * count queries; per write it would make the tool unusable and would catch
 * nothing, because nothing an open session does can create a blocking owner
 * finding.
 *
 * `/api` is in `PASS_THROUGH` in `proxy.ts`, so this answers on all ten hosts
 * and is never rewritten onto a game prefix. It sits outside both route groups
 * so the static segment wins over Payload's `(payload)/api/[...slug]`
 * catch-all — the same arrangement `/api/rate` records.
 */

export const dynamic = 'force-dynamic'

const PATH = '/api/remote/session'

/** Generous enough for a retry after a refusal, tight enough to be a limit. */
const PER_KEY_PER_MINUTE = 6
const PER_PROCESS_PER_MINUTE = 60

export async function POST(request: Request) {
  const context = await remoteContext()
  if (isResponse(context)) return context

  const signed = await readSigned(request, PATH)
  if (isResponse(signed)) return signed

  const ip = clientIp(request.headers)
  if (rateLimited('remote:session:process', PER_PROCESS_PER_MINUTE)) {
    return fail(429, 'Too many pairing requests just now. Try again in a minute.')
  }
  if (rateLimited(`remote:session:${signed.publicKey}`, PER_KEY_PER_MINUTE)) {
    return fail(429, 'Too many pairing requests from this device. Try again in a minute.')
  }

  const body = (signed.json ?? {}) as {
    label?: unknown
    scope?: unknown
    capabilities?: unknown
    agent?: unknown
  }
  const label = typeof body.label === 'string' ? body.label : ''
  const agent = typeof body.agent === 'string' ? body.agent.slice(0, 200) : ''

  /*
    What the terminal is asking to be allowed to do.

    An explicit list wins; a preset name is the shorthand; neither is `write`,
    which is what `pnpm remote connect` has always asked for. The request is
    only ever the *upper* bound — the owner ticks their own boxes at approval
    and the session gets the intersection — so a generous default here grants
    nothing by itself.

    A name nobody recognises is a **refusal**, not a silent drop. A terminal
    that typed `--can creat,delete` and was quietly handed deletion alone would
    have a narrower session than either side intended with nothing saying so,
    which is the mistake CLAUDE.md records about Antar 4 pointed at a
    permission list.
  */
  const asked = parseCapabilities(body.capabilities)
  if (asked.unknown.length > 0) {
    return fail(400, `Not a capability: ${asked.unknown.join(', ')}.`, {
      capabilities: [...CAPABILITIES],
    })
  }

  /* A preset nobody recognises is refused for the same reason, rather than
     quietly becoming the default one — a session that asked for `readonly`
     and was handed `write` is the opposite of the mistake it was guarding
     against. */
  if (body.scope !== undefined && !isScope(body.scope)) {
    return fail(400, `Not a preset: ${String(body.scope)}.`, {
      presets: SCOPES.map((scope) => ({ scope, means: SCOPE_LABEL[scope] })),
    })
  }
  const requestedCapabilities: Capability[] =
    asked.capabilities.length > 0
      ? asked.capabilities
      : capabilitiesForScope(isScope(body.scope) ? body.scope : 'write')

  const { payload } = context

  let device = await findDevice(payload, signed.publicKey)
  if (!device) {
    device = await registerDevice(payload, signed.publicKey, label, ip)
    return fail(403, 'This device is not approved yet.', {
      device: { fingerprint: device.fingerprint, label: device.label, registered: true },
      hint: 'A row has been created for it in the admin: Remote control → Remote devices. Name it, check the fingerprint matches the one above, tick Enabled, then run this again.',
    })
  }

  if (!device.enabled) {
    return fail(403, 'This device is registered but not enabled.', {
      device: { fingerprint: device.fingerprint, label: device.label, registered: false },
      hint: 'In the admin: Remote control → Remote devices → tick Enabled on this device.',
    })
  }

  await touchDevice(payload, device, ip)

  /*
    The gate. `auditNetwork` throws rather than returning zeros if a query
    fails, which is the behaviour wanted here: a gate that opens because a
    count query failed is the reassuring-answer failure this project has a
    rule about. A thrown pass is a 500 and no session.
  */
  const snapshot = await auditNetwork(payload)
  const blockers = remoteBlockers(snapshot.findings)
  if (blockers.length > 0) {
    return fail(403, gateRefusal(blockers), { blockers })
  }

  const now = Date.now()
  const code = newCode()
  const session = await payload.create({
    collection: 'remote-sessions',
    data: {
      code,
      status: 'pending',
      device: device.id as number,
      requestedCapabilities,
      pairingExpiresAt: new Date(now + PAIRING_TTL_MS).toISOString(),
      codeAttempts: 0,
      reads: 0,
      writes: 0,
      ip,
      agent,
    },
    overrideAccess: true,
  })

  return Response.json({
    ok: true,
    session: session.id,
    code: formatCode(code),
    requestedCapabilities,
    asking: describeCapabilities(requestedCapabilities),
    device: { label: device.label, fingerprint: device.fingerprint },
    pairingExpiresAt: new Date(now + PAIRING_TTL_MS).toISOString(),
    /*
      The sentence the CLI prints. Written here rather than in the CLI because
      the two have to agree about what the owner is being asked to do, and a
      copy in each is a copy that drifts — the rule this repository states
      about section copy, applied to a terminal.
    */
    next: `Open ${adminUrl('/remote')} on a device you trust. The pending session there shows this same code. Compare the two, type it in, tick what this session may do, and approve.`,
  })
}

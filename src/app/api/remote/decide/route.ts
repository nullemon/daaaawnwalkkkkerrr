import { NextResponse } from 'next/server'
import { codesMatch } from '@/lib/remote/credentials'
import {
  MAX_CODE_ATTEMPTS,
  PAIRING_TTL_MS,
  describeCapabilities,
  grantedCapabilities,
  parseCapabilities,
} from '@/lib/remote/policy'
import { readSession, recordCodeFailure } from '@/lib/remote/session'
import {
  clientIp,
  fail,
  isResponse,
  rateLimited,
  remoteContext,
  type SessionDoc,
} from '@/lib/remote/server'
import { adminUrl } from '@/lib/admin-path'

/**
 * Approve, deny or revoke — the only place a human decision is recorded.
 *
 * ## Why it is an ordinary form post
 *
 * `/admin/remote` is a server component and every control on it is a form or a
 * link, the same arrangement the analytics screen uses. No client component,
 * no fetch, nothing to hydrate: an approval screen that stops working because
 * a bundle failed to load is an approval screen that stops working on the day
 * somebody is trying to fix the site.
 *
 * ## Why the code has to be typed
 *
 * Two jobs, and the second one is the one that is easy to miss.
 *
 * The first is the owner's: the sixteen characters are in the terminal and on
 * this page, and typing them is where the owner says "yes, those are the same
 * two". Approving a live-site credential should be a deliberate act rather
 * than a button that happens to be under the cursor.
 *
 * The second is CSRF. This route authenticates with the admin's session
 * cookie, which a form on another site can also cause a browser to send. That
 * form cannot read this page, so it cannot know the code — which makes the
 * confirm field an unguessable token as well as a confirmation. Five wrong
 * ones lock the session permanently rather than merely failing, so it is not a
 * field anybody can grind at.
 *
 * ## What approving does and does not do
 *
 * It flips a status and writes down who flipped it. It mints no token: the
 * token is created by `/api/remote/poll` when the machine holding the device
 * key collects it, and so never passes through a browser or sits in a row.
 * That split is the reason the code on this page can be displayed at all.
 */

export const dynamic = 'force-dynamic'

const BACK = adminUrl('/remote')

/** Back to the screen with a sentence, rather than a JSON body nobody sees. */
const back = (request: Request, message: string, tone: 'ok' | 'bad' = 'ok') => {
  const url = new URL(BACK, new URL(request.url).origin)
  url.searchParams.set(tone === 'ok' ? 'done' : 'problem', message)
  return NextResponse.redirect(url, 303)
}

export async function POST(request: Request) {
  const context = await remoteContext()
  if (isResponse(context)) return context
  const { payload } = context

  /*
    An editor, signed into the admin, from the cookie on this request. Not the
    device key: this half of the flow is a person in a browser, and the device
    key is the other half, on purpose. A session is approved by somebody who is
    already trusted with the admin and refused by anybody who is not.
  */
  const { user } = await payload.auth({ headers: request.headers })
  if (!user || user.collection !== 'users') {
    return fail(403, 'Only a signed-in editor can decide a remote session.')
  }

  if (rateLimited(`remote:decide:${user.id}`, 30)) {
    return fail(429, 'Too many decisions just now.')
  }

  const form = await request.formData()
  const id = String(form.get('session') ?? '')
  const action = String(form.get('action') ?? '')
  const typed = String(form.get('code') ?? '')

  if (!id) return back(request, 'No session named.', 'bad')

  const session = (await payload.findByID({
    collection: 'remote-sessions',
    id: id as unknown as number,
    depth: 0,
    overrideAccess: true,
    disableErrors: true,
  })) as SessionDoc | null

  if (!session) return back(request, 'That session no longer exists.', 'bad')

  /* --- Ending one, which needs no code ------------------------------------ */

  if (action === 'deny' || action === 'revoke') {
    if (session.status === 'denied' || session.status === 'revoked' || session.status === 'closed') {
      return back(request, 'That session had already ended.')
    }
    await payload.update({
      collection: 'remote-sessions',
      id: session.id as number,
      data: {
        status: action === 'deny' ? 'denied' : 'revoked',
        endedReason: `${action === 'deny' ? 'Refused' : 'Revoked'} in the admin by ${
          (user as { email?: string }).email ?? 'an editor'
        }.`,
      },
      overrideAccess: true,
    })
    return back(
      request,
      action === 'deny'
        ? 'Refused. The terminal is told, and nothing was granted.'
        : 'Revoked. The session stops on its next request, and there is no cached grant that outlives it.',
    )
  }

  if (action !== 'approve') return back(request, 'Unknown action.', 'bad')

  /* --- Approving ----------------------------------------------------------- */

  const reading = readSession(session)
  if (session.status !== 'pending') {
    return back(request, `That session is ${session.status}, not waiting for approval.`, 'bad')
  }
  if (reading.becomes) {
    await payload.update({
      collection: 'remote-sessions',
      id: session.id as number,
      data: { status: reading.becomes, endedReason: reading.reason },
      overrideAccess: true,
    })
    return back(
      request,
      `That request ran out of time — a pairing code is good for ${PAIRING_TTL_MS / 60_000} minutes. Run \`pnpm remote connect\` again.`,
      'bad',
    )
  }

  if (!codesMatch(typed, session.code)) {
    const attempt = recordCodeFailure(session.codeAttempts ?? 0)
    await payload.update({
      collection: 'remote-sessions',
      id: session.id as number,
      data: {
        codeAttempts: (session.codeAttempts ?? 0) + 1,
        ...(attempt.ok === false && attempt.locked
          ? { status: 'locked' as const, endedReason: `Code typed wrong ${MAX_CODE_ATTEMPTS} times.` }
          : {}),
      },
      overrideAccess: true,
    })
    return back(request, attempt.ok ? 'Approved.' : attempt.reason, 'bad')
  }

  /*
    The boxes the owner ticked.

    Each `capability` input on the approval form is one checkbox, so an unticked
    box sends nothing at all — which is why this is default-deny by
    construction rather than by a rule somebody has to remember: a form that
    posts no capabilities grants none.

    The intersection with what the terminal asked for is computed when the
    token is minted, not here, so there is one place that decides what a
    session actually holds. This field is the approver's half of that pair,
    kept on the row so it can be read back beside the request.
  */
  const ticked = parseCapabilities(form.getAll('capability').map((value) => String(value)))
  if (ticked.unknown.length > 0) {
    return back(request, `Not a capability: ${ticked.unknown.join(', ')}.`, 'bad')
  }

  const requested = parseCapabilities(session.requestedCapabilities ?? []).capabilities
  const granted = grantedCapabilities(requested, ticked.capabilities)

  /*
    An approval that grants nothing is refused rather than recorded.

    It would open a session that can say who it is, close itself and nothing
    else, and the terminal would discover that one operation at a time. Saying
    so here costs one sentence; the alternative costs somebody ten minutes and
    a reason to distrust the feature.
  */
  if (granted.length === 0) {
    return back(
      request,
      ticked.capabilities.length === 0
        ? 'Nothing was ticked, so nothing would be granted. Tick what this session may do, or Refuse it.'
        : `That session asked to ${describeCapabilities(requested)}, and none of it was ticked. A session is granted the narrower of the two, so this would grant nothing.`,
      'bad',
    )
  }

  await payload.update({
    collection: 'remote-sessions',
    id: session.id as number,
    data: {
      status: 'approved',
      approvedCapabilities: ticked.capabilities,
      approvedBy: user.id as number,
      approvedAt: new Date().toISOString(),
      ip: session.ip || clientIp(request.headers),
    },
    overrideAccess: true,
  })

  return back(
    request,
    `Approved to ${describeCapabilities(granted)}. The terminal collects its token on its next poll — nothing was handed over through this page.`,
  )
}

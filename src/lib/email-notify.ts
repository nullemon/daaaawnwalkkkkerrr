/**
 * Telling somebody that a reader filed something.
 *
 * ## The failure this closes
 *
 * `/contact` and the report link at the foot of every page both say the same
 * thing: "corrections go straight to our review queue". They did. Nothing read
 * the queue, and nothing said so — the record was written, the reader was
 * thanked, and the only way anybody found out was opening the admin. A promise
 * printed on 1,929 pages and kept by nobody is worse than no invitation at
 * all, because the reader who took the trouble is the one this site cannot
 * replace: every record here was compiled without access to the game.
 *
 * ## One email per report, and not a digest
 *
 * Deliberate, and written down here because the right answer changes with
 * volume and whoever inherits this should know which way it was decided.
 *
 * At this scale — a queue that has never been notified, eight wikis, four of
 * them pre-release — a report arriving is a rare event and an immediate
 * message is the whole value: a wrong figure gets corrected the same day. A
 * digest is the opposite trade. It is right once the volume is high enough
 * that per-report mail becomes noise somebody filters, and it is wrong now for
 * a reason beyond taste: **a digest needs a scheduler this deployment does not
 * have.** Every page is prerendered and the only thing that runs on a clock is
 * whatever the operator types. A "daily digest" built out of that is a mail
 * that arrives when somebody happens to run a command, which is the shape of
 * failure this repository keeps collecting.
 *
 * If the volume ever justifies switching, the change is here and the two hooks
 * that call it: batching belongs in a scheduled task that reads
 * `status: 'new'`, not in a `beforeChange` that tries to be clever.
 *
 * ## The report is the valuable thing; the email is a courtesy
 *
 * So nothing in here throws. `notifyOfReport` catches everything and logs it,
 * because the alternative is an `afterChange` that rejects a write because a
 * relay was down: the reader sees an error on a form that already stored their
 * report, files it again, and the queue fills with duplicates of the thing the
 * feature exists to protect. A lost email is recoverable — the record is in
 * the admin either way. A lost correction is not.
 *
 * ## Plain text, no HTML body
 *
 * Every value in the message came from a stranger typing into a public form.
 * This repository's rule is that an editable string reaching the DOM as markup
 * is a stored-XSS hole; a mail client is a DOM like any other, and several
 * render HTML. A `text`-only message has nowhere for markup to land, so the
 * escaping cannot be forgotten later by somebody adding a field. The one value
 * that reaches a *header* is flattened by `oneLine` — see `email-copy.ts`.
 */

import { resolveEmailSettings, resolveSender } from './email'
import { networkName, oneLine, siteSettings } from './email-copy'
import { HUB_ORIGIN } from './urls'
import { adminUrl } from './admin-path'

type Notifier = {
  sendEmail: (message: { to: string; subject: string; text: string }) => Promise<unknown>
  findGlobal: (args: { slug: 'site-settings'; depth?: number }) => Promise<Record<string, unknown>>
  logger: { info: (msg: unknown) => void; warn: (msg: unknown) => void }
}

export type Report = {
  collection: 'corrections' | 'requests'
  /** What kind of thing arrived, in the words an editor would use. */
  kind: string
  id: string | number
  /** Label and reader-typed value, in the order an editor wants to read them. */
  fields: Array<[string, string | null | undefined]>
}

/**
 * Who is told.
 *
 * Site settings → Legal & contact → "Where reader reports are sent" if it is
 * filled in, and otherwise the address the site already sends *from*. Blank
 * means the shipped behaviour and never means nobody is told — that is
 * `docs/COPY.md`'s rule about an empty field, and it matters more here than on
 * a heading: a notification setting that silently means "off" is
 * indistinguishable from the bug this whole module exists to fix.
 *
 * The fallback is always deliverable wherever it needs to be. Any real
 * provider requires `EMAIL_FROM_ADDRESS` to be a checked, non-stand-in address
 * — `checkAddress` refuses `@example.com` at boot — so falling back to it
 * cannot produce a bounce. Only `EMAIL_PROVIDER=console` can yield the
 * `console@localhost` stand-in, and that provider prints instead of sending.
 */
const recipientFor = async (payload: Notifier): Promise<string> => {
  const stored = await siteSettings(payload)
  const explicit = typeof stored?.reportsEmail === 'string' ? stored.reportsEmail.trim() : ''
  if (explicit) return explicit

  /*
    The same resolution the adapter does per message: the environment overlaid
    with Site settings. Re-resolved rather than reaching into the adapter,
    because `resolveSender` is the thing that validates a typed-in address and
    bypassing it is how a stand-in gets used as a real recipient.
  */
  const base = resolveEmailSettings(process.env as Record<string, string | undefined>).sender
  return resolveSender(base, {
    fromName: (stored?.emailFromName as string | null) ?? null,
    fromAddress: (stored?.emailFromAddress as string | null) ?? null,
    replyTo: (stored?.emailReplyTo as string | null) ?? null,
  }).address
}

/**
 * The subject line: the network, then the reader's own summary.
 *
 * No game is named — this one recipient covers all eight wikis, and the
 * subject is the line most likely to be copied into a mail rule that would
 * then match one of them. `oneLine` is not cosmetic here: the summary is 200
 * characters a stranger typed, and a carriage return in a header is where they
 * get to add headers of their own.
 *
 * Exported for the test that pins exactly that.
 */
export const reportSubject = (report: Report, network: string): string => {
  const summary = oneLine(String(report.fields[0]?.[1] ?? '').trim() || report.kind)
  return `${network ? `[${network}] ` : ''}New ${report.kind}: ${summary}`
}

/** `Label: value` for everything the reader actually filled in. */
export const reportBody = (report: Report, network: string, recipient: string): string => {
  const lines = report.fields
    .map(([label, value]) => [label, (value ?? '').trim()] as const)
    .filter(([, value]) => value !== '')
    .map(([label, value]) =>
      value.includes('\n') ? `${label}:\n${value}` : `${label}: ${value}`,
    )

  return [
    `A reader filed ${report.kind}${network ? ` on ${network}` : ''}.`,
    '',
    ...lines,
    '',
    'Triage it here:',
    `${HUB_ORIGIN}${adminUrl(`/collections/${report.collection}/${report.id}`)}`,
    '',
    /*
      Why this arrived, in the message itself. Somebody inheriting this site
      will meet the email before they meet the code, and an unexplained
      notification with no visible switch is one people route to a folder.
    */
    `You are getting this because Site settings → Legal & contact → "Where reader reports are sent" resolves to ${recipient}.`,
    'One message per report, as it arrives. There is no digest.',
  ].join('\n')
}

/**
 * Send one notification. Never throws, never rejects the write that caused it.
 */
export const notifyOfReport = async (payload: unknown, report: Report): Promise<void> => {
  const notifier = payload as Notifier
  try {
    const [recipient, network] = await Promise.all([
      recipientFor(notifier),
      networkName(notifier),
    ])

    await notifier.sendEmail({
      to: recipient,
      subject: reportSubject(report, network),
      text: reportBody(report, network, recipient),
    })
  } catch (error) {
    /*
      Warned with the collection and id, which is the whole point of catching
      here: the record is safe in the admin and this line is what tells
      somebody to go and look at it. Swallowing it silently would replace one
      unread queue with another.
    */
    notifier.logger?.warn?.(
      `Could not email the notification for ${report.collection}/${report.id}. The report itself is stored and is in the admin. ${String(error)}`,
    )
  }
}

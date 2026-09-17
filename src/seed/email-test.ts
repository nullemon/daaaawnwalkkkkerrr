import 'dotenv/config'
import { getPayload } from 'payload'
import { isDeliverableAddress, resolveEmailSettings } from '../lib/email'
import { clearSenderCache } from '../lib/email-adapter'

/**
 * Send one message through whatever is configured, and say what happened.
 *
 *   pnpm email:test you@yourdomain.com
 *
 * The point is not that a message arrives. It is that the person who just
 * pasted the credentials finds out *now*, at the terminal, instead of six
 * weeks later when an editor cannot get back into the admin and there is
 * nothing in any log — the failure this whole area is built against.
 *
 * So two things matter more than the send itself:
 *
 *   - **The provider's own error text, verbatim.** "Domain not found" and
 *     "Invalid API key" are different afternoons. Paraphrasing them into
 *     "failed to send" is how one becomes the other.
 *   - **Saying plainly when nothing was delivered.** With EMAIL_PROVIDER
 *     unset, `sendEmail` resolves happily and prints a line. A script that
 *     reported that as success would be the exact thing it exists to catch.
 */

/*
  Exit on the next turn of the loop rather than from inside the promise.

  A bare `process.exit()` here aborts the process on Windows with
  `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` in libuv, because
  the HTTP connection the provider call just opened is still closing. The
  report has already printed at that point, so it looks like the tool crashed
  after telling you the answer — which is exactly the kind of noise that makes
  somebody stop trusting the answer.
*/
const exit = (code: number): void => {
  process.exitCode = code
  setTimeout(() => process.exit(code), 250).unref()
}

/** Never print a credential. Its length is enough to spot an empty variable. */
const shown = (value: string | undefined): string =>
  value && value.trim() ? `set, ${value.trim().length} characters` : 'NOT SET'

async function run(): Promise<void> {
  const to = process.argv[2]

  if (!to || !isDeliverableAddress(to)) {
    console.error('\nUsage: pnpm email:test <address>')
    console.error('  e.g. pnpm email:test you@yourdomain.com')
    if (to) console.error(`\n"${to}" is not an address this can send to.`)
    process.exit(1)
  }

  /*
    Read the configuration before booting Payload, so a bad variable is
    reported on its own rather than underneath a database connection.
  */
  let settings
  try {
    settings = resolveEmailSettings(process.env)
  } catch (error) {
    console.error(`\nEmail is misconfigured, and the site will not start:\n\n  ${String(error)}\n`)
    console.error('See docs/EMAIL.md for what each provider needs.')
    process.exit(1)
  }

  console.log('\nConfiguration')
  console.log(`  EMAIL_PROVIDER         ${settings.provider}`)
  console.log(`  EMAIL_FROM_ADDRESS     ${process.env.EMAIL_FROM_ADDRESS ?? 'NOT SET'}`)
  console.log(`  EMAIL_FROM_NAME        ${process.env.EMAIL_FROM_NAME ?? 'NOT SET'}`)
  console.log(`  EMAIL_REPLY_TO         ${process.env.EMAIL_REPLY_TO ?? 'NOT SET'}`)
  if (settings.provider === 'mailgun') {
    console.log(`  MAILGUN_DOMAIN         ${settings.domain}`)
    console.log(`  MAILGUN_REGION         ${settings.region}${settings.region === 'us' ? '  (the default — say eu if your domain is EU-hosted)' : ''}`)
    console.log(`  MAILGUN_API_KEY        ${shown(process.env.MAILGUN_API_KEY)}`)
  }
  if (settings.provider === 'resend') {
    console.log(`  RESEND_API_KEY         ${shown(process.env.RESEND_API_KEY)}`)
  }
  if (settings.provider === 'smtp') {
    console.log(`  SMTP_HOST              ${settings.host}:${settings.port}`)
    console.log(`  SMTP_SECURE            ${settings.secure}  (implicit TLS; false means STARTTLS)`)
    console.log(`  SMTP_USER              ${settings.user ?? 'NOT SET — unauthenticated relay'}`)
    console.log(`  SMTP_PASSWORD          ${shown(process.env.SMTP_PASSWORD)}`)
  }
  if (settings.overrideRecipient) {
    console.log(`  EMAIL_OVERRIDE_RECIPIENT ${settings.overrideRecipient}  (every message goes here instead)`)
  }

  /*
    Booting Payload is part of the test, not a means to it: an SMTP relay that
    refuses the credentials throws here, from the same code path `pnpm dev` and
    `pnpm build` run.

    Imported here rather than at the top of the file on purpose. A static
    import is hoisted, so `payload.config.ts` — which builds the adapter — runs
    before the first line of this script, and a plain "EMAIL_FROM_ADDRESS is
    not set" came out as a module-load stack trace with nothing above it. The
    check above has to happen first to be worth having.
  */
  const { default: config } = await import('../payload.config')
  const payload = await getPayload({ config })
  clearSenderCache()

  const stamp = new Date().toISOString()
  console.log(`\nSending to ${to} ...`)

  try {
    await payload.sendEmail({
      to,
      subject: 'Test message from the wiki network',
      text: `This is a test sent by "pnpm email:test" at ${stamp}. If it arrived, the ${settings.provider} configuration works.`,
      html: `<p>This is a test sent by <code>pnpm email:test</code> at ${stamp}.</p><p>If it arrived, the <strong>${settings.provider}</strong> configuration works. Try replying to it as well — the reply-to address is the one readers will use.</p>`,
    })
  } catch (error) {
    /*
      The provider's words, unedited, then the stack. `email-adapter.ts` puts
      Mailgun's message and the region hint into this string on purpose.
    */
    console.error('\nFAILED\n')
    console.error(`  ${error instanceof Error ? error.message : String(error)}\n`)
    if (error instanceof Error && error.stack) console.error(error.stack)
    console.error('\ndocs/EMAIL.md has a section on what each of these means.')
    return exit(1)
  }

  if (settings.provider === 'console') {
    console.error('\nNOT DELIVERED.')
    console.error(
      '\nEMAIL_PROVIDER is "console", which prints a message and throws it away. That is\nthe default so a fresh clone runs with no credentials — it is not a working\nmail setup. Set EMAIL_PROVIDER to mailgun, resend or smtp and run this again.',
    )
    return exit(1)
  }

  console.log('\nAccepted by the provider.')
  console.log(
    '\nAccepted is not the same as delivered. Check the inbox, and then the spam\nfolder, and then the provider’s own log — a message can be accepted and then\nbounced or suppressed, and only their log says so.',
  )
  return exit(0)
}

run().catch((error) => {
  console.error(error)
  exit(1)
})

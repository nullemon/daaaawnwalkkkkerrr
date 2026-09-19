import { getPayload } from 'payload'
import config from '@payload-config'
import { adminUrl } from '@/lib/admin-path'

/**
 * What this admin is, and what to do when the password is gone.
 *
 * Payload's login screen is a heading, two fields and a "forgot password"
 * link. That is enough for an app whose users were onboarded by somebody; it
 * is thin for a network whose admin has one account, lives at a path nobody
 * would guess, and is signed into from a phone at a train station six months
 * after it was set up.
 *
 * Three things go here and nothing else:
 *
 * - **Which site this is.** Ten hosts serve this admin and they all look the
 *   same at the login screen. The name comes from Site settings, so it is
 *   right after a rename.
 * - **That reader accounts are not editor accounts.** `players` and `users`
 *   are two auth collections with two reset flows, and a reader who lands
 *   here and tries their site password gets a refusal that explains nothing.
 *   The one sentence saves the support message.
 * - **Whether a reset can actually be delivered.** This is the part worth
 *   having: with no mail provider configured, Payload still shows "forgot
 *   password", still accepts the address, still says a message is on its way,
 *   and sends nothing. Saying so on the screen is the difference between a
 *   locked-out owner who knows to check `EMAIL_PROVIDER` and one who waits.
 *
 * The provider is read from the environment rather than from a setting
 * because that is where it lives \u2014 see `docs/EMAIL.md`.
 */
export default async function LoginNotice() {
  const payload = await getPayload({ config })
  const settings = (await payload.findGlobal({ slug: 'site-settings', depth: 0 })) as {
    siteName?: string | null
  }

  /*
    `console` is the default and means printed, not delivered: `pnpm email:test`
    exits non-zero on it for the same reason. Anything else has been chosen on
    purpose, so this says nothing about it.
  */
  const provider = (process.env.EMAIL_PROVIDER ?? 'console').trim().toLowerCase()
  const canDeliver = provider !== '' && provider !== 'console'

  return (
    <div className="net-login-notice">
      <p className="net-login-lead">
        The editor admin for {settings.siteName ?? 'this network'}. One account signs in to every
        wiki, the hub and both directories.
      </p>
      <p className="net-login-small">
        A reader account is not an editor account — if you signed up on the site itself, that
        password is for <code>/account</code>, not for here.
      </p>
      {canDeliver ? null : (
        <p className="net-login-warn">
          <strong>Password reset cannot send mail on this deployment.</strong> No mail provider is
          configured, so the reset form will accept your address and deliver nothing. Set{' '}
          <code>EMAIL_PROVIDER</code> before you need it — <code>docs/EMAIL.md</code> has the
          variables, and <code>pnpm email:test</code> proves it works.
        </p>
      )}
      <p className="net-login-small">
        Forgotten it? The reset link is below the form, and it arrives pointing at{' '}
        <code>{adminUrl('/reset')}</code> on the network&rsquo;s own domain.
      </p>
    </div>
  )
}

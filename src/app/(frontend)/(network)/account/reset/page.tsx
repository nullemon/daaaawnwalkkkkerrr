import type { Metadata } from 'next'
import { PageHeader } from '@/components/PageHeader'
import { ResetPasswordPanel } from '@/components/PasswordReset'

/**
 * Where a reader's password-reset link lands.
 *
 * Deliberately **not** `/admin/reset`. `players` and `users` are two auth
 * collections and their tokens are not interchangeable: the admin's reset view
 * resolves a token against `users`, so a reader sent there is told their token
 * is invalid on a page they cannot sign into. That was the live behaviour of
 * `POST /api/players/forgot-password`, which Payload exposes whether or not
 * anything links to it, for as long as `Players.ts` had no template.
 *
 * ## Why this page is on the hub and nowhere else
 *
 * `account` is in `APEX_ONLY` in `proxy.ts`, not `PASS_THROUGH`. On a wiki's
 * host `/account/reset` is rewritten to `/<game>/account/reset`, which does
 * not exist, so the page answers on the apex alone — and the link in the email
 * is absolute against `NEXT_PUBLIC_SITE_URL` for exactly that reason. A
 * root-relative link in that message would have been dead on nine hosts out of
 * ten. Making `account` pass through instead would put an empty sign-in panel
 * on eight wikis and the companies and people hosts, which is nine pages
 * nobody asked for and nine more URLs saying the same thing to a crawler.
 *
 * ## Why it is still static
 *
 * Everything public here prerenders, and this page does too: the token is read
 * from the URL *in the browser* and posted to `/api/players/reset-password`,
 * so the HTML is identical for every reader and there is nothing for a server
 * render to resolve. A dynamic `[token]` segment would have been the obvious
 * shape and is the wrong one twice over — it cannot be prerendered, and
 * `Beacon` posts `window.location.pathname` to `/api/hit` on every page view,
 * which would file a reset token as a page path in the analytics table.
 *
 * `noindex, nofollow`: there is nothing here for a crawler, and the one thing
 * that reaches this page is a single-use secret in a URL.
 */
export const metadata: Metadata = {
  title: 'Set a new password',
  description: 'Finish resetting the password on your reader account.',
  alternates: { canonical: '/account/reset' },
  robots: { index: false, follow: false },
}

export default function ResetPasswordPage() {
  return (
    <>
      <PageHeader
        eyebrow="Account"
        crumbs={[
          { label: 'Home', href: '/' },
          { label: 'Account', href: '/account' },
          { label: 'Reset password' },
        ]}
        title="Set a new password"
        lede="This is the reader account that syncs a run between your devices. Editor accounts reset inside the admin instead."
      />
      <div className="page body-main">
        <ResetPasswordPanel />
      </div>
    </>
  )
}

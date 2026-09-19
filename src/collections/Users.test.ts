import { describe, expect, it } from 'vitest'
import { Users } from './Users'
import { SESSION_COOKIE_DOMAIN } from '../lib/urls'

/**
 * The editor session cookie reaches every host on the network.
 *
 * ## What this is actually pinning
 *
 * Payload sets its session cookie with no `domain`, which makes it host-only:
 * an editor signed in at `dawnwalker.example.com` is anonymous at
 * `gta-6.example.com`. That was harmless until a public page started asking
 * who you are — `Confidence` renders its badge only for a signed-in editor,
 * and `useIsEditor` asks `/api/users/me` from the browser. On a host-only
 * cookie that answers "no" on fifteen of the sixteen hosts, so a feature
 * built for editors worked on one wiki at a time and gave no clue which.
 *
 * The wiring is three lines in `Users.ts` and it is exactly the kind of thing
 * that gets "tidied" by somebody who reads `auth` as boilerplate. Two of the
 * three are load-bearing and neither is obvious:
 *
 * 1. The spread is **conditional**. A browser handed a `Domain` it will not
 *    accept — `localhost`, a bare hostname, an IP — does not ignore the
 *    attribute, it discards the whole `Set-Cookie`. Passing `domain:
 *    undefined` unconditionally would log every developer out on the next
 *    request, with nothing in any log to say why.
 * 2. It comes from `SESSION_COOKIE_DOMAIN`, which is derived from
 *    `NEXT_PUBLIC_SITE_URL`, so the deployment's own domain decides it rather
 *    than a second copy of the domain living in this file.
 *
 * `cookieDomainFor` has its own tests for the rule itself. This one is about
 * whether the rule is plugged in, which no amount of testing the rule can say.
 */
describe('the editor session cookie', () => {
  it('carries a domain exactly when one can be accepted', () => {
    const cookies = (Users.auth as { cookies?: { domain?: string } } | undefined)?.cookies

    if (SESSION_COOKIE_DOMAIN) {
      expect(cookies?.domain).toBe(SESSION_COOKIE_DOMAIN)
    } else {
      /*
        The local case, and the one that matters most: no `cookies` key at all
        rather than one holding `undefined`. Both look the same in a config
        dump and only one of them keeps developers signed in.
      */
      expect(cookies).toBeUndefined()
    }
  })

  it('still signs people in the way it did before', () => {
    /* The change must not have disturbed the rest of the auth config. */
    expect(Users.auth).toBeTruthy()
    expect((Users.auth as { useAPIKey?: boolean }).useAPIKey).toBe(true)
    expect((Users.auth as { forgotPassword?: unknown }).forgotPassword).toBeTruthy()
  })
})

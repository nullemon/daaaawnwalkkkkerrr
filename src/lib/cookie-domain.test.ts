import { describe, expect, it } from 'vitest'
import { cookieDomainFor } from './urls'

/**
 * The editor session cookie's scope.
 *
 * Both directions matter here and they fail in opposite ways, which is the
 * shape `docs/NETWORK.md` calls the Antar 4 rule.
 *
 * **Too narrow** and the cookie stays host-only: an editor signed in on one
 * wiki is anonymous on the other fifteen, and the editor-only confidence badge
 * renders nowhere they were looking for it. That is the bug this was written
 * to fix.
 *
 * **Too broad** and it is worse than a bug. A browser handed a `Domain` it
 * will not accept — `localhost`, a bare hostname, an IP address — does not
 * ignore the attribute, it **discards the whole `Set-Cookie` header**. Every
 * editor is logged out on the next request, nothing errors, and nothing in any
 * log says why. So the local case is pinned as hard as the real one.
 */
describe('cookieDomainFor', () => {
  it('scopes a real domain so every subdomain shares one sign-in', () => {
    expect(cookieDomainFor('https://example.com')).toBe('example.com')
    expect(cookieDomainFor('https://vellum.gg')).toBe('vellum.gg')
  })

  it('reads the registrable domain off a subdomain origin', () => {
    /*
      The apex is what NEXT_PUBLIC_SITE_URL holds, but nothing stops somebody
      pointing it at a subdomain — a staging deployment on
      `staging.example.com` is the obvious one. Scoping to the host as given is
      right: it covers that host and anything under it, and does not reach up
      to siblings the deployment does not own.
    */
    expect(cookieDomainFor('https://staging.example.com')).toBe('staging.example.com')
  })

  it('sends nothing for localhost, where the attribute would be rejected', () => {
    expect(cookieDomainFor('http://localhost:3000')).toBeUndefined()
    expect(cookieDomainFor('http://dawnwalker.localhost:3000')).toBeUndefined()
  })

  it('sends nothing for a bare hostname', () => {
    /* A container name or an intranet host: one label, no parent to share. */
    expect(cookieDomainFor('http://vellum')).toBeUndefined()
    expect(cookieDomainFor('http://vellum:3000')).toBeUndefined()
  })

  it('sends nothing for an address', () => {
    expect(cookieDomainFor('http://127.0.0.1:3000')).toBeUndefined()
    expect(cookieDomainFor('http://192.168.1.40')).toBeUndefined()
    expect(cookieDomainFor('http://[::1]:3000')).toBeUndefined()
  })

  it('sends nothing rather than throwing on a value that is not a URL', () => {
    /*
      `NEXT_PUBLIC_SITE_URL` is typed by nobody. A missing scheme is the
      ordinary mistake, and the safe answer is the one that leaves the cookie
      working exactly as it does today.
    */
    expect(cookieDomainFor('example.com')).toBeUndefined()
    expect(cookieDomainFor('')).toBeUndefined()
  })

  it('returns no leading dot', () => {
    /*
      The RFC 2109 form. Every `Set-Cookie` parser strips it, and Payload
      passes this value through untouched, so sending one would only show up as
      an odd-looking header.
    */
    expect(cookieDomainFor('https://example.com')?.startsWith('.')).toBe(false)
  })
})

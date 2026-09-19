/**
 * Links that cross from a wiki to the hub.
 *
 * Every wiki is its own origin, so a link from `dawnwalker.example.com` to the
 * contributor index or the privacy policy is a link to a different host. Those
 * pages exist once, at the apex, because seven copies of a privacy policy is
 * seven pages competing for the same search and one of them being out of date.
 *
 * `NEXT_PUBLIC_SITE_URL` rather than Site Settings, because this is needed in
 * client components too and a database read is not available there. It is
 * already a hard requirement for the network: `proxy.ts` refuses to infer the
 * domain from the Host header, since inferring it is how a site becomes
 * routable as whatever domain an attacker sends.
 */

export const HUB_ORIGIN = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(
  /\/$/,
  '',
)

/**
 * An absolute URL to a page on the hub.
 *
 * Use a plain `<a>` with these, not `next/link` — there is no client-side
 * navigation to be had across origins, and `Link` would add a prefetch that
 * cannot work.
 */
export const hub = (path: string): string => `${HUB_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`

/**
 * An absolute URL on the companies host.
 *
 * `companies.<network domain>` carries the studio and publisher profiles. It
 * is a sibling of the wikis rather than a section of the hub, so a link to it
 * from anywhere - a wiki, the hub, another company - crosses an origin and
 * wants a plain `<a>` for the same reason `hub()` does.
 *
 * Built from the network domain rather than hardcoded, so a deployment that
 * changes domain does not leave every studio link pointing at the old one.
 */
export const COMPANIES_ORIGIN = (() => {
  try {
    const url = new URL(HUB_ORIGIN)
    url.host = `companies.${url.host}`
    return url.origin
  } catch {
    return HUB_ORIGIN
  }
})()

export const companyUrl = (path = '/'): string =>
  `${COMPANIES_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`

/**
 * An absolute URL on the people host.
 *
 * `people.<network domain>` carries one page per director, designer, composer
 * and actor. Same shape as the companies host and for the same reason: a
 * composer scored two of these games and an actor is in three, so the page is
 * worth more as one record than as three copies that disagree the first time
 * one is corrected. It is a sibling of the wikis rather than a section of the
 * hub, so a link to it from anywhere crosses an origin and wants a plain `<a>`.
 *
 * Built from the network domain rather than hardcoded, so a deployment that
 * changes domain does not leave every credit pointing at the old one.
 */
export const PEOPLE_ORIGIN = (() => {
  try {
    const url = new URL(HUB_ORIGIN)
    url.host = `people.${url.host}`
    return url.origin
  } catch {
    return HUB_ORIGIN
  }
})()

export const personUrl = (path = '/'): string =>
  `${PEOPLE_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`

/**
 * A value a record calls a website, as a link — or nothing.
 *
 * `website` is free text harvested from an infobox, and an infobox is not a
 * validator. Three of the eight people who have one hold a bare domain
 * ("olivierderiviere.com"), one holds two domains separated by a space, and
 * `/com2us` holds the words **"Official website"** — the link's own label,
 * scraped instead of its target. Every one of those was rendered straight into
 * an `href`, which makes it *relative*: the "Official site" button at the top
 * of a real company's profile resolved to
 * `companies.<domain>/Official%20website` and answered 404, and so did the
 * Website row on three living people's profiles. A styled control that goes
 * nowhere is worse than no control, because a reader cannot tell it is broken
 * until they press it.
 *
 * Only an absolute http(s) URL comes back. A bare domain is deliberately left
 * out rather than repaired with a scheme: guessing `https://` is guessing, it
 * does not rescue the two-domains-in-one-field case anyway, and the fix for
 * those records belongs in the record. Call sites print the raw value as text
 * where a reader is owed what the source said, and render no link at all.
 */
export const externalSite = (value?: string | null): string | null => {
  const text = (value ?? '').trim()
  if (!text) return null
  try {
    const url = new URL(text)
    return url.protocol === 'http:' || url.protocol === 'https:' ? text : null
  } catch {
    return null
  }
}

/**
 * The domain a session cookie should be scoped to, or nothing.
 *
 * ## Why this exists
 *
 * Payload sets its session cookie without a `domain`, which makes it
 * **host-only**: signing in at `dawnwalker.example.com/admin1621` produces a
 * cookie that `gta-6.example.com` cannot read. That was harmless while nothing
 * on a public page asked who you were.
 *
 * The confidence rating is now an editorial control — `Confidence` in
 * `src/components/Badges.tsx` renders it only for a signed-in editor, and
 * `useIsEditor` asks `/api/users/me` from the browser. On a host-only cookie
 * that question answers "no" on all sixteen hosts except the one the editor
 * happened to sign in on, so a feature meant for editors would work on one
 * wiki at a time and the editor would have no way to tell which.
 *
 * ## Why widening it is not a widening of trust
 *
 * Every host on this network — the apex, fifteen wiki subdomains, `companies`
 * and `people` — is the same Next application talking to the same Payload
 * instance. There is no other party under this domain to read the cookie, and
 * `NETWORK_SUBDOMAINS` plus the host-label check in `Games.ts` are what stop a
 * wiki slug ever becoming a host somebody else controls. What changes is that
 * one sign-in covers the network, which is what an editor already expects from
 * one admin and one account system.
 *
 * ## Why it is inert locally, and must stay inert
 *
 * Browsers refuse a `Domain` attribute on a host with no registrable parent —
 * `localhost` is one, and so is a bare hostname or an IP address. Sending one
 * anyway does not fail loudly; the browser **drops the whole Set-Cookie
 * header**, which would log every editor out of development with nothing in
 * any log to say why. So this returns nothing unless the site URL names a host
 * with at least two labels and no digits-only final label.
 *
 * Returned without a leading dot. That form is the modern one and every
 * browser treats it as covering subdomains; the leading dot is a relic of
 * RFC 2109 that `Set-Cookie` parsers strip anyway.
 */
export const cookieDomainFor = (origin: string): string | undefined => {
  let host: string
  try {
    host = new URL(origin).hostname
  } catch {
    return undefined
  }

  /* An IPv4 address, or an IPv6 literal, has no parent to share with. */
  if (/^\d+(\.\d+){3}$/.test(host) || host.includes(':')) return undefined

  const labels = host.split('.')
  if (labels.length < 2) return undefined
  if (/^\d+$/.test(labels[labels.length - 1])) return undefined
  if (host === 'localhost' || host.endsWith('.localhost')) return undefined

  return host
}

export const SESSION_COOKIE_DOMAIN = cookieDomainFor(HUB_ORIGIN)

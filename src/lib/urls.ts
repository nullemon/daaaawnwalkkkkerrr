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

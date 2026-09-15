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

import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { siteUrl } from '@/lib/payload'
import { subdomainOf } from '@/proxy'

/**
 * robots.txt, answered per host.
 *
 * Every wiki is its own origin, so each needs its own robots.txt pointing at
 * its own sitemap. One file listing seven sitemaps on seven hosts would be a
 * cross-host sitemap reference, which engines only honour when all of them are
 * verified under the same property — not something to depend on.
 *
 * Reading the Host header makes this route dynamic, which is the one exception
 * to the site being wholly prerendered and is worth it: it is a few hundred
 * bytes served a handful of times a day, and the alternative is a static file
 * that is wrong on six hosts out of seven.
 *
 * Two jobs otherwise, unchanged: keep crawlers out of things that are not
 * content, and point them at the sitemap. Everything disallowed below is an
 * interface, a machine endpoint, or a form with nothing to read — pages that
 * can never rank and would spend crawl budget the real pages need.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const network = await siteUrl()
  const host = (await headers()).get('host') ?? new URL(network).host

  // Whatever host actually asked. Falling back to the network origin keeps
  // this correct when something fetches it without a Host header.
  const scheme = new URL(network).protocol
  const origin = `${scheme}//${host}`
  const isWiki = subdomainOf(host, new URL(network).host) !== null

  const notContent = [
    '/admin',
    '/api/',
    '/corrections',
    '/requests',
    '/account',
    /*
      Every query string on this network is interface state, never a page.

      Worth stating what was checked rather than leaving it as a rule of
      thumb, because the same pattern hides real pages on most sites. No
      route under `(frontend)` reads `searchParams` — `DataTable`'s filters,
      its sort and `SearchBox` all live in React state and never touch the
      address bar, there is no paginated index anywhere, and nothing is
      served at two URLs one of which carries a token.

      What does use one is the build planner's share link,
      `/tools/build-planner?perks=a,b,c`. That is forty perks' worth of
      combinations of one page whose canonical form is already listed in the
      sitemap, and it is the reason to keep this line rather than a reason to
      drop it. The planner itself stays crawlable; its permutations do not.

      This costs nothing to the images either: uploads are served from
      `/api/media/file/...` with no query, and nothing here uses `next/image`,
      whose `/_next/image?url=…` form this pattern would have blocked.
    */
    '/*?',
  ]

  return {
    rules: [
      {
        userAgent: '*',
        /*
          The image half of `/api/`, carved back out of the line below it.

          Payload serves every upload from `/api/media/file/<filename>` — it
          has no `staticURL` set, so that is the whole image library: key art,
          company logos, person photographs, guide pictures and achievement
          icons. `Disallow: /api/` was written about the REST endpoints and
          took all of it with them, which meant that until now no crawler was
          permitted to fetch a single picture on this network. Nothing
          reported it: images blocked by robots.txt are simply absent from
          image search, and absence is what a new site looks like anyway.

          It matters more now that the sitemap carries `<image:image>`: listing
          a picture a crawler is forbidden to fetch is a sitemap asking for
          something it also refuses, which is the contradiction the noindex
          filter in `sitemap.ts` exists to prevent, arriving from the other
          side.

          RFC 9309, Google and Bing all resolve a conflict by the longest
          matching pattern, so this beats `/api/` for these URLs and only
          these. The REST API stays shut.

          `Allow: /` used to sit in front of it and is gone, which is not
          tidying. Under longest-match it is a no-op — a path with no matching
          `Disallow` is already allowed. Plenty of parsers predate that rule
          and take the *first* match instead, and under those `Allow: /` is the
          first match for every URL on the site, so it silently cancelled all
          six lines below it. Python's `urllib.robotparser` is one of them: fed
          the old file it reported `/admin` as crawlable, and fed this one it
          does not. Dropping the line is correct under both readings, and the
          one prefix left still lands above `/api/`, which is the order a
          first-match parser needs.
        */
        allow: '/api/media/file/',
        disallow: notContent,
      },
      {
        // Commercial link-graph crawlers. No search traffic comes from them.
        userAgent: ['AhrefsBot', 'SemrushBot', 'DotBot', 'MJ12bot', 'PetalBot'],
        disallow: '/',
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
    // Naming the canonical host stops a wiki reachable at more than one name
    // from being indexed twice. On the apex this is the network itself.
    host: isWiki ? origin : network,
  }
}

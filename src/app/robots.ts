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
    // Query strings on index pages are filter state, not distinct pages, and
    // indexing them would bury the canonical index under its own permutations.
    '/*?',
  ]

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
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

import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/payload'

/**
 * robots.txt.
 *
 * Two jobs: keep crawlers out of things that are not content, and point them
 * at the sitemap. Everything disallowed below is either an interface (the
 * admin), a machine endpoint (the API), or a form with nothing to read — pages
 * that can never rank and would spend crawl budget that the four-hundred-odd
 * real pages need.
 *
 * The aggressive SEO scrapers get their own block. They are not search engines,
 * they crawl far harder than one, and nothing is lost by refusing them.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = await siteUrl()

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
    sitemap: `${base}/sitemap.xml`,
    host: base,
  }
}

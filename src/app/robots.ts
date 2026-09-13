import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/payload'

export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = await siteUrl()
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // The admin and the API are not content; keeping crawlers out of them
        // saves crawl budget for the pages that can actually rank.
        disallow: ['/admin', '/api/', '/corrections'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  }
}

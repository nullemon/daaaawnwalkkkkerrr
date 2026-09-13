import { getAll, getSiteSettings, siteUrl } from '@/lib/payload'
import type { Guide, Build, Ending } from '@/payload-types'

export const dynamic = 'force-static'

type FeedItem = { title: string; path: string; summary: string; date: string }

const escape = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/**
 * RSS for people who follow guide sites in a reader — a small audience, but a
 * committed one, and the feed is also how aggregators discover new pages
 * faster than a crawl would.
 */
export async function GET(): Promise<Response> {
  const [settings, base, guides, builds, endings] = await Promise.all([
    getSiteSettings(),
    siteUrl(),
    getAll<Guide>('guides', { depth: 0, sort: '-updatedAt', limit: 30 }),
    getAll<Build>('builds', { depth: 0, sort: '-updatedAt', limit: 30 }),
    getAll<Ending>('endings', { depth: 0, sort: '-updatedAt', limit: 10 }),
  ])

  const items: FeedItem[] = [
    ...guides.map((doc) => ({
      title: doc.title,
      path: `/guides/${doc.slug}`,
      summary: doc.summary ?? '',
      date: doc.updatedAt,
    })),
    ...builds.map((doc) => ({
      title: `Build: ${doc.title}`,
      path: `/builds/${doc.slug}`,
      summary: doc.summary ?? '',
      date: doc.updatedAt,
    })),
    ...endings.map((doc) => ({
      title: `Ending: ${doc.title}`,
      path: `/endings/${doc.slug}`,
      summary: doc.summary ?? '',
      date: doc.updatedAt,
    })),
  ]
    .filter((item) => Boolean(item.date))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 40)

  const updated = items[0]?.date ?? new Date().toISOString()

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escape(settings.siteName)}</title>
    <link>${base}</link>
    <description>${escape(settings.description || settings.tagline)}</description>
    <language>en</language>
    <lastBuildDate>${new Date(updated).toUTCString()}</lastBuildDate>
    <atom:link href="${base}/feed.xml" rel="self" type="application/rss+xml" />
${items
  .map(
    (item) => `    <item>
      <title>${escape(item.title)}</title>
      <link>${base}${item.path}</link>
      <guid isPermaLink="true">${base}${item.path}</guid>
      <description>${escape(item.summary)}</description>
      <pubDate>${new Date(item.date).toUTCString()}</pubDate>
    </item>`,
  )
  .join('\n')}
  </channel>
</rss>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}

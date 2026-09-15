import { getPublishedGames } from '@/lib/payload'
import { escapeXml, feedFor } from '@/lib/feed'

export const dynamic = 'force-static'

export async function generateStaticParams() {
  const games = await getPublishedGames()
  return games.map((game) => ({ game: game.slug }))
}

/**
 * RSS for people who follow guide sites in a reader — a small audience, but a
 * committed one, and the feed is also how aggregators discover new pages
 * faster than a crawl would.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ game: string }> },
): Promise<Response> {
  const { game } = await params
  const feed = await feedFor(game)
  if (!feed) return new Response('Not found', { status: 404 })

  const { base, title, description, items, updated } = feed

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${base}</link>
    <description>${escapeXml(description)}</description>
    <language>en</language>
    <lastBuildDate>${new Date(updated).toUTCString()}</lastBuildDate>
    <atom:link href="${base}/feed.xml" rel="self" type="application/rss+xml" />
${items
  .map(
    (item) => `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${base}${item.path}</link>
      <guid isPermaLink="true">${base}${item.path}</guid>
      <description>${escapeXml(item.summary)}</description>
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

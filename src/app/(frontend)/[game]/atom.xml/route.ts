import { getPublishedGames } from '@/lib/payload'
import { escapeXml, feedFor } from '@/lib/feed'

export const dynamic = 'force-static'

export async function generateStaticParams() {
  const games = await getPublishedGames()
  return games.map((game) => ({ game: game.slug }))
}

/**
 * Atom alongside RSS.
 *
 * Both are declared in the wiki's metadata so a reader auto-discovers
 * whichever it prefers, and they carry the same items from `lib/feed.ts` —
 * only the envelope differs.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ game: string }> },
): Promise<Response> {
  const { game } = await params
  const feed = await feedFor(game)
  if (!feed) return new Response('Not found', { status: 404 })

  const { base, title, description, items } = feed
  const updated = new Date(feed.updated).toISOString()

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${escapeXml(title)}</title>
  <subtitle>${escapeXml(description)}</subtitle>
  <link href="${base}/atom.xml" rel="self" type="application/atom+xml" />
  <link href="${base}" rel="alternate" type="text/html" />
  <id>${base}/</id>
  <updated>${updated}</updated>
${items
  .map(
    (item) => `  <entry>
    <title>${escapeXml(item.title)}</title>
    <link href="${base}${item.path}" rel="alternate" type="text/html" />
    <id>${base}${item.path}</id>
    <updated>${new Date(item.date).toISOString()}</updated>
    <summary>${escapeXml(item.summary)}</summary>
  </entry>`,
  )
  .join('\n')}
</feed>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/atom+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}

import { getAll, getSiteSettings, siteUrl } from '@/lib/payload'
import type { Build, Ending, Guide } from '@/payload-types'

export const dynamic = 'force-static'

type FeedItem = { title: string; path: string; summary: string; date: string }

const escape = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/**
 * Atom, alongside the RSS at /feed.xml.
 *
 * The same items in both formats rather than one or the other: RSS is what most
 * readers still speak, Atom is better specified and is what several aggregators
 * and IndexNow-style services prefer. Serving both costs one more static file
 * and removes a reason for anything not to subscribe.
 *
 * Both are declared in the document head, so a reader that auto-discovers will
 * find whichever it prefers.
 */
export async function GET(): Promise<Response> {
  const [settings, base, guides, builds, endings] = await Promise.all([
    getSiteSettings(),
    siteUrl(),
    getAll<Guide>('guides', { depth: 0, sort: '-updatedAt', limit: 40 }),
    getAll<Build>('builds', { depth: 0, sort: '-updatedAt', limit: 20 }),
    getAll<Ending>('endings', { depth: 0, sort: '-updatedAt', limit: 10 }),
  ])

  const items: FeedItem[] = [
    ...guides.map((doc) => ({
      title: doc.title,
      path: `/guides/${doc.slug}`,
      summary: doc.seo?.description ?? doc.summary ?? '',
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
    .slice(0, 50)

  const updated = new Date(items[0]?.date ?? Date.now()).toISOString()

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${escape(settings.siteName)}</title>
  <subtitle>${escape(settings.description || settings.tagline)}</subtitle>
  <link href="${base}/atom.xml" rel="self" type="application/atom+xml" />
  <link href="${base}" rel="alternate" type="text/html" />
  <id>${base}/</id>
  <updated>${updated}</updated>
${items
  .map(
    (item) => `  <entry>
    <title>${escape(item.title)}</title>
    <link href="${base}${item.path}" rel="alternate" type="text/html" />
    <id>${base}${item.path}</id>
    <updated>${new Date(item.date).toISOString()}</updated>
    <summary>${escape(item.summary)}</summary>
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

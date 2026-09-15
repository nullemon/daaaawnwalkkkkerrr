import { getAll, getPublishedGames } from '@/lib/payload'
import { SECTIONS } from '@/lib/sections'

export const dynamic = 'force-static'

export async function generateStaticParams() {
  const games = await getPublishedGames()
  return games.map((game) => ({ game: game.slug }))
}

/**
 * Every searchable record on one wiki, flattened, built once at build time.
 *
 * Per game rather than per network on purpose. A reader searching on the
 * Onimusha wiki is looking for something in Onimusha, and a shared index would
 * make them read past six games' worth of near-misses to find it. The hub has
 * its own cross-game search for the other case.
 *
 * Keys are one letter because this file is downloaded by every visitor who
 * opens the search box, and at four hundred records the field names are a
 * meaningful share of the bytes.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ game: string }> },
): Promise<Response> {
  const { game } = await params
  const rows: { t: string; u: string; k: string; s: string }[] = []

  for (const section of SECTIONS) {
    const docs = await getAll(section.collection, { game, depth: 0 })
    for (const doc of docs) {
      rows.push({
        t: doc.title,
        u: `${section.href}/${doc.slug}`,
        k: section.kind,
        s: (doc.summary ?? '').slice(0, 160),
      })
    }
  }

  return new Response(JSON.stringify(rows), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
  })
}

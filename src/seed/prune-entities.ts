import 'dotenv/config'
import { getPayload } from 'payload'
import config from '../payload.config'
import { GAME_SCOPED } from '../lib/tenancy'
import { isNotAnEntity } from '../lib/harvest'

/**
 * Delete harvested records that the entity importer would no longer write.
 *
 *   pnpm seed:prune-entities
 *
 * The same reason `seed:prune` exists for guides: the import upserts and never
 * deletes, so tightening its filter does nothing to the records the loose
 * filter already wrote. They stay in the database, in the sitemap, indexed.
 *
 * What the loose filter wrote was thirteen Regions that are not places — the
 * Gears of War film, the Gears of War TV series, the Silent Hill pachislot
 * machine, four other Silent Hill games — each with a composed summary reading
 * "<name>, a location in <game>". Every one had a real source URL, because the
 * wiki page it came from is real. Only the kind of thing was wrong.
 *
 * Matches on `isNotAnEntity`, the same guard the importer now uses, so this
 * can only ever remove what that guard rejects. A record with no source URL is
 * left alone: it did not come from a harvest and is not this pass's business.
 */
async function run(): Promise<void> {
  const payload = await getPayload({ config })

  const games = await payload.find({ collection: 'games', limit: 100, depth: 0 })
  const gameSlug = new Map<string | number, string>()
  const gameTitle = new Map<string | number, string>()
  for (const game of games.docs) {
    gameSlug.set(game.id, String(game.slug))
    gameTitle.set(game.id, String(game.title))
  }

  let removed = 0
  const kept: string[] = []

  for (const collection of GAME_SCOPED) {
    // Guides are written by the generators, not harvested; `seed:prune` owns
    // those and matches on their generated titles.
    if (collection === 'guides') continue

    const docs = await payload.find({ collection, limit: 10000, depth: 0 })
    for (const doc of docs.docs as unknown as {
      id: string | number
      slug?: string
      title?: string
      game?: unknown
      sources?: { url?: string | null }[] | null
    }[]) {
      const url = doc.sources?.[0]?.url
      if (!url) continue

      const title = gameTitle.get(doc.game as string | number) ?? ''
      if (!isNotAnEntity({ title: String(doc.title ?? ''), url }, title)) continue

      const where = gameSlug.get(doc.game as string | number) ?? '?'
      kept.push(`  ${collection}/${String(doc.slug)} [${where}] ${url}`)
      await payload.delete({ collection, id: doc.id })
      removed += 1
    }
  }

  for (const row of kept) console.log(row)
  console.log(
    removed === 0
      ? '\nnothing to prune — no harvested record looks like a work rather than a thing in one'
      : `\npruned ${removed} record${removed === 1 ? '' : 's'} that are not things in the game`,
  )
  process.exit(0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})

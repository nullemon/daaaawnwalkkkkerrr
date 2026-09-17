import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getPayload } from 'payload'
import config from '../payload.config'
import { GAME_SCOPED } from '../lib/tenancy'
import { isNotAnEntity, isNotAPlace } from '../lib/harvest'

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
 *
 * ## Why it re-reads the raw harvest
 *
 * A record in the database carries its title and its source URL and nothing
 * else the guard can read. That was enough while every rule was about the
 * name — a numbered sequel, a parenthesised work — and stopped being enough
 * the moment one of them was about the wiki's own categories: three actors
 * were live as *characters* because the page that names them also names the
 * part they play, and neither the title nor the URL says so. The raw harvest
 * still holds the categories and the infobox, so the guard is given what it
 * was given at import time rather than a thinner version of it.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url))
const HARVEST = path.join(HERE, 'raw', 'wiki-entities')

type RawEntity = {
  title?: string
  collection?: string
  categories?: string[]
  facts?: Record<string, string>
}

/** Every harvested entity, keyed `<game slug>|<lower-cased title>`. */
const readHarvest = (): Map<string, RawEntity> => {
  const index = new Map<string, RawEntity>()
  if (!fs.existsSync(HARVEST)) return index
  for (const file of fs.readdirSync(HARVEST)) {
    if (!file.endsWith('.json')) continue
    const slug = file.replace(/\.json$/, '')
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(HARVEST, file), 'utf8'))
      for (const entity of parsed.entities ?? []) {
        if (!entity?.title) continue
        index.set(`${slug}|${String(entity.title).trim().toLowerCase()}`, entity)
      }
    } catch {
      /* A harvest file that will not parse is a fetch problem, not a prune
         problem. Skipping it means this pass removes less, never more. */
    }
  }
  return index
}
async function run(): Promise<void> {
  const payload = await getPayload({ config })

  const games = await payload.find({ collection: 'games', limit: 100, depth: 0 })
  const gameSlug = new Map<string | number, string>()
  const gameTitle = new Map<string | number, string>()
  for (const game of games.docs) {
    gameSlug.set(game.id, String(game.slug))
    gameTitle.set(game.id, String(game.title))
  }

  const harvest = readHarvest()
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
      const where = gameSlug.get(doc.game as string | number) ?? '?'
      const raw = harvest.get(`${where}|${String(doc.title ?? '').trim().toLowerCase()}`)
      const candidate = {
        title: String(doc.title ?? ''),
        url,
        categories: raw?.categories ?? null,
        facts: raw?.facts ?? null,
      }
      /*
        An event filed as a place.

        Deleted rather than kept, on the same reasoning as the Gears of War
        film: it is a real thing in the game, it is not the kind of thing this
        collection holds, and there is no collection that does hold it. The
        research is not lost - `src/seed/raw/wiki-entities/` still has the page,
        its categories and its infobox, so the day an events collection exists
        these five come back from the harvest rather than from anybody's
        memory. What is lost by keeping them is a page reading "Hiss invasion,
        a location in Control Resonant", which is a false sentence on a public
        page.
      */
      const notAPlace = collection === 'regions' && isNotAPlace(candidate)
      if (!notAPlace && !isNotAnEntity(candidate, title)) continue

      kept.push(`  ${collection}/${String(doc.slug)} [${where}] ${url}`)
      await payload.delete({ collection, id: doc.id })
      removed += 1
    }
  }

  // --- duplicate titles ---------------------------------------------------
  /*
    The importer now keeps one record per title, preferring the article whose
    URL names this game - the franchise wiki carries both "Kyoto" and "Kyoto
    (Onimusha: Way of the Sword)" and both used to arrive, the second as
    `kyoto-2`. Tightening that filter does nothing to the pair already
    written, so the duplicate is removed here on the same rule.
  */
  let merged = 0
  for (const collection of GAME_SCOPED) {
    if (collection === 'guides') continue
    const docs = await payload.find({ collection, limit: 10000, depth: 0 })
    const byTitle = new Map<string, { id: string | number; slug?: string; url: string }[]>()
    for (const doc of docs.docs as unknown as {
      id: string | number
      slug?: string
      title?: string
      game?: unknown
      sources?: { url?: string | null }[] | null
    }[]) {
      const url = doc.sources?.[0]?.url
      if (!url) continue
      const key = `${String(doc.game)}::${String(doc.title ?? '').trim().toLowerCase()}`
      if (!byTitle.has(key)) byTitle.set(key, [])
      byTitle.get(key)!.push({ id: doc.id, slug: doc.slug, url: String(url) })
    }

    for (const [key, group] of byTitle) {
      if (group.length < 2) continue
      const gameId = key.split('::')[0]
      const title = (gameTitle.get(gameId as string) ?? gameTitle.get(Number(gameId)) ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9 ]+/g, ' ')
        .split(/\s+/)
        .filter((word) => word.length > 3)

      const namesGame = (url: string) => {
        const lower = decodeURIComponent(url).toLowerCase()
        return title.length > 0 && title.every((word) => lower.includes(word))
      }

      const keep = group.find((row) => namesGame(row.url)) ?? group[0]
      for (const row of group) {
        if (row.id === keep.id) continue
        kept.push(`  ${collection}/${String(row.slug)} duplicate of ${String(keep.slug)}`)
        await payload.delete({ collection, id: row.id })
        merged += 1
      }
    }
  }

  for (const row of kept) console.log(row)
  const parts: string[] = []
  if (removed > 0) parts.push(`${removed} that are not things in the game`)
  if (merged > 0) parts.push(`${merged} duplicate title${merged === 1 ? '' : 's'}`)
  console.log(
    parts.length === 0
      ? '\nnothing to prune — no harvested record looks like a work, and no title appears twice'
      : `\npruned ${parts.join(' and ')}`,
  )
  process.exit(0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})

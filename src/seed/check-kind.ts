import 'dotenv/config'
import { getPayload } from 'payload'
import config from '../payload.config'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { GAME_SCOPED } from '../lib/tenancy'
import { isNotAnEntity, isNotAPlace } from '../lib/harvest'

/**
 * Is each record the kind of thing it is filed as?
 *
 *   pnpm check:kind
 *
 * Every other check here counts rows or renders pages. `pnpm verify` asks
 * whether a record belongs to a game, the build asks whether a page renders,
 * and both were green while the Gears of War *film* sat in `regions` with a
 * composed summary reading "Gears of War, a location in Gears E-Day". The page
 * rendered beautifully. The row had a real source URL, because the wiki page
 * it came from is real. Only the shelf was wrong, and nothing was looking at
 * the shelf.
 *
 * Two tiers, and the split is the point:
 *
 *   **Wrong.** The wiki's own URL says the page is a film, a soundtrack or a
 *   sequel; or a company that this network already has a profile for is filed
 *   as a place; or one title appears twice for the same game. These are
 *   mechanical and exit non-zero.
 *
 *   **Worth a look.** A title that reads like a work or a studio but has
 *   nothing in the URL to confirm it. These are printed and never fail the
 *   run, because the pattern that produced this tier once flagged
 *   `b1-series-battle-droid` - a real enemy - for containing "series", and an
 *   earlier version of the delete rule removed Antar 4, a real moon, for
 *   ending in a digit. A check that deletes on a guess is worse than the bug
 *   it is catching.
 */

const LOOKS_LIKE_A_WORK =
  /\b(soundtrack|original score|comics?|books?|novels?|novella|manga|anthology|artbook|magazine|trading cards?|merchandise|board game|card game|documentary|timeline|wiki|category|template|gallery)\b/i

const LOOKS_LIKE_A_COMPANY =
  /\b(interactive|entertainment|studios?|software|productions?|publishing|technologies)\b\s*$/i

type Finding = { level: 'wrong' | 'review'; line: string }

/*
  The wiki's own categories and infobox, which the database does not keep.

  Two of the rules here are about what a page *is* rather than what it is
  called, and neither a title nor a source URL carries that. The raw harvest
  still does, so the guards get what they were given at import time instead of
  a thinner version of it - the same reason `prune-entities` re-reads it.
*/
const HERE = path.dirname(fileURLToPath(import.meta.url))
const HARVEST = path.join(HERE, 'raw', 'wiki-entities')

type RawEntity = { title?: string; categories?: string[]; facts?: Record<string, string> }

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
      /* A harvest file that will not parse means fewer findings, never more. */
    }
  }
  return index
}

async function run(): Promise<void> {
  const payload = await getPayload({ config })
  const findings: Finding[] = []
  const harvest = readHarvest()

  const games = await payload.find({ collection: 'games', limit: 100, depth: 0 })
  const gameSlug = new Map<string | number, string>()
  const gameTitle = new Map<string | number, string>()
  for (const game of games.docs as unknown as {
    id: string | number
    slug: string
    title: string
  }[]) {
    gameSlug.set(game.id, game.slug)
    gameTitle.set(game.id, game.title)
  }

  // Companies the network already knows about, by name.
  const known = new Set<string>()
  try {
    const companies = await payload.find({ collection: 'companies', limit: 1000, depth: 0 })
    for (const company of companies.docs as unknown as { name: string }[]) {
      known.add(company.name.trim().toLowerCase())
    }
  } catch {
    // The collection may not exist yet on an older database.
  }

  for (const collection of GAME_SCOPED) {
    if (collection === 'guides') continue

    const docs = await payload.find({ collection, limit: 10000, depth: 0 })
    const byTitle = new Map<string, string[]>()

    for (const doc of docs.docs as unknown as {
      slug?: string
      title?: string
      game?: unknown
      sources?: { url?: string | null }[] | null
    }[]) {
      const title = String(doc.title ?? '').trim()
      const where = `${collection}/${String(doc.slug)} [${gameSlug.get(doc.game as string | number) ?? '?'}]`
      const url = doc.sources?.[0]?.url

      const key = `${String(doc.game)}::${title.toLowerCase()}`
      if (!byTitle.has(key)) byTitle.set(key, [])
      byTitle.get(key)!.push(String(doc.slug))

      if (!url) continue

      const slug = gameSlug.get(doc.game as string | number) ?? '?'
      const raw = harvest.get(`${slug}|${title.toLowerCase()}`)
      const candidate = {
        title,
        url,
        categories: raw?.categories ?? null,
        facts: raw?.facts ?? null,
      }

      // --- wrong: the record is a place, and the page is an event ---------
      if (collection === 'regions' && isNotAPlace(candidate)) {
        findings.push({
          level: 'wrong',
          line: `${where} "${title}" is an event, not a place — ${(raw?.categories ?? []).join(', ')}`,
        })
        continue
      }

      // --- wrong: the wiki's own URL says what it is ----------------------
      if (isNotAnEntity(candidate, gameTitle.get(doc.game as string | number) ?? '')) {
        findings.push({ level: 'wrong', line: `${where} "${title}" — ${url}` })
        continue
      }

      // --- wrong: we have a company profile for this exact name -----------
      if (known.has(title.toLowerCase())) {
        findings.push({
          level: 'wrong',
          line: `${where} "${title}" is a company with its own profile`,
        })
        continue
      }

      // --- review: reads like a work or a studio --------------------------
      if (LOOKS_LIKE_A_WORK.test(title) || LOOKS_LIKE_A_COMPANY.test(title)) {
        findings.push({ level: 'review', line: `${where} "${title}"` })
      }
    }

    for (const [key, slugs] of byTitle) {
      if (slugs.length < 2) continue
      findings.push({
        level: 'wrong',
        line: `${collection} "${key.split('::')[1]}" appears ${slugs.length} times: ${slugs.join(', ')}`,
      })
    }
  }

  const wrong = findings.filter((f) => f.level === 'wrong')
  const review = findings.filter((f) => f.level === 'review')

  if (wrong.length > 0) {
    console.log(`\nwrong (${wrong.length})`)
    for (const f of wrong) console.log(`  ${f.line}`)
  }
  if (review.length > 0) {
    console.log(`\nworth a look (${review.length}) — read these, do not bulk-delete them`)
    for (const f of review) console.log(`  ${f.line}`)
  }
  if (findings.length === 0) {
    console.log('\nevery record looks like the kind of thing it is filed as.')
  }

  console.log(
    `\n${wrong.length} wrong, ${review.length} worth a look.` +
      (wrong.length > 0 ? ' Run `pnpm seed:prune-entities` for the mechanical ones.' : ''),
  )
  process.exit(wrong.length > 0 ? 1 : 0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})

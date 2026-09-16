import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { getPayload } from 'payload'
import config from '../payload.config'

/**
 * Delete images nothing points at, and files no image points at.
 *
 *   pnpm seed:prune-media          # report only
 *   pnpm seed:prune-media --apply  # actually delete
 *
 * Two different leaks, both silent:
 *
 *   1. **Orphaned rows.** `seed:prune` deletes a guide whose generator would
 *      no longer write it, and `seed:companies` moves a record out of a game
 *      collection - neither touches the image that was attached to it. The row
 *      stays in the library, in the admin's media list, on disk, referenced by
 *      nothing. Five hundred and sixty-four of them had built up.
 *
 *   2. **Stray files.** `db:reset` drops the database and rebuilds it, but
 *      `media/` is on disk and survives, so every rebuild leaves the previous
 *      run's files behind under names nothing will ever ask for again. That
 *      reached twenty thousand files and six gigabytes against one gigabyte
 *      actually in use.
 *
 * Dry by default. A pass that deletes files is not one to run by accident, and
 * the report alone is the useful half most of the time.
 */

/** Every field that can point at a media row, by collection. */
const UPLOAD_FIELD: Record<string, string> = {
  achievements: 'icon',
  authors: 'avatar',
  builds: 'image',
  characters: 'portrait',
  companies: 'logo',
  'court-activities': 'image',
  courts: 'image',
  endings: 'image',
  enemies: 'image',
  guides: 'image',
  items: 'image',
  maps: 'image',
  mechanics: 'image',
  perks: 'image',
  quests: 'image',
  regions: 'image',
  'skill-trees': 'image',
}

const APPLY = process.argv.includes('--apply')
const MB = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(0)} MB`

async function run(): Promise<void> {
  const payload = await getPayload({ config })

  // --- what is referenced -------------------------------------------------
  const used = new Set<string | number>()
  for (const [collection, field] of Object.entries(UPLOAD_FIELD)) {
    let docs
    try {
      docs = await payload.find({
        collection: collection as never,
        limit: 10000,
        depth: 0,
        ...(collection === 'guides' ? { draft: true } : {}),
      })
    } catch {
      continue
    }
    for (const doc of docs.docs as unknown as Record<string, unknown>[]) {
      if (doc[field]) used.add(doc[field] as string | number)
      // Guides carry a second, repeating slot.
      for (const entry of (doc['bodyImages'] as { image?: unknown }[] | undefined) ?? []) {
        if (entry?.image) used.add(entry.image as string | number)
      }
    }
  }

  // Games keep theirs in a group rather than at the top level.
  const games = await payload.find({ collection: 'games', limit: 100, depth: 0 })
  for (const game of games.docs as unknown as { theme?: { hero?: unknown; logo?: unknown } }[]) {
    if (game.theme?.hero) used.add(game.theme.hero as string | number)
    if (game.theme?.logo) used.add(game.theme.logo as string | number)
  }

  // --- 1. rows nothing points at -----------------------------------------
  const media = await payload.find({ collection: 'media', limit: 10000, depth: 0 })
  const rows = media.docs as unknown as {
    id: string | number
    filename?: string | null
    filesize?: number | null
    sizes?: Record<string, { filename?: string | null }>
  }[]

  const orphans = rows.filter((row) => !used.has(row.id))
  const orphanBytes = orphans.reduce((sum, row) => sum + (row.filesize ?? 0), 0)
  console.log(`media rows: ${rows.length}, referenced: ${rows.length - orphans.length}`)
  console.log(`orphaned rows: ${orphans.length} (${MB(orphanBytes)})`)

  if (APPLY) {
    for (const orphan of orphans) {
      await payload.delete({ collection: 'media', id: orphan.id })
    }
    console.log(`  deleted ${orphans.length} rows`)
  }

  // --- 2. files no row points at -----------------------------------------
  const kept = APPLY ? rows.filter((row) => used.has(row.id)) : rows
  const referenced = new Set<string>()
  for (const row of kept) {
    if (row.filename) referenced.add(row.filename)
    for (const size of Object.values(row.sizes ?? {})) {
      if (size?.filename) referenced.add(size.filename)
    }
  }

  const dir = path.resolve('media')
  if (!fs.existsSync(dir)) {
    console.log('\nno media/ directory on this machine — nothing to sweep')
    process.exit(0)
  }

  let strayCount = 0
  let strayBytes = 0
  let removed = 0
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith('.')) continue
    if (referenced.has(name)) continue
    const full = path.join(dir, name)
    let size = 0
    try {
      const stat = fs.statSync(full)
      if (!stat.isFile()) continue
      size = stat.size
    } catch {
      continue
    }
    strayCount += 1
    strayBytes += size
    if (APPLY) {
      try {
        fs.rmSync(full, { force: true })
        removed += 1
      } catch {
        // Windows will not delete a file another process has open. Leaving it
        // is harmless — the next run picks it up.
      }
    }
  }

  console.log(`\nfiles on disk with no row: ${strayCount} (${MB(strayBytes)})`)
  if (APPLY) console.log(`  deleted ${removed} files`)

  if (!APPLY) {
    console.log('\nnothing was deleted. Re-run with --apply to remove them.')
  }
  process.exit(0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})

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

  /*
    Every upload id anywhere in a record, however deeply nested.

    This walked the named fields and nothing else, and the named fields did not
    include `profile.poster` — so all fourteen game cover arts counted as
    orphans and `--apply` would have deleted them. It is the same blind spot
    `pnpm check:art` had, found the same way, and it is far more expensive
    here: that check reports, this one removes files.

    So the rule is the one that check ended on: walk the whole record rather
    than a list somebody has to remember to extend. An id that is a string or a
    number in any field, at any depth, is a reference.
  */
  const noteAll = (value: unknown, depth = 0): void => {
    if (depth > 8 || value === null || value === undefined) return
    if (typeof value === 'number') return void used.add(value)
    if (typeof value === 'string') {
      /* Upload ids here are numeric strings or uuids; ordinary prose is not an
         id and adding it to the set is harmless anyway — a false reference
         keeps a file, which errs towards not deleting. */
      if (value.length > 0 && value.length < 64) used.add(value)
      return
    }
    if (Array.isArray(value)) {
      for (const entry of value) noteAll(entry, depth + 1)
      return
    }
    if (typeof value === 'object') {
      for (const entry of Object.values(value as Record<string, unknown>)) {
        noteAll(entry, depth + 1)
      }
    }
  }
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

  /*
    Games keep art in two groups — `theme` (hero, capsule) and `profile`
    (poster) — so the whole record is walked rather than the two fields that
    were remembered. `pagination: false` because `limit: 100` was a ceiling
    nobody would notice passing.
  */
  const games = await payload.find({ collection: 'games', limit: 0, pagination: false, depth: 0 })
  for (const game of games.docs) noteAll(game)

  /* And the network-wide collections, which were not consulted at all. */
  for (const collection of ['companies', 'people', 'authors'] as const) {
    try {
      const docs = await payload.find({ collection, limit: 0, pagination: false, depth: 0 })
      for (const doc of docs.docs) noteAll(doc)
    } catch {
      /* A collection this deployment does not have is not an error. */
    }
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

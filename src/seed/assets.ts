import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getPayload } from 'payload'
import type { CollectionSlug, Payload } from 'payload'
import config from '../payload.config'

/**
 * Bulk-attach images to records by filename.
 *
 * Drop files into `assets/<collection>/<slug>.<ext>` and run `pnpm assets`.
 * The folder picks the collection, the filename picks the record. Attaching
 * four hundred images through the admin one at a time is not a real workflow;
 * this is.
 *
 *   assets/items/durandal.png         -> items, slug "durandal"
 *   assets/characters/lacra.jpg       -> characters, slug "lacra"
 *   assets/regions/laslea-glen.webp   -> regions, slug "laslea-glen"
 *
 * Existing images are left alone unless you pass --force.
 */

const dirname = path.dirname(fileURLToPath(import.meta.url))
const ASSET_DIR = path.resolve(dirname, '../../assets')
const FORCE = process.argv.includes('--force')

/** Folder name -> collection, and which field on that collection holds the image. */
const FOLDERS: Record<string, { collection: CollectionSlug; field: string }> = {
  items: { collection: 'items', field: 'image' },
  characters: { collection: 'characters', field: 'portrait' },
  perks: { collection: 'perks', field: 'image' },
  quests: { collection: 'quests', field: 'image' },
  endings: { collection: 'endings', field: 'image' },
  regions: { collection: 'regions', field: 'image' },
  enemies: { collection: 'enemies', field: 'image' },
  builds: { collection: 'builds', field: 'image' },
  courts: { collection: 'courts', field: 'image' },
  'court-activities': { collection: 'court-activities', field: 'image' },
  skills: { collection: 'skill-trees', field: 'image' },
}

const ALLOWED = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif'])

const PUBLISHER = 'The Blood of Dawnwalker © Rebel Wolves / Bandai Namco Entertainment'

/**
 * Where a given file came from, when something recorded it.
 *
 * The publisher owns the art either way, but an image lifted from a community
 * wiki was hosted and named by that wiki, and saying so is the difference
 * between crediting a source and quietly passing off someone else's work.
 * `tools/fetch-wiki-images.mjs` writes the manifest this reads.
 */
const wikiCredits = (): Map<string, string> => {
  const manifestPath = path.join(ASSET_DIR, '_library/wiki-images.json')
  if (!fs.existsSync(manifestPath)) return new Map()
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      files?: { file: string; page?: string }[]
    }
    const host = (url?: string) => {
      try {
        return url ? new URL(url).hostname.replace(/^www\./, '') : undefined
      } catch {
        return undefined
      }
    }
    return new Map(
      (manifest.files ?? [])
        .filter((entry) => entry.file)
        .map((entry) => [
          entry.file,
          host(entry.page) ? `${PUBLISHER}. Image via ${host(entry.page)}.` : PUBLISHER,
        ]),
    )
  } catch {
    return new Map()
  }
}

/** Filenames are the interface, so be forgiving about how they are written. */
const slugFromFilename = (filename: string): string =>
  path
    .basename(filename, path.extname(filename))
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

async function findBySlug(payload: Payload, collection: CollectionSlug, slug: string) {
  const result = await payload.find({
    collection,
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
  })
  return result.docs[0] as unknown as (Record<string, unknown> & { id: string | number }) | undefined
}

async function run(): Promise<void> {
  if (!fs.existsSync(ASSET_DIR)) {
    console.log(`No assets/ directory found at ${ASSET_DIR}.`)
    console.log('Create it and drop files in as assets/<collection>/<slug>.<ext> — see docs/ASSETS.md.')
    process.exit(0)
  }

  const credits = wikiCredits()
  const payload = await getPayload({ config })
  let attached = 0
  let skipped = 0
  const unmatched: string[] = []

  for (const folder of fs.readdirSync(ASSET_DIR)) {
    const target = FOLDERS[folder]
    const folderPath = path.join(ASSET_DIR, folder)
    if (!fs.statSync(folderPath).isDirectory()) continue
    // `_`-prefixed folders are working space, not collections — assets/_library
    // is the downloaded press material nothing is attached from. See
    // docs/ASSETS.md.
    if (folder.startsWith('_')) continue
    if (!target) {
      console.warn(`  ! assets/${folder} is not a known collection folder — skipped`)
      continue
    }

    for (const file of fs.readdirSync(folderPath)) {
      const ext = path.extname(file).toLowerCase()
      if (!ALLOWED.has(ext)) continue

      const slug = slugFromFilename(file)
      const record = await findBySlug(payload, target.collection, slug)
      if (!record) {
        unmatched.push(`${folder}/${file} (no ${target.collection} with slug "${slug}")`)
        continue
      }
      if (record[target.field] && !FORCE) {
        skipped++
        continue
      }

      try {
        const media = await payload.create({
          collection: 'media',
          filePath: path.join(folderPath, file),
          data: {
            alt: `${record.title ?? slug} — ${target.collection.replace(/-/g, ' ')}`,
            credit: credits.get(`${folder}/${file}`) ?? PUBLISHER,
          },
        })
        await payload.update({
          collection: target.collection,
          id: record.id,
          depth: 0,
          data: { [target.field]: media.id } as never,
        })
        attached++
        console.log(`  + ${target.collection}/${slug}`)
      } catch (error) {
        unmatched.push(`${folder}/${file} — upload failed: ${(error as Error).message}`)
      }
    }
  }

  console.log(`\nAttached ${attached}. Left alone ${skipped} that already had an image${FORCE ? '' : ' (use --force to replace)'}.`)
  if (unmatched.length > 0) {
    console.log(`\n${unmatched.length} file(s) matched no record:`)
    for (const line of unmatched.slice(0, 40)) console.log(`  - ${line}`)
    if (unmatched.length > 40) console.log(`  …and ${unmatched.length - 40} more`)
    console.log('\nCheck the slug against the record: the site URL is /<section>/<slug>.')
  }
  process.exit(0)
}

run().catch((error) => {
  console.error('Asset import failed:', error)
  process.exit(1)
})

import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { getPayload } from 'payload'
import config from '../payload.config'
import { mediaCredit } from '../lib/credit'

/**
 * Attach each wiki's cover art to its factsheet.
 *
 *   node tools/fetch-posters.mjs
 *   pnpm seed:posters
 *
 * The factsheet panel has had a `poster` field since it was built and nothing
 * ever filled it, so every wiki fell back to its hero image — a 1920x1080
 * store screenshot, in a frame shaped like a box. `tools/fetch-posters.mjs`
 * gets the portrait; this puts it on the record.
 *
 * ## The credit says which basis, not just who
 *
 * Every one of these is a non-free file uploaded to en.wikipedia under a
 * fair-use rationale. That is not the same as the CC BY-SA the harvested wiki
 * text arrives under, and printing them with the same credit line would be
 * claiming a licence that does not exist. So the stored credit names the
 * rightsholder, says what the file is, and says it is used for identification
 * — which is the claim actually being made — and the manifest keeps the file
 * page so anybody can check.
 *
 * Idempotent. A poster already attached is left alone unless `--force`.
 */

const POSTERS = path.resolve('assets/_posters')
const MANIFEST = path.join(POSTERS, 'posters.json')
const FORCE = process.argv.includes('--force')

type Entry = {
  file: string
  ext: string
  licence: string
  nonFree: boolean
  artist?: string
  credit?: string
  source: string
  article: string
  fetchedAt: string
}

async function run(): Promise<void> {
  if (!fs.existsSync(MANIFEST)) {
    console.log(`No ${MANIFEST}. Run \`node tools/fetch-posters.mjs\` first.`)
    process.exit(0)
  }
  const manifest: Record<string, Entry> = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
  const payload = await getPayload({ config })
  const games = await payload.find({ collection: 'games', limit: 100, depth: 0, sort: 'slug' })

  let attached = 0
  for (const game of games.docs as unknown as {
    id: string | number
    slug: string
    title: string
    publisher?: string | null
    developer?: string | null
    profile?: { poster?: unknown }
  }[]) {
    const entry = manifest[game.slug]
    if (!entry) {
      console.log(`  ${game.slug.padEnd(34)} no poster harvested`)
      continue
    }
    if (game.profile?.poster && !FORCE) {
      console.log(`  ${game.slug.padEnd(34)} already has one`)
      continue
    }

    const file = path.join(POSTERS, `${game.slug}.${entry.ext}`)
    if (!fs.existsSync(file)) {
      console.log(`  ${game.slug.padEnd(34)} ${path.basename(file)} is not on disk`)
      continue
    }

    const filename = `poster-${game.slug}.${entry.ext}`
    /*
      Whoever the file page credits, then the publisher, then the developer.
      The file page is the better source of the two — it is what the uploader
      had to name to justify the upload — and falling through to the game
      record rather than to nothing is what keeps a credit from reading "© its
      publisher" on a game whose publisher we know.
    */
    const holder = entry.artist || entry.credit || game.publisher || game.developer || null
    const credit = mediaCredit(`${game.title} cover art`, holder)

    const existing = await payload.find({
      collection: 'media',
      where: { filename: { equals: filename } },
      limit: 1,
      depth: 0,
    })

    let mediaId = existing.docs[0]?.id
    if (!mediaId) {
      try {
        const created = await payload.create({
          collection: 'media',
          data: {
            alt: `Cover art for ${game.title}`,
            credit,
          } as never,
          file: {
            data: fs.readFileSync(file),
            mimetype: entry.ext === 'png' ? 'image/png' : 'image/jpeg',
            name: filename,
            size: fs.statSync(file).size,
          },
        })
        mediaId = created.id
      } catch (error) {
        console.error(`  ${game.slug.padEnd(34)} upload failed: ${(error as Error).message}`)
        continue
      }
    }

    const current = await payload.findByID({ collection: 'games', id: game.id, depth: 0 })
    await payload.update({
      collection: 'games',
      id: game.id,
      data: {
        profile: {
          ...((current as { profile?: Record<string, unknown> }).profile ?? {}),
          poster: mediaId,
        },
      } as never,
    })
    attached += 1
    console.log(
      `  ${game.slug.padEnd(34)} ${filename.padEnd(42)} ${entry.licence}${entry.nonFree ? ' (non-free)' : ''}`,
    )
  }

  console.log(`\n${attached} posters attached.`)
  process.exit(0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})

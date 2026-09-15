import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { getPayload } from 'payload'
import config from '../payload.config'

/**
 * Gives Dawnwalker the same hero and capsule every other wiki has.
 *
 * The six new wikis get theirs from their store pages. Dawnwalker predates
 * that pipeline and had neither, which showed on the hub: its rail entry fell
 * back to a generic book icon while the other six carried their own art, and
 * its directory card opened straight at the title where the rest had a band of
 * key art above it.
 *
 * Its art is the decorative set already built into `public/art/` by
 * `tools/make-art.mjs` — the same images the section headers use, which
 * `docs/ASSETS.md` permits in exactly this placement: a backdrop for the game
 * as a whole, naming no specific place or person.
 */
async function run(): Promise<void> {
  const payload = await getPayload({ config })

  const found = await payload.find({
    collection: 'games',
    where: { slug: { equals: 'dawnwalker' } },
    limit: 1,
    depth: 0,
  })
  if (found.docs.length === 0) {
    console.log('No dawnwalker game record — run `pnpm seed` first.')
    process.exit(0)
  }
  const game = found.docs[0] as { id: number | string; theme?: { hero?: unknown; logo?: unknown } }

  const CREDIT =
    'The Blood of Dawnwalker © Rebel Wolves / Bandai Namco Entertainment. Used for identification and commentary.'

  const upload = async (file: string, filename: string, alt: string) => {
    const existing = await payload.find({
      collection: 'media',
      where: { filename: { equals: filename } },
      limit: 1,
      depth: 0,
    })
    if (existing.docs.length > 0) return existing.docs[0].id
    if (!fs.existsSync(file)) return null

    const created = await payload.create({
      collection: 'media',
      data: { alt, credit: CREDIT } as never,
      file: {
        data: fs.readFileSync(file),
        mimetype: 'image/webp',
        name: filename,
        size: fs.statSync(file).size,
      },
    })
    return created.id
  }

  const heroId = await upload(
    path.resolve('public/art/hero.webp'),
    'dawnwalker-hero.webp',
    'Key art for The Blood of Dawnwalker',
  )
  const logoId = await upload(
    path.resolve('public/art/quests.webp'),
    'dawnwalker-capsule.webp',
    'The Blood of Dawnwalker',
  )

  await payload.update({
    collection: 'games',
    id: game.id,
    data: {
      theme: {
        ...(game.theme ?? {}),
        ...(heroId ? { hero: heroId } : {}),
        ...(logoId ? { logo: logoId } : {}),
      },
    } as never,
    depth: 0,
  })

  console.log(`Dawnwalker: hero ${heroId ? 'set' : 'missing'}, capsule ${logoId ? 'set' : 'missing'}`)
  process.exit(0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
